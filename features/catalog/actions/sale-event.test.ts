// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwnerTenantWriteAccessMock = vi.hoisted(() => vi.fn());
const requireTenantAccessMock = vi.hoisted(() => vi.fn());
const getBusinessEntitlementsBySlugMock = vi.hoisted(() => vi.fn());
const isSocialPublishingEnabledForBusinessMock = vi.hoisted(() => vi.fn());
const resolveTenantActorContextMock = vi.hoisted(() => vi.fn());
const businessFindFirstMock = vi.hoisted(() => vi.fn());
const currentTargetsMock = vi.hoisted(() => vi.fn());

const txMock = vi.hoisted(() => ({
  business: { findFirst: businessFindFirstMock },
  service: { count: vi.fn() },
  servicePackage: { count: vi.fn() },
  socialConnection: { findMany: currentTargetsMock },
  saleEvent: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  socialPost: {
    create: vi.fn(),
  },
  socialPostTarget: {
    createMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  saleEvent: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  business: {
    findUnique: vi.fn(),
    findFirst: businessFindFirstMock,
  },
  socialConnection: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => unknown) =>
    callback(txMock),
  ),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOwnerTenantWriteAccess: requireOwnerTenantWriteAccessMock,
  requireTenantAccess: requireTenantAccessMock,
}));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: resolveTenantActorContextMock }));

vi.mock("@/features/billing/plan-entitlements", () => ({
  getBusinessEntitlementsBySlug: getBusinessEntitlementsBySlugMock,
}));

vi.mock("@/features/social/social-publishing", () => ({
  isSocialPublishingEnabledForBusiness: isSocialPublishingEnabledForBusinessMock,
}));

vi.mock("@/lib/services/social/caption-generator", () => ({
  generateSocialCaptionDraft: vi.fn(),
}));

vi.mock("@/lib/services/social/promo-image", () => ({
  generateAndUploadPromoImage: vi.fn(),
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { createSaleEvent, updateSaleEvent, deleteSaleEvent, getActiveSaleEvents, getSaleEvents } from "./sale-event";
import { generateSocialCaptionDraft } from "@/lib/services/social/caption-generator";
import { generateAndUploadPromoImage } from "@/lib/services/social/promo-image";
import { revalidatePath, revalidateTag } from "next/cache";

const input = { businessSlug: "demo", title: "Promo", startDate: new Date("2026-02-16T00:00:00Z"), endDate: new Date("2026-02-20T00:00:00Z"), discountType: "PERCENTAGE" as const, discountValue: 10, serviceIds: [1], packageIds: [] as number[] };
const context = { success: true, businessId: "biz_1", businessSlug: "demo", userId: "owner_1", actorType: "OWNER", ownerId: 7 };

describe("sale-event server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => unknown) => callback(txMock),
    );
    requireOwnerTenantWriteAccessMock.mockResolvedValue({
      success: true,
      session: { user: { id: "owner_1" } },
      businessSlug: "demo",
    });
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: true,
      growth: true,
      social: true,
      ai: true,
    });
    isSocialPublishingEnabledForBusinessMock.mockReturnValue(true);
    businessFindFirstMock.mockResolvedValue({
      id: "biz_1",
      name: "Demo Biz",
      description: null,
      services: [{ name: "Service A", category: "General" }],
      packages: [],
    });
    txMock.saleEvent.create.mockResolvedValue({ id: 1 });
    requireTenantAccessMock.mockResolvedValue({ success: true, session: { user: { id: "owner_1" } }, businessSlug: "demo" });
    resolveTenantActorContextMock.mockResolvedValue(context);
    txMock.saleEvent.findFirst.mockResolvedValue({ id: 9 });
    txMock.service.count.mockResolvedValue(1);
    txMock.servicePackage.count.mockResolvedValue(0);
    txMock.saleEvent.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("creates a core sale event without social draft on starter/plus/pro", async () => {
    const result = await createSaleEvent({
      businessSlug: "demo",
      title: "Promo",
      startDate: new Date("2026-02-16T00:00:00.000Z"),
      endDate: new Date("2026-02-20T00:00:00.000Z"),
      discountType: "PERCENTAGE",
      discountValue: 10,
      serviceIds: [1],
      packageIds: [],
      createSocialDraft: false,
    });

    expect(result).toEqual({ success: true });
    expect(txMock.saleEvent.create).toHaveBeenCalled();
  });

  it("rejects social draft creation for non-pro plans", async () => {
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: true,
      growth: true,
      social: false,
      ai: false,
    });

    const result = await createSaleEvent({
      businessSlug: "demo",
      title: "Promo",
      startDate: new Date("2026-02-16T00:00:00.000Z"),
      endDate: new Date("2026-02-20T00:00:00.000Z"),
      discountType: "PERCENTAGE",
      discountValue: 10,
      serviceIds: [1],
      packageIds: [],
      createSocialDraft: true,
      targetPlatforms: ["FACEBOOK_PAGE"],
    });

    expect(result).toEqual({
      success: false,
      error: "Social publishing is available on the Pro plan.",
    });
  });

  it("deduplicates selections, preserves null unlimited slots and both create cache paths", async () => {
    expect(await createSaleEvent({ ...input, serviceIds: [1, 1] })).toEqual({ success: true });
    expect(txMock.saleEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ slot_limit: null, applicable_services: { connect: [{ id: 1, business_id: "biz_1" }] } }) }));
    expect(revalidatePath).toHaveBeenCalledWith("/app/demo/sale-events");
    expect(revalidatePath).toHaveBeenCalledWith("/app/demo/social-posts");
    expect(revalidateTag).toHaveBeenCalledWith(expect.any(String), "max");
    expect(getBusinessEntitlementsBySlugMock).not.toHaveBeenCalled();
  });

  it("rejects empty selections before persistence", async () => {
    expect(await createSaleEvent({ ...input, serviceIds: [] })).toEqual({ success: false, error: "Select at least one service or package for this sale event." });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("creates only a ready draft with skipped targets and audit; image failure is optional", async () => {
    prismaMock.socialConnection.findMany.mockResolvedValue([{ id: "conn_1", platform: "FACEBOOK_PAGE" }]);
    currentTargetsMock.mockResolvedValue([{ id: "conn_1", platform: "FACEBOOK_PAGE" }]);
    vi.mocked(generateSocialCaptionDraft).mockResolvedValue({ caption: "Generated", hashtags: ["#sale"] } as Awaited<ReturnType<typeof generateSocialCaptionDraft>>);
    vi.mocked(generateAndUploadPromoImage).mockRejectedValue(new Error("unavailable"));
    txMock.socialPost.create.mockResolvedValue({ id: "post_1" });
    expect(await createSaleEvent({ ...input, createSocialDraft: true, targetPlatforms: ["FACEBOOK_PAGE", "FACEBOOK_PAGE"], socialCaptionOverride: " Override " })).toEqual({ success: true });
    expect(txMock.socialPost.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "READY", caption_final: "Override", caption_draft: "Generated", media_url: null, created_by_user_id: "owner_1" }) }));
    expect(txMock.socialPostTarget.createMany).toHaveBeenCalledWith({ data: [{ social_post_id: "post_1", social_connection_id: "conn_1", status: "SKIPPED" }] });
    expect(txMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "DRAFT_CREATED", business_id: "biz_1", actor_id: "owner_1" }) }));
  });

  it("preserves update relation replacement and persists slot limit", async () => {
    expect(await updateSaleEvent({ ...input, id: 9 })).toEqual({ success: true });
    expect(txMock.saleEvent.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9, business_id: "biz_1" }, data: expect.objectContaining({ applicable_services: { set: [], connect: [{ id: 1, business_id: "biz_1" }] }, applicable_packages: { set: [], connect: [] } }) }));
    expect(txMock.saleEvent.update.mock.calls[0][0].data).toHaveProperty("slot_limit", null);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("preserves scoped delete not-found and successful cache semantics", async () => {
    txMock.saleEvent.deleteMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    expect(await deleteSaleEvent(9, "demo")).toEqual({ success: false, error: "Sale event not found or unauthorized." });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(await deleteSaleEvent(9, "demo")).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("keeps active read public with inclusive dates, noncancelled counts and clamped slots", async () => {
    prismaMock.saleEvent.findMany.mockResolvedValue([{ id: 1, slot_limit: 2, _count: { bookings: 3 } }, { id: 2, slot_limit: null, _count: { bookings: 5 } }]);
    expect(await getActiveSaleEvents("demo")).toEqual({ success: true, data: [{ id: 1, slot_limit: 2, slots_remaining: 0 }, { id: 2, slot_limit: null, slots_remaining: null }] });
    expect(prismaMock.saleEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { business: { slug: "demo" }, start_date: { lte: expect.any(Date) }, end_date: { gte: expect.any(Date) } }, select: expect.objectContaining({ _count: { select: { bookings: { where: { status: { not: "CANCELLED" }, business: { slug: "demo" } } } } } }) }));
    expect(requireTenantAccessMock).not.toHaveBeenCalled();
  });

  it("preserves internal tenant access and newest-first full existing scalar DTO", async () => {
    prismaMock.saleEvent.findMany.mockResolvedValue([{ id: 1, title: "Promo", applicable_services: [], applicable_packages: [] }]);
    expect(await getSaleEvents("demo")).toEqual({ success: true, data: [{ id: 1, title: "Promo", applicable_services: [], applicable_packages: [] }] });
    expect(requireTenantAccessMock).toHaveBeenCalledWith("demo");
    expect(prismaMock.saleEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { created_at: "desc" } }));
  });

  const calls = [
    { name: "create", run: () => createSaleEvent(input), fallback: "Failed to create sale event" },
    { name: "update", run: () => updateSaleEvent({ ...input, id: 9 }), fallback: "Failed to update sale event" },
    { name: "delete", run: () => deleteSaleEvent(9, "demo"), fallback: "Failed to delete sale event" },
  ];
  for (const call of calls) {
    it(`${call.name}: returns owner write gate denial without context or transaction`, async () => {
      requireOwnerTenantWriteAccessMock.mockResolvedValue({ success: false, error: "Subscription blocked" });
      expect(await call.run()).toEqual({ success: false, error: "Subscription blocked" });
      expect(resolveTenantActorContextMock).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
    it(`${call.name}: rejects a stale current membership`, async () => {
      resolveTenantActorContextMock.mockResolvedValue({ success: false, error: "Forbidden" });
      expect(await call.run()).toEqual({ success: false, error: "Forbidden" });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
    it(`${call.name}: forbids employee writes even if old gate accepts`, async () => {
      resolveTenantActorContextMock.mockResolvedValue({ ...context, actorType: "EMPLOYEE", employeeId: 5, ownerId: null });
      expect(await call.run()).toEqual({ success: false, error: "Forbidden" });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
    it(`${call.name}: rejects missing session user identity`, async () => {
      requireOwnerTenantWriteAccessMock.mockResolvedValue({ success: true, businessSlug: "demo", session: { user: {} } });
      expect(await call.run()).toEqual({ success: false, error: "Unauthorized" });
      expect(resolveTenantActorContextMock).not.toHaveBeenCalled();
    });
    it(`${call.name}: redacts transaction failure and skips all invalidation`, async () => {
      prismaMock.$transaction.mockRejectedValue(new Error("SQL password private"));
      expect(await call.run()).toEqual({ success: false, error: call.fallback });
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
    });
    it(`${call.name}: maps serialization conflict to a safe refresh message`, async () => {
      prismaMock.$transaction.mockRejectedValue({ code: "P2034", message: "private query" });
      expect(await call.run()).toEqual({ success: false, error: "Sale event changed. Refresh and try again." });
    });
    it(`${call.name}: keeps committed success even when all cache invalidation throws`, async () => {
      vi.mocked(revalidatePath).mockImplementation(() => { throw new Error("cache private"); });
      vi.mocked(revalidateTag).mockImplementation(() => { throw new Error("cache private"); });
      expect(await call.run()).toEqual({ success: true });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(revalidateTag).toHaveBeenCalledTimes(1);
    });
  }
  it("rejects malformed create, update and delete before any authorization", async () => {
    expect(await createSaleEvent({ ...input, discountValue: Infinity })).toEqual({ success: false, error: "Invalid sale event input." });
    expect(await updateSaleEvent({ ...input, id: -1 })).toEqual({ success: false, error: "Invalid sale event input." });
    expect(await deleteSaleEvent(NaN, "demo")).toEqual({ success: false, error: "Invalid sale event input." });
    expect(requireOwnerTenantWriteAccessMock).not.toHaveBeenCalled();
  });
  it("retains custom empty update selection message", async () => {
    expect(await updateSaleEvent({ ...input, id: 9, serviceIds: [] })).toEqual({ success: false, error: "Select at least one service or package for this sale event." });
  });
  for (const read of [{ name: "internal", run: getSaleEvents, fallback: "Failed to fetch sale events" }, { name: "public", run: getActiveSaleEvents, fallback: "Failed to fetch active sale events" }]) {
    it(`${read.name}: validates slug before database or auth`, async () => {
      expect(await read.run("../private")).toEqual({ success: false, error: "Invalid business slug" });
      expect(prismaMock.saleEvent.findMany).not.toHaveBeenCalled();
      expect(requireTenantAccessMock).not.toHaveBeenCalled();
    });
    it(`${read.name}: hides database error details`, async () => {
      prismaMock.saleEvent.findMany.mockRejectedValue(new Error("private SQL"));
      expect(await read.run("demo")).toEqual({ success: false, error: read.fallback });
    });
  }
  it("returns denied internal read before query", async () => {
    requireTenantAccessMock.mockResolvedValue({ success: false, error: "Unauthorized" });
    expect(await getSaleEvents("demo")).toEqual({ success: false, error: "Unauthorized" });
    expect(prismaMock.saleEvent.findMany).not.toHaveBeenCalled();
  });
});
