import "server-only";

import { resolveTenantActorContext, type TenantActorContext } from "@/lib/auth/staff-access";
import { prisma } from "@/prisma/prisma";

export type GrowthPreviewRange = "7d" | "30d" | "90d";
export type GrowthPreviewData = {
  range: GrowthPreviewRange;
  from: string;
  to: string;
  kpis: { id: "revenue" | "bookings" | "customers" | "retention"; value: number; delta: number | null }[];
  trend: { label: string; revenue: number; bookings: number; customers: number }[];
  topServices: { name: string; bookings: number; revenue: number }[];
};

const ranges: Record<GrowthPreviewRange, number> = { "7d": 7, "30d": 30, "90d": 90 };
const completed = new Set(["COMPLETED"]);
const startOfDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);
const pct = (value: number, previous: number) => previous === 0 ? null : Math.round(((value - previous) / previous) * 1000) / 10;

export async function getOwnerGrowthPreviewData(
  context: Extract<TenantActorContext, { success: true; actorType: "OWNER" }>,
  range: GrowthPreviewRange = "30d",
  now = new Date(),
  db = prisma,
): Promise<GrowthPreviewData> {
  const days = ranges[range];
  const to = startOfDay(addDays(now, 1));
  const from = startOfDay(addDays(to, -days));
  const previousFrom = addDays(from, -days);
  const bookingWhere = { business_id: context.businessId, created_at: { gte: previousFrom, lt: to }, business: { owners: { some: { user_id: context.userId, business_id: context.businessId } } } };
  const [bookings, customers] = await Promise.all([
    db.booking.findMany({ where: bookingWhere, select: { id: true, status: true, grand_total: true, created_at: true, customer_id: true, availed_services: { select: { final_price: true, service: { select: { name: true } } } } } }),
    db.customer.findMany({ where: { business_id: context.businessId, created_at: { gte: previousFrom, lt: to }, business: { owners: { some: { user_id: context.userId, business_id: context.businessId } } } }, select: { id: true, created_at: true } }),
  ]);
  const current = bookings.filter((row) => row.created_at >= from && completed.has(row.status));
  const previous = bookings.filter((row) => row.created_at < from && completed.has(row.status));
  const revenue = (rows: typeof bookings) => rows.reduce((sum, row) => sum + row.availed_services.reduce((services, item) => services + item.final_price, 0), 0);
  const uniqueCustomers = (rows: typeof bookings) => new Set(rows.map((row) => row.customer_id).filter(Boolean)).size;
  const currentCustomers = customers.filter((row) => row.created_at >= from);
  const previousCustomers = customers.filter((row) => row.created_at < from);
  const trend = Array.from({ length: Math.min(days, 30) }, (_, index) => {
    const bucketFrom = addDays(from, Math.floor(index * days / Math.min(days, 30)));
    const bucketTo = addDays(from, Math.floor((index + 1) * days / Math.min(days, 30)));
    const rows = current.filter((row) => row.created_at >= bucketFrom && row.created_at < bucketTo);
    return { label: bucketFrom.toISOString().slice(5, 10), revenue: Math.round(revenue(rows)), bookings: rows.length, customers: uniqueCustomers(rows) };
  });
  const services = new Map<string, { bookings: number; revenue: number }>();
  for (const row of current) for (const service of row.availed_services) { const item = services.get(service.service.name) ?? { bookings: 0, revenue: 0 }; item.bookings++; item.revenue += service.final_price; services.set(service.service.name, item); }
  return { range, from: from.toISOString(), to: to.toISOString(), kpis: [
    { id: "revenue", value: Math.round(revenue(current)), delta: pct(revenue(current), revenue(previous)) },
    { id: "bookings", value: current.length, delta: pct(current.length, previous.length) },
    { id: "customers", value: currentCustomers.length, delta: pct(currentCustomers.length, previousCustomers.length) },
    { id: "retention", value: uniqueCustomers(current) ? Math.round((current.filter((row) => row.customer_id && previous.some((old) => old.customer_id === row.customer_id)).length / current.filter((row) => row.customer_id).length) * 100) : 0, delta: null },
  ], trend, topServices: [...services.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5).map(([name, value]) => ({ name, ...value, revenue: Math.round(value.revenue) })) };
}

export async function resolveOwnerGrowthPreviewData(businessSlug: string, userId: string, range?: GrowthPreviewRange) {
  const context = await resolveTenantActorContext(businessSlug, userId);
  if (!context.success || context.actorType !== "OWNER") return null;
  return getOwnerGrowthPreviewData(context, range);
}
