import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBookingPolicy, updateBookingPolicy } from "./booking-policy";
import { DEFAULT_BOOKING_POLICY } from "@/lib/types/booking-policy";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), owner: vi.fn(), read: vi.fn(), update: vi.fn(), updateMany: vi.fn(), audit: vi.fn(), transaction: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireTenantWriteAccess: mocks.auth, requireOwnerTenantWriteAccess: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.read, update: mocks.update, updateMany: mocks.updateMany }, owner: { findFirst: mocks.owner }, $transaction: mocks.transaction } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "fixture-slug", session: { user: { id: "fixture-user" } } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", role: "OWNER", businessId: "fixture-business", businessSlug: "fixture-slug", userId: "fixture-user", ownerId: 5 });
  mocks.owner.mockResolvedValue({ id: 5 });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async callback => callback({ business: { updateMany: mocks.updateMany }, auditLog: { create: mocks.audit } }));
});

describe("booking policy compatibility", () => {
  it("publicly reads only policy fields and retains defaults/normalization", async () => {
    mocks.read.mockResolvedValue({ booking_horizon_days: 7.9, booking_min_lead_minutes: -1, booking_slot_interval_minutes: 1, downpayment_percentage: 200, public_default_payment_type: "DOWNPAYMENT", timezone: "Asia/Manila" });
    expect(await getBookingPolicy("fixture-slug")).toEqual({ ...DEFAULT_BOOKING_POLICY, bookingHorizonDays: 7, minLeadMinutes: 0, slotIntervalMinutes: 5, downpaymentPercentage: 100, defaultPublicPaymentType: "DOWNPAYMENT" });
    expect(mocks.read.mock.calls[0][0].where).toEqual({ slug: "fixture-slug" });
    expect(mocks.read.mock.calls[0][0].select).not.toHaveProperty("hashed_password");
  });

  it("retains numeric clamping, partial-input defaults, and the three cache paths", async () => {
    expect(await updateBookingPolicy("fixture-slug", { bookingHorizonDays: 0, minLeadMinutes: 7.9, slotIntervalMinutes: 1, downpaymentPercentage: 200 })).toEqual({ success: true });
    expect(mocks.updateMany.mock.calls[0][0].data).toMatchObject({ booking_horizon_days: 1, booking_min_lead_minutes: 7, booking_slot_interval_minutes: 5, downpayment_percentage: 100, public_allow_full_payment: true });
    expect(mocks.cache.mock.calls).toEqual([["/app/fixture-slug"], ["/app/fixture-slug/business-hours"], ["/fixture-slug/booking"]]);
  });

  it.each([null, undefined, [], "policy", { bookingHorizonDays: "14" }, { bookingHorizonDays: NaN }, { minLeadMinutes: Infinity }, { slotIntervalMinutes: 2147483648 }, { minLeadMinutes: -2147483649 }, { allowPublicFullPayment: "true" }, { defaultPublicPaymentType: "CASH" }, { timezone: "" }, { timezone: "x".repeat(101) }])("rejects malformed or oversized input %j before authentication", async input => {
    expect(await updateBookingPolicy("fixture-slug", input)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["", "../foreign", "a/b", "x".repeat(201)])("rejects invalid tenant slugs %s on public reads and writes", async slug => {
    await expect(getBookingPolicy(slug)).rejects.toThrow("Invalid input");
    expect(await updateBookingPolicy(slug, {})).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it.each(["Unauthorized", "Forbidden", "Subscription is read only"])("retains the %s write denial", async error => {
    mocks.auth.mockResolvedValue({ success: false, error });
    expect(await updateBookingPolicy("fixture-slug", {})).toEqual({ success: false, error });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("denies stale memberships and current non-owner actors", async () => {
    mocks.actor.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect(await updateBookingPolicy("fixture-slug", {})).toEqual({ success: false, error: "Forbidden" });
    mocks.actor.mockResolvedValueOnce({ success: true, actorType: "EMPLOYEE", role: "EMPLOYEE" });
    expect(await updateBookingPolicy("fixture-slug", {})).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.owner).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("denies owners without the current stored settings permission, without cache changes", async () => {
    mocks.owner.mockResolvedValue(null);
    expect(await updateBookingPolicy("fixture-slug", {})).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("rechecks verified membership/capability in the write predicate and audits only safe policy fields", async () => {
    expect(await updateBookingPolicy("fixture-slug", { timezone: "Asia/Tokyo", userId: "foreign", businessId: "foreign", ownerId: 999, allowPublicDownpayment: false })).toEqual({ success: true });
    const write = mocks.updateMany.mock.calls[0][0];
    expect(write.where).toEqual({ id: "fixture-business", slug: "fixture-slug", owners: { some: { id: 5, business_id: "fixture-business", user_id: "fixture-user", user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" } } } });
    expect(write.data).not.toHaveProperty("timezone");
    expect(write.data).not.toHaveProperty("userId");
    expect(mocks.actor).toHaveBeenCalledWith("fixture-slug", "fixture-user");
    expect(mocks.audit.mock.calls[0][0].data).toMatchObject({ entity_id: "fixture-business", business_id: "fixture-business", actor_id: "fixture-user", changes: { after: { mode: "BOOKING_POLICY_CHANGED", public_allow_downpayment: false } } });
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]);
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.cache.mock.invocationCallOrder[0]);
  });

  it("denies a membership/capability removed between the guard and write", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await updateBookingPolicy("fixture-slug", {})).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each(["auth", "actor", "owner", "transaction", "updateMany", "audit"] as const)("sanitizes %s infrastructure failures", async target => {
    mocks[target].mockRejectedValue(new Error("private database fixture"));
    expect(await updateBookingPolicy("fixture-slug", {})).toEqual({ success: false, error: "Unable to update booking policy." });
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("sanitizes missing-business and database errors from public reads", async () => {
    mocks.read.mockResolvedValueOnce(null);
    await expect(getBookingPolicy("fixture-slug")).rejects.toThrow("Unable to load booking policy.");
    mocks.read.mockRejectedValueOnce(new Error("private database fixture"));
    await expect(getBookingPolicy("fixture-slug")).rejects.toThrow("Unable to load booking policy.");
  });
});
