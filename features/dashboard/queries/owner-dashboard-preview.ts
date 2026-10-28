import "server-only";

import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import {
  getTenantOwnerClaimedServiceQueue,
  getTenantPendingServiceQueue,
} from "@/features/dashboard/queries/service-queues";
import type { OwnerDashboardPreviewReadModel } from "@/features/dashboard/types/owner-dashboard-preview";
import type { OwnerDashboardPreviewRange } from "@/features/dashboard/types/owner-dashboard-preview";
import {
  resolveTenantActorContext,
  type TenantActorContext,
} from "@/lib/auth/staff-access";
import {
  getCurrentDateTimePH,
  getEndOfDayPH,
  getStartOfDayPH,
  TIMEZONE_PH,
} from "@/lib/date-utils";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses/constants";
import { getTodayOpportunityViews } from "@/lib/services/growth/opportunities";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

type OwnerContext = Extract<
  TenantActorContext,
  { success: true; actorType: "OWNER" }
>;

type DashboardDatabase = Pick<
  Prisma.TransactionClient,
  "availedService" | "booking" | "business" | "expense" | "payslip"
>;

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_BOOKING_STATUSES = new Set(["ACCEPTED", "COMPLETED"]);

export const bookingHistorySelect = {
  id: true,
  status: true,
  grand_total: true,
  created_at: true,
} satisfies Prisma.BookingSelect;

export const completedServiceSelect = {
  id: true,
  final_price: true,
  completed_at: true,
  service_id: true,
  service: { select: { name: true } },
  served_by: {
    select: {
      id: true,
      business_id: true,
      profile: true,
      user: { select: { name: true } },
    },
  },
  served_by_owner: {
    select: {
      id: true,
      business_id: true,
      user: { select: { name: true } },
    },
  },
  booking: {
    select: {
      id: true,
      grand_total: true,
      customer_id: true,
      customer: { select: { name: true } },
    },
  },
} satisfies Prisma.AvailedServiceSelect;

export const todayBookingSelect = {
  id: true,
  status: true,
  scheduled_at: true,
  estimated_end: true,
  grand_total: true,
  amount_paid: true,
  downpayment: true,
  customer_label: true,
  customer: { select: { name: true, phone: true } },
  availed_services: {
    select: {
      status: true,
      scheduled_at: true,
      service: { select: { name: true, duration: true } },
      served_by: {
        select: { business_id: true, user: { select: { name: true } } },
      },
      served_by_owner: {
        select: { business_id: true, user: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.BookingSelect;

export type CompletedServiceRow = Prisma.AvailedServiceGetPayload<{
  select: typeof completedServiceSelect;
}>;
export type TodayBookingRow = Prisma.BookingGetPayload<{
  select: typeof todayBookingSelect;
}>;
export type ExpenseRow = { amount: number; category: keyof typeof EXPENSE_CATEGORY_LABELS; date: Date };
export type PayrollRow = { total_salary: number; ending_date: Date };

type TimeBucket = {
  key: string;
  label: string;
  startAt: Date;
  endAt: Date;
};

function getPhDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_PH,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number.parseInt(
      parts.find((part) => part.type === "year")?.value ?? "1970",
      10,
    ),
    month: Number.parseInt(
      parts.find((part) => part.type === "month")?.value ?? "1",
      10,
    ),
    day: Number.parseInt(
      parts.find((part) => part.type === "day")?.value ?? "1",
      10,
    ),
  };
}

function toPhDate(year: number, month: number, day: number, endOfDay = false) {
  const normalized = new Date(Date.UTC(year, month - 1, day));
  const normalizedYear = normalized.getUTCFullYear();
  const normalizedMonth = normalized.getUTCMonth() + 1;
  const normalizedDay = normalized.getUTCDate();
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";

  return new Date(
    `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}-${String(normalizedDay).padStart(2, "0")}T${time}+08:00`,
  );
}

export function getMonthStart(date: Date, monthOffset = 0) {
  const { year, month } = getPhDateParts(date);
  return toPhDate(year, month + monthOffset, 1);
}

export function getMonthEnd(date: Date, monthOffset = 0) {
  return new Date(getMonthStart(date, monthOffset + 1).getTime() - 1);
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? round((numerator / denominator) * 100) : 0;
}

function inRange(date: Date | null, startAt: Date, endAt: Date) {
  if (!date) return false;
  const value = date.getTime();
  return value >= startAt.getTime() && value <= endAt.getTime();
}

function formatPercentChange(current: number, previous: number) {
  if (previous === 0) return "Current month to date";
  const value = round(((current - previous) / Math.abs(previous)) * 100);
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}% from prior period`;
}

export function buildDailyBuckets(
  startAt: Date,
  endAt: Date,
  label: Intl.DateTimeFormatOptions,
) {
  const buckets: TimeBucket[] = [];
  for (
    let cursor = new Date(startAt);
    cursor.getTime() <= endAt.getTime();
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const bucketStart = getStartOfDayPH(cursor);
    const bucketEnd = getEndOfDayPH(cursor);
    const key = bucketStart.toISOString();
    buckets.push({
      key,
      label: new Intl.DateTimeFormat("en-PH", {
        timeZone: TIMEZONE_PH,
        ...label,
      }).format(bucketStart),
      startAt: bucketStart,
      endAt: bucketEnd.getTime() > endAt.getTime() ? endAt : bucketEnd,
    });
  }
  return buckets;
}

export function buildMonthlyBuckets(startAt: Date, endAt: Date) {
  const buckets: TimeBucket[] = [];
  let cursor = getMonthStart(startAt);
  while (cursor.getTime() <= endAt.getTime()) {
    const bucketEnd = getMonthEnd(cursor);
    buckets.push({
      key: cursor.toISOString(),
      label: new Intl.DateTimeFormat("en-PH", {
        timeZone: TIMEZONE_PH,
        month: "short",
      }).format(cursor),
      startAt: cursor,
      endAt: bucketEnd.getTime() > endAt.getTime() ? endAt : bucketEnd,
    });
    cursor = getMonthStart(cursor, 1);
  }
  return buckets;
}

export function buildFinancialPoints(
  buckets: TimeBucket[],
  services: Array<{ final_price: number; completed_at: Date | null }>,
  expenses: Array<{ amount: number; date: Date }>,
  payroll: PayrollRow[],
) {
  return buckets.map((bucket) => {
    const revenue = services.reduce(
      (sum, row) =>
        inRange(row.completed_at, bucket.startAt, bucket.endAt)
          ? sum + row.final_price
          : sum,
      0,
    );
    const loggedExpenses = expenses.reduce(
      (sum, row) =>
        inRange(row.date, bucket.startAt, bucket.endAt)
          ? sum + row.amount
          : sum,
      0,
    );
    const payrollExpenses = payroll.reduce(
      (sum, row) =>
        inRange(row.ending_date, bucket.startAt, bucket.endAt)
          ? sum + row.total_salary
          : sum,
      0,
    );
    const totalExpenses = loggedExpenses + payrollExpenses;

    return {
      period: bucket.label,
      revenue: round(revenue),
      expenses: round(totalExpenses),
      cashflow: round(revenue - totalExpenses),
    };
  });
}

function toRankedItems(
  rows: Array<{ name: string; detail: string; value: number }>,
  limit = 4,
) {
  const ordered = rows
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, limit);
  const total = ordered.reduce((sum, row) => sum + row.value, 0);

  return ordered.map((row) => ({
    ...row,
    value: round(row.value),
    share: percent(row.value, total),
  }));
}

function formatDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (hours === 0) return `${remainder} min`;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

export function formatTime(date: Date | null) {
  if (!date) return "Unscheduled";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIMEZONE_PH,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatStaffRole(profile: string) {
  if (profile === "MANAGER") return "Manager";
  if (profile === "CASHIER") return "Cashier";
  return "Staff";
}

export function toTodayBooking(row: TodayBookingRow, businessId: string) {
  const services = row.availed_services;
  const serviceNames = [...new Set(services.map((item) => item.service.name))];
  const providerNames = new Set<string>();
  for (const service of services) {
    if (service.served_by?.business_id === businessId) {
      providerNames.add(service.served_by.user.name);
    }
    if (service.served_by_owner?.business_id === businessId) {
      providerNames.add(service.served_by_owner.user.name);
    }
  }

  const startAt = row.scheduled_at ?? services[0]?.scheduled_at ?? null;
  const durationMinutes =
    startAt && row.estimated_end
      ? (row.estimated_end.getTime() - startAt.getTime()) / 60_000
      : services.reduce((sum, item) => sum + (item.service.duration ?? 0), 0);
  const inService = services.some((item) => item.status === "SERVING");

  return {
    id: row.id,
    time: formatTime(startAt),
    customer: row.customer?.name ?? row.customer_label ?? "Walk-in",
    service: serviceNames.join(", ") || "Service",
    staff: [...providerNames].join(", ") || "Unassigned",
    status: inService
      ? ("In service" as const)
      : row.status === "HOLD"
        ? ("Pending" as const)
        : ("Confirmed" as const),
    phone: row.customer?.phone ?? null,
    duration: formatDuration(durationMinutes),
    total: round(row.grand_total),
    deposit: round(row.downpayment ?? row.amount_paid),
  };
}

export function ownerMembership(context: OwnerContext): Prisma.OwnerWhereInput {
  return {
    id: context.ownerId,
    business_id: context.businessId,
    user_id: context.userId,
    user: { role: "OWNER" },
  };
}

export async function getOwnerDashboardPreviewReadModel(
  context: OwnerContext,
  options: { now?: Date; db?: DashboardDatabase } = {},
): Promise<OwnerDashboardPreviewReadModel | null> {
  const db = options.db ?? prisma;
  const now = options.now ?? getCurrentDateTimePH();
  const endOfToday = getEndOfDayPH(now);
  const previousMonthStart = getMonthStart(now, -1);
  const yearStart = getMonthStart(now, -11);
  const membership = ownerMembership(context);

  const business = await db.business.findFirst({
    where: {
      id: context.businessId,
      slug: context.businessSlug,
      owners: { some: membership },
    },
    select: { name: true },
  });

  if (!business) return null;

  const entitlementsPromise = getBusinessEntitlementsBySlug(
    context.businessSlug,
  );
  const growthOpportunitiesPromise = entitlementsPromise.then((entitlements) =>
    entitlements.growth
      ? getTodayOpportunityViews(context.businessId)
      : Promise.resolve([]),
  );

  const [
    bookingHistory,
    completedServices,
    todayBookings,
    expenses,
    payroll,
    pendingQueue,
    claimedQueue,
    entitlements,
    growthOpportunities,
  ] = await Promise.all([
    db.booking.findMany({
      where: {
        business_id: context.businessId,
        created_at: { gte: previousMonthStart, lte: endOfToday },
        business: { owners: { some: membership } },
      },
      select: bookingHistorySelect,
    }),
    db.availedService.findMany({
      where: {
        status: "COMPLETED",
        completed_at: { gte: yearStart, lte: endOfToday },
        booking: {
          business_id: context.businessId,
          status: "COMPLETED",
          business: { owners: { some: membership } },
          OR: [
            { customer_id: null },
            { customer: { business_id: context.businessId } },
          ],
        },
        service: { business_id: context.businessId },
        OR: [
          { package_id: null },
          { package: { business_id: context.businessId } },
        ],
      },
      select: completedServiceSelect,
      orderBy: { completed_at: "asc" },
    }),
    db.booking.findMany({
      where: {
        business_id: context.businessId,
        status: { in: ["HOLD", "ACCEPTED"] },
        scheduled_at: {
          gte: getStartOfDayPH(now),
          lte: endOfToday,
        },
        business: { owners: { some: membership } },
        OR: [
          { customer_id: null },
          { customer: { business_id: context.businessId } },
        ],
        availed_services: {
          every: {
            service: { business_id: context.businessId },
            OR: [
              { package_id: null },
              { package: { business_id: context.businessId } },
            ],
          },
        },
      },
      select: todayBookingSelect,
      orderBy: { scheduled_at: "asc" },
      take: 8,
    }),
    db.expense.findMany({
      where: {
        business_id: context.businessId,
        date: { gte: yearStart, lte: endOfToday },
        business: { owners: { some: membership } },
      },
      select: { amount: true, category: true, date: true },
      orderBy: { date: "asc" },
    }),
    db.payslip.findMany({
      where: {
        status: "PAID",
        ending_date: { gte: yearStart, lte: endOfToday },
        employee: {
          business_id: context.businessId,
          business: { owners: { some: membership } },
        },
      },
      select: { total_salary: true, ending_date: true },
      orderBy: { ending_date: "asc" },
    }),
    getTenantPendingServiceQueue(context, { take: 20 }),
    getTenantOwnerClaimedServiceQueue(context, { take: 20 }),
    entitlementsPromise,
    growthOpportunitiesPromise,
  ]);

  return mapOwnerDashboardPreviewReadModel(context, {
    now,
    businessName: business.name,
    bookingHistory,
    completedServices,
    todayBookings,
    expenses,
    payroll,
    pendingQueue,
    claimedQueue,
    entitlements,
    growthOpportunities,
  });
}

export type OwnerDashboardPreviewSources = {
  now: Date;
  businessName: string;
  bookingHistory: Prisma.BookingGetPayload<{ select: typeof bookingHistorySelect }>[];
  completedServices: CompletedServiceRow[];
  todayBookings: TodayBookingRow[];
  expenses: ExpenseRow[];
  payroll: PayrollRow[];
  pendingQueue: Awaited<ReturnType<typeof getTenantPendingServiceQueue>>;
  claimedQueue: Awaited<ReturnType<typeof getTenantOwnerClaimedServiceQueue>>;
  entitlements?: Awaited<ReturnType<typeof getBusinessEntitlementsBySlug>>;
  growthOpportunities?: Awaited<ReturnType<typeof getTodayOpportunityViews>>;
  ranges?: readonly OwnerDashboardPreviewRange[];
};

export function mapOwnerDashboardPreviewReadModel(
  context: OwnerContext,
  sources: OwnerDashboardPreviewSources,
): OwnerDashboardPreviewReadModel {
  const {
    now, businessName, bookingHistory, completedServices, todayBookings,
    expenses, payroll, pendingQueue, claimedQueue,
  } = sources;
  const entitlements = sources.entitlements;
  const growthOpportunities = sources.growthOpportunities ?? [];
  const endOfToday = getEndOfDayPH(now);
  const currentMonthStart = getMonthStart(now);
  const previousMonthStart = getMonthStart(now, -1);
  const previousMonthEnd = getMonthEnd(now, -1);
  const elapsedCurrentMonth = endOfToday.getTime() - currentMonthStart.getTime();
  const previousPeriodEnd = new Date(Math.min(previousMonthEnd.getTime(), previousMonthStart.getTime() + elapsedCurrentMonth));
  const yearStart = getMonthStart(now, -11);
  const sixMonthStart = getMonthStart(now, -5);
  const sevenDayStart = getStartOfDayPH(new Date(now.getTime() - 6 * DAY_MS));

  const currentBookings = bookingHistory.filter((row) =>
    inRange(row.created_at, currentMonthStart, endOfToday),
  );
  const previousBookings = bookingHistory.filter((row) =>
    inRange(row.created_at, previousMonthStart, previousPeriodEnd),
  );
  const currentServices = completedServices.filter((row) =>
    inRange(row.completed_at, currentMonthStart, endOfToday),
  );
  const previousServices = completedServices.filter((row) =>
    inRange(row.completed_at, previousMonthStart, previousPeriodEnd),
  );
  const currentExpenses = expenses.filter((row) =>
    inRange(row.date, currentMonthStart, endOfToday),
  );
  const previousExpenses = expenses.filter((row) =>
    inRange(row.date, previousMonthStart, previousPeriodEnd),
  );
  const currentPayroll = payroll.filter((row) =>
    inRange(row.ending_date, currentMonthStart, endOfToday),
  );
  const previousPayroll = payroll.filter((row) =>
    inRange(row.ending_date, previousMonthStart, previousPeriodEnd),
  );

  const currentRevenue = currentServices.reduce(
    (sum, row) => sum + row.final_price,
    0,
  );
  const previousRevenue = previousServices.reduce(
    (sum, row) => sum + row.final_price,
    0,
  );
  const currentOperatingExpenses =
    currentExpenses.reduce((sum, row) => sum + row.amount, 0) +
    currentPayroll.reduce((sum, row) => sum + row.total_salary, 0);
  const previousOperatingExpenses =
    previousExpenses.reduce((sum, row) => sum + row.amount, 0) +
    previousPayroll.reduce((sum, row) => sum + row.total_salary, 0);
  const currentIncome = currentRevenue - currentOperatingExpenses;
  const previousIncome = previousRevenue - previousOperatingExpenses;
  const currentCompletedBookings = currentBookings.filter(
    (row) => row.status === "COMPLETED",
  );
  const currentOperationalBookings = currentBookings.filter((row) =>
    ACTIVE_BOOKING_STATUSES.has(row.status),
  );
  const previousCompletedBookings = previousBookings.filter(
    (row) => row.status === "COMPLETED",
  );
  const currentAverage =
    currentCompletedBookings.length > 0
      ? currentCompletedBookings.reduce(
          (sum, row) => sum + row.grand_total,
          0,
        ) / currentCompletedBookings.length
      : 0;
  const previousAverage =
    previousCompletedBookings.length > 0
      ? previousCompletedBookings.reduce(
          (sum, row) => sum + row.grand_total,
          0,
        ) / previousCompletedBookings.length
      : 0;

  const expenseCategoryTotals = new Map<string, number>();
  for (const expense of currentExpenses) {
    const name = EXPENSE_CATEGORY_LABELS[expense.category];
    expenseCategoryTotals.set(
      name,
      (expenseCategoryTotals.get(name) ?? 0) + expense.amount,
    );
  }
  const payrollTotal = currentPayroll.reduce(
    (sum, row) => sum + row.total_salary,
    0,
  );
  const expenseBreakdown = toRankedItems([
    ...(payrollTotal > 0
      ? [
          {
            name: "Team payroll",
            detail: `${currentPayroll.length} paid payslip${currentPayroll.length === 1 ? "" : "s"}`,
            value: payrollTotal,
          },
        ]
      : []),
    ...[...expenseCategoryTotals.entries()].map(([name, value]) => ({
      name,
      detail: "Logged operating expenses",
      value,
    })),
  ]);

  const serviceTotals = new Map<
    number,
    { name: string; count: number; value: number }
  >();
  for (const row of currentServices) {
    const current = serviceTotals.get(row.service_id) ?? {
      name: row.service.name,
      count: 0,
      value: 0,
    };
    current.count += 1;
    current.value += row.final_price;
    serviceTotals.set(row.service_id, current);
  }
  const topServices = toRankedItems(
    [...serviceTotals.values()].map((row) => ({
      name: row.name,
      detail: `${row.count} completed service${row.count === 1 ? "" : "s"}`,
      value: row.value,
    })),
    3,
  );

  const completedBookingsById = new Map<
    number,
    CompletedServiceRow["booking"]
  >();
  for (const row of currentServices) {
    completedBookingsById.set(row.booking.id, row.booking);
  }
  const customerTotals = new Map<
    string,
    { name: string; visits: number; value: number }
  >();
  for (const booking of completedBookingsById.values()) {
    if (!booking.customer_id || !booking.customer) continue;
    const current = customerTotals.get(booking.customer_id) ?? {
      name: booking.customer.name,
      visits: 0,
      value: 0,
    };
    current.visits += 1;
    current.value += booking.grand_total;
    customerTotals.set(booking.customer_id, current);
  }
  const topCustomers = toRankedItems(
    [...customerTotals.values()].map((row) => ({
      name: row.name,
      detail: `${row.visits} visit${row.visits === 1 ? "" : "s"} · avg ₱${Math.round(row.value / row.visits).toLocaleString("en-PH")}`,
      value: row.value,
    })),
    3,
  );

  const staffTotals = new Map<
    string,
    { name: string; role: string; bookings: Set<number>; revenue: number }
  >();
  for (const row of currentServices) {
    const employee =
      row.served_by?.business_id === context.businessId
        ? row.served_by
        : null;
    const owner =
      row.served_by_owner?.business_id === context.businessId
        ? row.served_by_owner
        : null;
    const id = employee ? `employee:${employee.id}` : owner ? `owner:${owner.id}` : null;
    if (!id) continue;
    const current = staffTotals.get(id) ?? {
      name: employee?.user.name ?? owner?.user.name ?? "Team member",
      role: employee ? formatStaffRole(employee.profile) : "Owner",
      bookings: new Set<number>(),
      revenue: 0,
    };
    current.bookings.add(row.booking.id);
    current.revenue += row.final_price;
    staffTotals.set(id, current);
  }
  const staff = [...staffTotals.entries()]
    .map(([id, row]) => ({
      id,
      name: row.name,
      role: row.role,
      bookings: row.bookings.size,
      revenue: round(row.revenue),
      utilization: null,
    }))
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 3);

  const queue = [
    ...pendingQueue.map((item) => ({
      id: item.id,
      service: item.package?.name ?? item.service.name,
      customer: item.booking.customer?.name ?? "Walk-in",
      time: formatTime(item.scheduled_at ?? item.booking.scheduled_at),
      price: round(item.price),
      status: "PENDING" as const,
    })),
    ...claimedQueue.map((item) => ({
      id: item.id,
      service: item.package?.name ?? item.service.name,
      customer: item.booking.customer?.name ?? "Walk-in",
      time: formatTime(item.scheduled_at ?? item.booking.scheduled_at),
      price: round(item.final_price),
      status: item.status === "SERVING" ? ("SERVING" as const) : ("CLAIMED" as const),
    })),
  ].slice(0, 20);

  const growthOpportunity = entitlements?.growth
    ? growthOpportunities[0]
    : null;

  return {
    generatedAt: now.toISOString(),
    business: { slug: context.businessSlug, name: businessName },
    kpis: [
      {
        id: "revenue",
        label: "Monthly revenue",
        value: round(currentRevenue),
        format: "currency",
        change: formatPercentChange(currentRevenue, previousRevenue),
      },
      {
        id: "expenses",
        label: "Operating expenses",
        value: round(currentOperatingExpenses),
        format: "currency",
        change:
          currentRevenue > 0
            ? `${percent(currentOperatingExpenses, currentRevenue)}% of revenue`
            : formatPercentChange(
                currentOperatingExpenses,
                previousOperatingExpenses,
              ),
      },
      {
        id: "income",
        label: "Net income",
        value: round(currentIncome),
        format: "currency",
        change: formatPercentChange(currentIncome, previousIncome),
      },
      {
        id: "completion",
        label: "Booking completion",
        value: percent(
          currentCompletedBookings.length,
          currentOperationalBookings.length,
        ),
        format: "percent",
        change: `${currentCompletedBookings.length} of ${currentOperationalBookings.length} bookings`,
      },
      {
        id: "average",
        label: "Average booking",
        value: round(currentAverage),
        format: "currency",
        change:
          previousAverage > 0
            ? `${currentAverage - previousAverage >= 0 ? "+" : "−"}₱${Math.abs(Math.round(currentAverage - previousAverage)).toLocaleString("en-PH")} from prior period`
            : "Current month to date",
      },
    ],
    financials: {
      "7d": sources.ranges && !sources.ranges.includes("7d") ? [] : buildFinancialPoints(
        buildDailyBuckets(sevenDayStart, endOfToday, { weekday: "short" }),
        completedServices,
        expenses,
        payroll,
      ),
      month: sources.ranges && !sources.ranges.includes("month") ? [] : buildFinancialPoints(
        buildDailyBuckets(currentMonthStart, endOfToday, { day: "numeric" }),
        completedServices,
        expenses,
        payroll,
      ),
      "6m": sources.ranges && !sources.ranges.includes("6m") ? [] : buildFinancialPoints(
        buildMonthlyBuckets(sixMonthStart, endOfToday),
        completedServices,
        expenses,
        payroll,
      ),
      "1y": sources.ranges && !sources.ranges.includes("1y") ? [] : buildFinancialPoints(
        buildMonthlyBuckets(yearStart, endOfToday),
        completedServices,
        expenses,
        payroll,
      ),
    },
    bookings: todayBookings.map((row) =>
      toTodayBooking(row, context.businessId),
    ),
    expenseBreakdown,
    topServices,
    topCustomers,
    staff,
    queue,
    growth: {
      enabled: entitlements?.growth ?? false,
      opportunity: growthOpportunity
        ? {
            id: growthOpportunity.id,
            reason: growthOpportunity.reason,
            confidence: growthOpportunity.confidence,
            timeWindowStart: growthOpportunity.timeWindowStart,
            timeWindowEnd: growthOpportunity.timeWindowEnd,
            recommendedOfferTypes: growthOpportunity.recommendedOfferTypes,
          }
        : null,
      occupancy: null,
    },
    availability: {
      staffUtilization: "unavailable",
      growthOccupancy: "unavailable",
    },
  };
}

export async function resolveOwnerDashboardPreviewReadModel(
  businessSlug: string,
  userId: string,
) {
  const context = await resolveTenantActorContext(businessSlug, userId);
  if (!context.success || context.actorType !== "OWNER") return null;
  return getOwnerDashboardPreviewReadModel(context);
}
