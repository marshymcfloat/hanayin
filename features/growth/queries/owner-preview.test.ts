import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), booking: vi.fn(), customer: vi.fn() }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.resolve }));
vi.mock("@/prisma/prisma", () => ({ prisma: { booking: { findMany: mocks.booking }, customer: { findMany: mocks.customer } } }));

import { getOwnerGrowthPreviewData, resolveOwnerGrowthPreviewData } from "./owner-preview";

const context = { success: true, actorType: "OWNER", businessId: "tenant-a", businessSlug: "a", userId: "owner-a" } as never;
const now = new Date("2026-09-30T12:00:00.000Z");
const row = (date: string, total = 100, customer_id = "customer-a") => ({ id: Math.random(), status: "COMPLETED", grand_total: total, created_at: new Date(date), customer_id, availed_services: [{ final_price: total, service: { name: "Cut" } }] });

describe("owner growth preview query", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.booking.mockResolvedValue([]); mocks.customer.mockResolvedValue([]); });

  it("scopes both reads to the verified tenant and owner membership", async () => {
    await getOwnerGrowthPreviewData(context, "7d", now, { booking: { findMany: mocks.booking }, customer: { findMany: mocks.customer } } as never);
    expect(mocks.booking.mock.calls[0][0].where).toMatchObject({ business_id: "tenant-a", business: { owners: { some: { user_id: "owner-a", business_id: "tenant-a" } } } });
    expect(mocks.customer.mock.calls[0][0].where).toMatchObject({ business_id: "tenant-a", business: { owners: { some: { user_id: "owner-a", business_id: "tenant-a" } } } });
  });

  it("calculates range totals, prior-period deltas, trend, and service DTOs", async () => {
    mocks.booking.mockResolvedValue([row("2026-09-29T12:00:00Z", 250), row("2026-09-20T12:00:00Z", 100), row("2026-09-10T12:00:00Z", 50)]);
    mocks.customer.mockResolvedValue([{ id: "new", created_at: new Date("2026-09-29") }, { id: "old", created_at: new Date("2026-09-20") }]);
    const result = await getOwnerGrowthPreviewData(context, "7d", now, { booking: { findMany: mocks.booking }, customer: { findMany: mocks.customer } } as never);
    expect(result.from).toBe("2026-09-24T00:00:00.000Z");
    expect(result.kpis[0]).toEqual({ id: "revenue", value: 250, delta: 66.7 });
    expect(result.kpis[1]).toEqual({ id: "bookings", value: 1, delta: -50 });
    expect(result.topServices).toEqual([{ name: "Cut", bookings: 1, revenue: 250 }]);
    expect(result.trend).toHaveLength(7);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("returns stable zero and insufficient comparison states for empty data", async () => {
    const result = await getOwnerGrowthPreviewData(context, "30d", now, { booking: { findMany: mocks.booking }, customer: { findMany: mocks.customer } } as never);
    expect(result.kpis).toEqual([{ id: "revenue", value: 0, delta: null }, { id: "bookings", value: 0, delta: null }, { id: "customers", value: 0, delta: null }, { id: "retention", value: 0, delta: null }]);
    expect(result.topServices).toEqual([]);
  });

  it("does not query when owner access is denied", async () => {
    mocks.resolve.mockResolvedValue({ success: false, error: "Unauthorized" });
    await expect(resolveOwnerGrowthPreviewData("foreign", "owner-a", "7d")).resolves.toBeNull();
    expect(mocks.booking).not.toHaveBeenCalled(); expect(mocks.customer).not.toHaveBeenCalled();
  });
});
