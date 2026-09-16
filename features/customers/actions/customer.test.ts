// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
  },
  customer: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

import { searchCustomer } from "./customer";

describe("searchCustomer tenant boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("scopes the lookup to the authenticated tenant, ignoring the caller-supplied slug", async () => {
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
    });
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_a" });
    prismaMock.customer.findMany.mockResolvedValue([]);

    await searchCustomer("Jane", "tenant-b");

    // Business lookup uses the session slug, not the caller input.
    expect(prismaMock.business.findUnique).toHaveBeenCalledWith({
      where: { slug: "tenant-a" },
      select: { id: true },
    });
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
