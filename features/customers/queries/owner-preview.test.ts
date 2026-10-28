import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { OwnerActorContext } from "@/lib/auth/owner-access";

vi.mock("@/prisma/prisma", () => ({ prisma: {} }));
import { getOwnerPreviewCustomerHistory, getOwnerPreviewCustomers } from "./owner-preview";

const actor = { success: true, actorType: "OWNER", role: "OWNER", businessId: "business-a", businessSlug: "beautyfeel", userId: "owner-a", ownerId: 7 } as OwnerActorContext;
const mocks = { business: { findFirst: vi.fn() }, customer: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() }, booking: { count: vi.fn() }, availedService: { findMany: vi.fn() } };
const db = mocks as unknown as Pick<Prisma.TransactionClient, "business" | "customer" | "booking" | "availedService">;
const date = new Date("2026-09-01T08:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.business.findFirst.mockResolvedValue({ name: "BeautyFeel" });
  mocks.customer.findMany.mockResolvedValue([{ id: "c1", name: "Real Customer", email: null, phone: "639171234567", created_at: date, _count: { bookings: 1 }, bookings: [{ scheduled_at: date, created_at: date }] }]);
  mocks.customer.findFirst.mockResolvedValue({ id: "c1" });
  mocks.customer.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
  mocks.booking.count.mockResolvedValue(1);
  mocks.availedService.findMany.mockResolvedValue([]);
});

describe("owner-preview customer directory", () => {
  it("requires exact owner membership, bounds the page and selects no internal customer fields", async () => {
    const result = await getOwnerPreviewCustomers(actor, { search: "0917", segment: "returning", page: 2 }, db);
    expect(result).toEqual({ businessName: "BeautyFeel", page: 2, pageSize: 25, filteredCount: 1, totals: { customers: 2, newCustomers: 1, returningCustomers: 1, completedVisits: 1 }, customers: [{ id: "c1", name: "Real Customer", email: null, phone: "639171234567", joinedAt: date.toISOString(), completedVisits: 1, lastVisitAt: date.toISOString() }] });
    expect(mocks.business.findFirst.mock.calls[0][0].where).toEqual({ id: "business-a", slug: "beautyfeel", owners: { some: { id: 7, user_id: "owner-a", business_id: "business-a", user: { role: "OWNER" } } } });
    const args = mocks.customer.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ where: { business_id: "business-a", bookings: { some: { business_id: "business-a", status: "COMPLETED" } } }, take: 25, skip: 25 });
    expect(args.where.OR).toContainEqual({ phone: { contains: "917" } });
    expect(args.select).toEqual({ id: true, name: true, email: true, phone: true, created_at: true, _count: { select: { bookings: { where: { business_id: "business-a", status: "COMPLETED" } } } }, bookings: { where: { business_id: "business-a", status: "COMPLETED" }, orderBy: [{ scheduled_at: "desc" }, { created_at: "desc" }], take: 1, select: { scheduled_at: true, created_at: true } } });
    expect(JSON.stringify(result)).not.toContain("trust_tier");
    expect(JSON.stringify(result)).not.toContain("business_id");
  });

  it("returns no customer data when owner membership was removed", async () => {
    mocks.business.findFirst.mockResolvedValue(null);
    expect(await getOwnerPreviewCustomers(actor, { search: "", segment: "all", page: 1 }, db)).toBeNull();
    expect(mocks.customer.findMany).not.toHaveBeenCalled();
  });
});

describe("owner-preview customer history", () => {
  it("denies a foreign customer before service reads", async () => {
    mocks.customer.findFirst.mockResolvedValue(null);
    expect(await getOwnerPreviewCustomerHistory(actor, "foreign", db)).toBeNull();
    expect(mocks.availedService.findMany).not.toHaveBeenCalled();
  });

  it("returns at most 20 completed tenant-consistent services", async () => {
    mocks.availedService.findMany.mockResolvedValue(Array.from({ length: 21 }, (_, index) => ({ id: index + 1, completed_at: date, final_price: 400, service: { name: "Haircut" }, served_by: { user: { name: "Avery" } }, served_by_owner: null })));
    const result = await getOwnerPreviewCustomerHistory(actor, "c1", db);
    expect(result?.services).toHaveLength(20);
    expect(result?.hasMore).toBe(true);
    expect(result?.services[0]).toEqual({ id: 1, completedAt: date.toISOString(), service: "Haircut", provider: "Avery", amount: 400 });
    const args = mocks.availedService.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ take: 21, where: { status: "COMPLETED", service: { business_id: "business-a" }, booking: { business_id: "business-a", customer_id: "c1", status: "COMPLETED", customer: { business_id: "business-a" } } } });
    expect(args.where.booking.business).toMatchObject({ id: "business-a", owners: { some: { id: 7, user_id: "owner-a" } } });
  });
});
