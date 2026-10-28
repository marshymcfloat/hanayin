// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.hoisted(() => vi.fn());
const actorMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: actorMock }));
const context = { success: true, actorType: "OWNER", role: "OWNER", businessId: "biz_a", businessSlug: "tenant-a", userId: "user_a", ownerId: 1 };
const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
  customer: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
  booking: { findMany: vi.fn(), findFirst: vi.fn() },
  availedService: { findMany: vi.fn() },
}));
const cacheMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: cacheMock }));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

import { searchCustomer, createCustomer, updateCustomer, deleteCustomer, getCustomerHistory, findDuplicateCustomerForBooking } from "./customer";

describe("legacy customer contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireAuthMock.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "user_a" } } });
    actorMock.mockResolvedValue(context);
    prismaMock.business.findFirst.mockResolvedValue({ id: "biz_a" });
    prismaMock.$transaction.mockImplementation(async callback => callback(prismaMock));
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_a" });
  });
  it("creates with raw contacts and session tenant, then invalidates the customer page", async () => {
    const customer = { id: "cus_1", name: "Jane", email: "", phone: "09171234567" };
    prismaMock.customer.create.mockResolvedValue(customer);
    expect(await createCustomer({ businessSlug: "tenant-b", name: "Jane", email: "", phone: "09171234567" })).toEqual({ success: true, data: customer });
    expect(prismaMock.customer.create).toHaveBeenCalledWith(expect.objectContaining({ data: { name: "Jane", email: "", phone: "09171234567", business_id: "biz_a" } }));
    expect(cacheMock).toHaveBeenCalledWith("/app/tenant-a/customers");
  });
  it("leaves omitted contacts unset in an update patch", async () => {
    prismaMock.customer.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cus_1", name: "Jane" });
    expect((await updateCustomer("cus_1", { name: "Jane", businessSlug: "tenant-b" })).success).toBe(true);
    expect(prismaMock.customer.updateMany.mock.calls[0][0].data).toEqual({ name: "Jane", email: undefined, phone: undefined });
  });
  it("denies foreign deletes and does not invalidate", async () => {
    prismaMock.customer.deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteCustomer("foreign")).toEqual({ success: false, error: "Customer not found or unauthorized" });
    expect(cacheMock).not.toHaveBeenCalled();
  });
  it("normalizes duplicate contacts and identifies a disagreeing name", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cus_1", name: "Maria Santos", email: "maria@example.com", phone: null });
    expect(await findDuplicateCustomerForBooking({ name: "Jane", email: " MARIA@EXAMPLE.COM " })).toEqual({ success: true, data: { id: "cus_1", name: "Maria Santos", email: "maria@example.com", phone: null, matchedOn: "email", nameMismatch: true } });
  });
  it("returns empty history and no next appointment or flows", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cus_1" });
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.booking.findFirst.mockResolvedValue(null);
    prismaMock.availedService.findMany.mockResolvedValue([]);
    expect(await getCustomerHistory("cus_1")).toEqual({ success: true, data: { bookings: [], nextAppointment: null, flowStatus: [] } });
  });
  it.each(["create", "update", "delete"])("returns committed %s success when cache invalidation fails", async operation => {
    cacheMock.mockImplementation(() => { throw new Error("cache internal"); });
    prismaMock.customer.create.mockResolvedValue({ id: "cus_1" });
    prismaMock.customer.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cus_1" });
    prismaMock.customer.deleteMany.mockResolvedValue({ count: 1 });
    const result = operation === "create" ? await createCustomer({ name: "Jane", businessSlug: "foreign" }) : operation === "update" ? await updateCustomer("cus_1", { name: "Jane", businessSlug: "foreign" }) : await deleteCustomer("cus_1");
    expect(result.success).toBe(true);
    expect(cacheMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.customer.create).toHaveBeenCalledTimes(operation === "create" ? 1 : 0);
  });
  it("returns safe create errors with no raw log or cache", async () => {
    prismaMock.customer.create.mockRejectedValue(new Error("secret SQL"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await createCustomer({ name: "Jane", businessSlug: "foreign" })).toEqual({ success: false, error: "Failed to create customer" });
    expect(log).not.toHaveBeenCalled();
    expect(cacheMock).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("throws reload failure through transaction and never invalidates", async () => {
    prismaMock.customer.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.customer.findFirst.mockResolvedValue(null);
    expect(await updateCustomer("cus_1", { name: "Jane", businessSlug: "foreign" })).toEqual({ success: false, error: "Failed to load updated customer" });
    expect(cacheMock).not.toHaveBeenCalled();
  });
  it.each(["search", "duplicate", "create", "update", "delete", "history"])("rejects malformed %s before authentication", async operation => {
    const bad = null as unknown as string;
    const result = operation === "search" ? await searchCustomer(bad, "foreign") : operation === "duplicate" ? await findDuplicateCustomerForBooking({ name: bad }) : operation === "create" ? await createCustomer({ name: bad, businessSlug: "foreign" }) : operation === "update" ? await updateCustomer(bad, { name: "Jane", businessSlug: "foreign" }) : operation === "delete" ? await deleteCustomer(bad) : await getCustomerHistory(bad);
    expect(result.success).toBe(false);
    expect(requireAuthMock).not.toHaveBeenCalled();
  });
  it.each(["search", "duplicate", "create", "update", "delete", "history"])("preserves denied %s access without persistence/cache", async operation => {
    requireAuthMock.mockResolvedValue({ success: false, error: "Subscription read-only" });
    const result = operation === "search" ? await searchCustomer("Jane", "foreign") : operation === "duplicate" ? await findDuplicateCustomerForBooking({ name: "Jane" }) : operation === "create" ? await createCustomer({ name: "Jane", businessSlug: "foreign" }) : operation === "update" ? await updateCustomer("cus_1", { name: "Jane", businessSlug: "foreign" }) : operation === "delete" ? await deleteCustomer("cus_1") : await getCustomerHistory("cus_1");
    expect(result).toEqual({ success: false, error: "Subscription read-only" });
    expect(actorMock).not.toHaveBeenCalled();
    expect(cacheMock).not.toHaveBeenCalled();
  });
  it.each(["search", "duplicate", "create", "update", "delete", "history"])("safely catches unexpected %s authorization failures", async operation => {
    actorMock.mockRejectedValue(new Error("secret internal"));
    const result = operation === "search" ? await searchCustomer("Jane", "foreign") : operation === "duplicate" ? await findDuplicateCustomerForBooking({ name: "Jane" }) : operation === "create" ? await createCustomer({ name: "Jane", businessSlug: "foreign" }) : operation === "update" ? await updateCustomer("cus_1", { name: "Jane", businessSlug: "foreign" }) : operation === "delete" ? await deleteCustomer("cus_1") : await getCustomerHistory("cus_1");
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty("error", "secret internal");
    expect(cacheMock).not.toHaveBeenCalled();
  });
  it("returns refresh conflicts rather than raw transaction errors", async () => {
    prismaMock.$transaction.mockRejectedValue({ code: "P2034", message: "secret SQL" });
    expect(await updateCustomer("cus_1", { name: "Jane", businessSlug: "foreign" })).toEqual({ success: false, error: "Customer changed. Please refresh and try again." });
    expect(cacheMock).not.toHaveBeenCalled();
  });
});

describe("searchCustomer tenant boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actorMock.mockResolvedValue(context);
  });

  it("scopes the lookup to the authenticated tenant, ignoring the caller-supplied slug", async () => {
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "user_a" } },
    });
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_a" });
    prismaMock.customer.findMany.mockResolvedValue([]);

    await searchCustomer("Jane", "tenant-b");

    // Business lookup uses the session slug, not the caller input.
    expect(actorMock).toHaveBeenCalledWith("tenant-a", "user_a");
    // Customer query is scoped to the resolved business id.
    expect(prismaMock.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ business_id: "biz_a" }),
      }),
    );
  });

  it("returns unauthorized when the auth guard fails", async () => {
    requireAuthMock.mockResolvedValue({ success: false, error: "Unauthorized" });

    const result = await searchCustomer("Jane", "tenant-a");

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(prismaMock.customer.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty result for a blank query without hitting the DB", async () => {
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "user_a" } },
    });

    const result = await searchCustomer("   ", "tenant-a");

    expect(result).toEqual({ success: true, data: [] });
    expect(prismaMock.business.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.customer.findMany).not.toHaveBeenCalled();
  });

  it("matches by name prefix, email contains, and phone (canonicalized + digits)", async () => {
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "user_a" } },
    });
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_a" });
    prismaMock.customer.findMany.mockResolvedValue([]);

    await searchCustomer("0917 123 4567", "tenant-a");

    const call = prismaMock.customer.findMany.mock.calls[0][0];
    const orConditions = call.where.OR;

    // Phone-shaped queries should produce both a canonical-form match and a
    // digits-substring match. Email-OR is skipped here because the query has
    // no letters/@/.
    const phoneExact = orConditions.find(
      (c: Record<string, unknown>) => c.phone === "639171234567",
    );
    const phoneSubstring = orConditions.find(
      (c: { phone?: { contains?: string } }) =>
        typeof c.phone === "object" && c.phone?.contains === "09171234567",
    );
    expect(phoneExact).toBeDefined();
    expect(phoneSubstring).toBeDefined();
  });

  it("returns enriched hits with last-visit metadata", async () => {
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "user_a" } },
    });
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_a" });
    prismaMock.customer.findMany.mockResolvedValue([
      {
        id: "cus_1",
        name: "Maria Santos",
        email: null,
        phone: "639171234567",
        trust_tier: "TRUSTED",
        no_show_count: 0,
        bookings: [{ scheduled_at: new Date("2026-04-12"), created_at: new Date("2026-04-12") }],
      },
    ]);

    const result = await searchCustomer("Maria", "tenant-a");

    expect(result.success).toBe(true);
    // TS can't narrow the discriminated union perfectly here because the
    // return type is inferred; assert explicitly so the rest of the test
    // can index into result.data without optional-chain noise.
    if (!result.success || !result.data) {
      throw new Error("expected success result with data");
    }
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "cus_1",
      name: "Maria Santos",
      trust_tier: "TRUSTED",
    });
    expect(result.data[0].lastBookingAt).toBeInstanceOf(Date);
  });
});
