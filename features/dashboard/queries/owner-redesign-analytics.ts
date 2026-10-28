import "server-only";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import { getStartOfDayPH, getEndOfDayPH, TIMEZONE_PH } from "@/lib/date-utils";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses/constants";
import { bookingHistorySelect, completedServiceSelect, ownerMembership, getMonthStart, getMonthEnd, buildDailyBuckets, buildMonthlyBuckets, type CompletedServiceRow } from "@/features/dashboard/queries/owner-dashboard-preview";
import type { InsightSpan, OwnerRedesignAnalytics, OwnerRedesignPeriod } from "@/features/dashboard/types/owner-redesign";

type Database = Pick<Prisma.TransactionClient, "business" | "booking" | "availedService" | "expense">;
type BookingRow = Prisma.BookingGetPayload<{ select: typeof bookingHistorySelect }>;
type ExpenseRow = { category: keyof typeof EXPENSE_CATEGORY_LABELS; amount: number; date: Date };
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const inside = (date: Date | null, start: Date, end: Date) => date !== null && date >= start && date <= end;
const sum = (rows: CompletedServiceRow[]) => round(rows.reduce((total, row) => total + row.final_price, 0));
const accepted = (row: BookingRow) => row.status === "ACCEPTED" || row.status === "COMPLETED";

export function mapOwnerRedesignAnalytics(context: OwnerActorContext, businessName: string, now: Date, services: CompletedServiceRow[], bookings: BookingRow[], expenses: ExpenseRow[]): OwnerRedesignAnalytics {
  const end = getEndOfDayPH(now);
  const month = getMonthStart(now);
  const previous = getMonthStart(now, -1);
  const previousEnd = new Date(Math.min(getMonthEnd(now, -1).getTime(), previous.getTime() + end.getTime() - month.getTime()));
  const starts: Record<InsightSpan, Date> = { Week: getStartOfDayPH(new Date(now.getTime() - 6 * 86400000)), Month: month, Year: getMonthStart(now, -11) };
  const periods = {} as Record<InsightSpan, OwnerRedesignPeriod>;
  for (const span of ["Week", "Month", "Year"] as const) {
    const start = starts[span];
    const rows = services.filter(row => inside(row.completed_at, start, end));
    const daily = buildDailyBuckets(start, end, span === "Week" ? { weekday: "short" } : { day: "numeric" });
    const buckets = span === "Year" ? buildMonthlyBuckets(start, end) : span === "Week" ? daily : daily.filter((_, index) => index % 7 === 0).map((bucket, index) => {
      const last = daily[Math.min(index * 7 + 6, daily.length - 1)];
      return { ...bucket, endAt: last.endAt, label: bucket.label === last.label ? bucket.label : `${bucket.label}–${last.label}` };
    });
    const serviceTotals = new Map<number, { id: number; name: string; revenue: number }>();
    const staffTotals = new Map<string, { id: string; name: string; revenue: number; visits: Set<number> }>();
    const customerTotals = new Map<string, { id: string; name: string; amount: number; visits: Set<number> }>();
    for (const row of rows) {
      const service = serviceTotals.get(row.service_id) ?? { id: row.service_id, name: row.service.name, revenue: 0 };
      service.revenue += row.final_price;
      serviceTotals.set(service.id, service);
      const provider = row.served_by?.business_id === context.businessId ? { id: `employee:${row.served_by.id}`, name: row.served_by.user.name } : row.served_by_owner?.business_id === context.businessId ? { id: `owner:${row.served_by_owner.id}`, name: row.served_by_owner.user.name } : null;
      if (provider) {
        const staff = staffTotals.get(provider.id) ?? { ...provider, revenue: 0, visits: new Set<number>() };
        staff.revenue += row.final_price;
        staff.visits.add(row.booking.id);
        staffTotals.set(staff.id, staff);
      }
      if (row.booking.customer_id && row.booking.customer) {
        const customer = customerTotals.get(row.booking.customer_id) ?? { id: row.booking.customer_id, name: row.booking.customer.name, amount: 0, visits: new Set<number>() };
        customer.amount += row.final_price;
        customer.visits.add(row.booking.id);
        customerTotals.set(customer.id, customer);
      }
    }
    const dates = new Intl.DateTimeFormat("en-PH", { timeZone: TIMEZONE_PH, month: "short", day: "numeric", year: "numeric" });
    periods[span] = {
      range: `${dates.format(start)} – ${dates.format(end)}`,
      labels: buckets.map(bucket => bucket.label),
      revenue: buckets.map(bucket => sum(rows.filter(row => inside(row.completed_at, bucket.startAt, bucket.endAt)))),
      bookings: buckets.map(bucket => bookings.filter(row => accepted(row) && inside(row.created_at, bucket.startAt, bucket.endAt)).length),
      topServices: [...serviceTotals.values()].map(row => ({ ...row, revenue: round(row.revenue) })).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      staff: [...staffTotals.values()].map(({ visits, ...row }) => ({ ...row, revenue: round(row.revenue), count: visits.size })).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      topCustomers: [...customerTotals.values()].map(({ visits, ...row }) => ({ ...row, amount: round(row.amount), visits: visits.size })).sort((a, b) => b.amount - a.amount).slice(0, 5),
    };
  }
  const current = services.filter(row => inside(row.completed_at, month, end));
  const visits = new Set(current.map(row => row.booking.id)).size;
  const revenue = sum(current);
  return {
    generatedAt: now.toISOString(), business: { name: businessName, slug: context.businessSlug }, periods,
    summary: {
      revenue, previousRevenue: sum(services.filter(row => inside(row.completed_at, previous, previousEnd))),
      bookings: bookings.filter(row => accepted(row) && inside(row.created_at, month, end)).length,
      previousBookings: bookings.filter(row => accepted(row) && inside(row.created_at, previous, previousEnd)).length,
      customers: new Set(current.map(row => row.booking.customer_id).filter(Boolean)).size,
      visits, average: visits ? round(revenue / visits) : 0,
    },
    expenses: Object.entries(EXPENSE_CATEGORY_LABELS).map(([category, label]) => ({ label, amount: round(expenses.filter(row => row.category === category && inside(row.date, month, end)).reduce((total, row) => total + row.amount, 0)) })),
  };
}

export async function getOwnerRedesignAnalytics(context: OwnerActorContext, options: { now?: Date; db?: Database } = {}): Promise<OwnerRedesignAnalytics | null> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const membership = { owners: { some: ownerMembership(context) } };
  const business = await db.business.findFirst({ where: { id: context.businessId, slug: context.businessSlug, ...membership }, select: { name: true } });
  if (!business) return null;
  const dates = { gte: getMonthStart(now, -11), lte: getEndOfDayPH(now) };
  const [bookings, services, expenses] = await Promise.all([
    db.booking.findMany({ where: { business_id: context.businessId, business: membership, created_at: dates }, select: bookingHistorySelect }),
    db.availedService.findMany({
      where: { status: "COMPLETED", completed_at: dates, service: { business_id: context.businessId },
        OR: [{ package_id: null }, { package: { business_id: context.businessId } }],
        booking: { business_id: context.businessId, status: "COMPLETED", business: membership, OR: [{ customer_id: null }, { customer: { business_id: context.businessId } }] } },
      select: completedServiceSelect,
    }),
    db.expense.findMany({ where: { business_id: context.businessId, business: membership, date: { gte: getMonthStart(now), lte: dates.lte } }, select: { category: true, amount: true, date: true } }),
  ]);
  return mapOwnerRedesignAnalytics(context, business.name, now, services, bookings, expenses);
}
