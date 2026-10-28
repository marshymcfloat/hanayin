import { describe, expect, it, vi } from "vitest";
import { getOwnerRedesignAnalytics, mapOwnerRedesignAnalytics } from "@/features/dashboard/queries/owner-redesign-analytics";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { CompletedServiceRow } from "@/features/dashboard/queries/owner-dashboard-preview";

const context = { success: true, actorType: "OWNER", ownerId: 1, userId: "u1", businessId: "b1", businessSlug: "studio" } as OwnerActorContext;
const now = new Date("2026-10-07T18:00:00Z");
function service(id: number, completed: string, price: number, customerId = "c1"): CompletedServiceRow {
  return { id, final_price: price, completed_at: new Date(completed), service_id: id, service: { name: "Same name" }, served_by: null, served_by_owner: { id: 1, business_id: "b1", user: { name: "Owner" } }, booking: { id: 1, grand_total: 900, customer_id: customerId, customer: { name: "Same name" } } } as CompletedServiceRow;
}
describe("owner redesign analytics", () => {
  it("rechecks membership before all protected queries", async () => {
    const db = { business: { findFirst: vi.fn().mockResolvedValue(null) }, booking: { findMany: vi.fn() }, availedService: { findMany: vi.fn() }, expense: { findMany: vi.fn() } };
    expect(await getOwnerRedesignAnalytics(context, { db: db as never, now })).toBeNull();
    expect(db.booking.findMany).not.toHaveBeenCalled();
    expect(db.business.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "b1", slug: "studio", owners: { some: expect.objectContaining({ user_id: "u1", business_id: "b1", user: { role: "OWNER" } }) } }) }));
  });
  it("scopes every query to the verified tenant and caps the date window, not the totals", async () => {
    const db = { business: { findFirst: vi.fn().mockResolvedValue({ name: "Studio" }) }, booking: { findMany: vi.fn().mockResolvedValue([]) }, availedService: { findMany: vi.fn().mockResolvedValue([]) }, expense: { findMany: vi.fn().mockResolvedValue([]) } };
    const data = await getOwnerRedesignAnalytics(context, { db: db as never, now });
    expect(data?.periods.Week.labels).toHaveLength(7);
    expect(data?.periods.Year.labels).toHaveLength(12);
    expect(db.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ business_id: "b1", created_at: { gte: new Date("2025-11-01T00:00:00+08:00"), lte: new Date("2026-10-08T23:59:59.999+08:00") } }) }));
    expect(db.availedService.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "COMPLETED", service: { business_id: "b1" }, booking: expect.objectContaining({ business_id: "b1", status: "COMPLETED" }) }) }));
    expect(db.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ business_id: "b1" }) }));
  });
  it("preserves cents, deduplicates visits and distinguishes duplicate names", () => {
    const rows = [service(1, "2026-10-08T01:00:00+08:00", 280.75), service(2, "2026-10-08T02:00:00+08:00", 100.25)];
    const data = mapOwnerRedesignAnalytics(context, "Studio", now, rows, [{ id: 1, created_at: now, status: "COMPLETED", grand_total: 900 }], [{ category: "RENT", amount: 25.50, date: now }]);
    expect(data.summary).toMatchObject({ revenue: 381, customers: 1, visits: 1, average: 381, bookings: 1 });
    expect(data.periods.Week.topServices).toHaveLength(2);
    expect(data.periods.Week.staff[0].count).toBe(1);
    expect(data.periods.Week.topCustomers[0]).toMatchObject({ visits: 1, amount: 381 });
    expect(data.expenses.find(item => item.label === "Rent")?.amount).toBe(25.50);
  });
  it("uses PH midnight, separates week/month/year and excludes old expense dates", () => {
    const rows = [service(1, "2026-10-01T12:00:00+08:00", 100), service(2, "2026-10-08T00:00:00+08:00", 200), service(3, "2026-09-30T23:59:00+08:00", 50)];
    const data = mapOwnerRedesignAnalytics(context, "Studio", now, rows, [], [{ category: "RENT", amount: 500, date: new Date("2026-09-30T12:00:00+08:00") }]);
    expect(data.periods.Week.revenue.reduce((a, b) => a + b, 0)).toBe(200);
    expect(data.periods.Month.revenue).toEqual([100, 200]);
    expect(data.periods.Year.revenue.reduce((a, b) => a + b, 0)).toBe(350);
    expect(data.expenses.every(item => item.amount === 0)).toBe(true);
  });
  it("returns genuine empty values and zero-safe summary", () => {
    const data = mapOwnerRedesignAnalytics(context, "Studio", now, [], [], []);
    expect(data.summary.average).toBe(0);
    expect(data.periods.Month.staff).toEqual([]);
    expect(data.periods.Year.topCustomers).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(/\bNaN\b|\bInfinity\b|sample/i);
  });
});
