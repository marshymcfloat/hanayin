import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaleEventActorContext } from "@/features/catalog/sale-event-access";
import type { PreparedSaleSocialDraft } from "@/features/catalog/sale-event-types";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), business: vi.fn(), targets: vi.fn(), create: vi.fn(), post: vi.fn(), postTargets: vi.fn(), audit: vi.fn(), find: vi.fn(), serviceCount: vi.fn(), packageCount: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
import { commitSaleEventCreation, updateTenantSaleEvent, deleteTenantSaleEvent } from "./sale-event-administration";
const context = { success: true, businessId: "biz_a", businessSlug: "tenant-a", userId: "owner_a", actorType: "OWNER", ownerId: 8 } as SaleEventActorContext;
const input = { businessSlug: "tenant-a", title: "Promo", startDate: new Date("2026-03-01"), endDate: new Date("2026-03-05"), discountType: "PERCENTAGE" as const, discountValue: 10, serviceIds: [1], packageIds: [2] };
const draft: PreparedSaleSocialDraft = { targets: [{ id: "conn_a", platform: "FACEBOOK_PAGE" }], caption: "Generated", hashtags: ["#sale"], captionFinal: null, mediaUrl: null };
const tx = {
  business: { findFirst: mocks.business }, socialConnection: { findMany: mocks.targets },
  saleEvent: { create: mocks.create, findFirst: mocks.find, update: mocks.update, deleteMany: mocks.delete },
  socialPost: { create: mocks.post }, socialPostTarget: { createMany: mocks.postTargets }, auditLog: { create: mocks.audit },
  service: { count: mocks.serviceCount }, servicePackage: { count: mocks.packageCount },
};
describe("sale event atomic administration", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.transaction.mockImplementation(async callback => callback(tx));
    mocks.business.mockResolvedValue({ id: "biz_a", name: "Business", description: null, services: [{ name: "A", category: "General" }], packages: [{ name: "P" }] });
    mocks.targets.mockResolvedValue(draft.targets); mocks.create.mockResolvedValue({ id: 11 }); mocks.post.mockResolvedValue({ id: "post_a" });
    mocks.find.mockResolvedValue({ id: 11 }); mocks.serviceCount.mockResolvedValue(1); mocks.packageCount.mockResolvedValue(1); mocks.delete.mockResolvedValue({ count: 1 });
  });
  it("commits a sale graph and preserves slot limit with scoped relation connects", async () => {
    await commitSaleEventCreation(context, { ...input, slotLimit: 7 }, null);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(mocks.create).toHaveBeenCalledWith({ data: { title: "Promo", description: undefined, start_date: input.startDate, end_date: input.endDate, discount_type: "PERCENTAGE", discount_value: 10, slot_limit: 7, business_id: "biz_a", applicable_services: { connect: [{ id: 1, business_id: "biz_a" }] }, applicable_packages: { connect: [{ id: 2, business_id: "biz_a" }] } }, select: { id: true } });
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("commits sale + draft + skipped targets + audit on the same transaction delegates only", async () => {
    await commitSaleEventCreation(context, { ...input, createSocialDraft: true }, draft);
    expect(mocks.post).toHaveBeenCalledWith({ data: { business_id: "biz_a", sale_event_id: 11, source: "SALE_EVENT", status: "DRAFT", title: "Promo Social Draft", caption_draft: "Generated", caption_final: null, hashtags: ["#sale"], media_url: null, created_by_user_id: "owner_a" }, select: { id: true } });
    expect(mocks.postTargets).toHaveBeenCalledWith({ data: [{ social_post_id: "post_a", social_connection_id: "conn_a", status: "SKIPPED" }] });
    expect(mocks.audit).toHaveBeenCalledWith({ data: { entity_type: "SocialPost", entity_id: "post_a", action: "DRAFT_CREATED", actor_id: "owner_a", actor_type: "USER", business_id: "biz_a", changes: { saleEventId: 11, targetPlatforms: ["FACEBOOK_PAGE"] } }, select: { id: true } });
    expect(mocks.targets).toHaveBeenCalledWith({ where: { business_id: "biz_a", status: "CONNECTED", id: { in: ["conn_a"] }, platform: { in: ["FACEBOOK_PAGE"] } }, select: { id: true, platform: true } });
  });
  it("sets READY only for owner final caption without publication", async () => {
    await commitSaleEventCreation(context, { ...input, createSocialDraft: true }, { ...draft, captionFinal: "Owner", mediaUrl: "https://example.com/image.jpg" });
    expect(mocks.post.mock.calls[0][0].data).toMatchObject({ status: "READY", caption_final: "Owner", media_url: "https://example.com/image.jpg" });
    expect(mocks.post.mock.calls[0][0].data).not.toHaveProperty("published_at");
  });
  it.each([{ targets: [] }, { targets: [{ id: "conn_other", platform: "FACEBOOK_PAGE" }] }, { targets: [{ id: "conn_a", platform: "INSTAGRAM_BUSINESS" }] }])("denies revoked, moved or replaced draft targets before any graph write %#", async ({ targets }) => {
    mocks.targets.mockResolvedValue(targets);
    await expect(commitSaleEventCreation(context, { ...input, createSocialDraft: true }, draft)).rejects.toThrow("Connected social channels changed");
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each([{ input: { ...input, createSocialDraft: true }, draft: null }, { input, draft }, { input: { ...input, createSocialDraft: true }, draft: { ...draft, targets: [] } }])("denies inconsistent prepared draft contract %#", async value => {
    await expect(commitSaleEventCreation(context, value.input, value.draft)).rejects.toThrow("Invalid social draft");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["post", "postTargets", "audit"] as const)("propagates %s failure to abort transaction rather than report a successful sale", async stage => {
    mocks[stage].mockRejectedValue(new Error("stage unavailable"));
    let committed = false;
    mocks.transaction.mockImplementation(async callback => { const result = await callback(tx); committed = true; return result; });
    await expect(commitSaleEventCreation(context, { ...input, createSocialDraft: true }, draft)).rejects.toThrow("stage unavailable");
    expect(committed).toBe(false);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    if (stage !== "audit") expect(mocks.audit).not.toHaveBeenCalled();
  });
  const calls = [
    { name: "create", run: (actor = context) => commitSaleEventCreation(actor, input, null) },
    { name: "update", run: (actor = context) => updateTenantSaleEvent(actor, { ...input, id: 11 }) },
    { name: "delete", run: (actor = context) => deleteTenantSaleEvent(actor, 11) },
  ];
  for (const call of calls) {
    it(`${call.name}: rejects runtime employee context before transaction`, async () => {
      await expect(call.run({ ...context, actorType: "EMPLOYEE", employeeId: 9, ownerId: null } as SaleEventActorContext)).rejects.toThrow("Forbidden");
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
    it(`${call.name}: rechecks exact current owner and role inside transaction`, async () => {
      mocks.business.mockResolvedValue(null);
      await expect(call.run()).rejects.toThrow("Forbidden");
      expect(mocks.business.mock.calls[0][0].where).toEqual({ id: "biz_a", slug: "tenant-a", owners: { some: { id: 8, user_id: "owner_a", business_id: "biz_a", user: { role: "OWNER" } } } });
      expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.delete).not.toHaveBeenCalled();
    });
  }
  it("atomically replaces both relations and persists the supplied slot limit", async () => {
    await updateTenantSaleEvent(context, { ...input, id: 11 });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 11, business_id: "biz_a" }, data: { revision: { increment: 1 }, title: "Promo", description: undefined, start_date: input.startDate, end_date: input.endDate, discount_type: "PERCENTAGE", discount_value: 10, slot_limit: null, applicable_services: { set: [], connect: [{ id: 1, business_id: "biz_a" }] }, applicable_packages: { set: [], connect: [{ id: 2, business_id: "biz_a" }] } }, select: { id: true } });
    expect(mocks.serviceCount).toHaveBeenCalledWith({ where: { id: { in: [1] }, business_id: "biz_a" } });
    expect(mocks.packageCount).toHaveBeenCalledWith({ where: { id: { in: [2] }, business_id: "biz_a" } });
    expect(mocks.update.mock.calls[0][0].data).toHaveProperty("slot_limit", null);
  });
  it("refuses foreign update target before reference checks", async () => {
    mocks.find.mockResolvedValue(null);
    await expect(updateTenantSaleEvent(context, { ...input, id: 11 })).rejects.toThrow("Sale event not found or unauthorized.");
    expect(mocks.find).toHaveBeenCalledWith({ where: { id: 11, business_id: "biz_a" }, select: { id: true, revision: true, conditional_rule: true } });
    expect(mocks.serviceCount).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["serviceCount", "packageCount"] as const)("denies moved references inside update transaction at %s", async count => {
    mocks[count].mockResolvedValue(0);
    await expect(updateTenantSaleEvent(context, { ...input, id: 11 })).rejects.toThrow("invalid for this business");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("deletes only the verified tenant record after current role recheck", async () => {
    await deleteTenantSaleEvent(context, 11);
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 11, business_id: "biz_a" } });
  });
  it("rejects a foreign or deleted delete target", async () => {
    mocks.delete.mockResolvedValue({ count: 0 });
    await expect(deleteTenantSaleEvent(context, 11)).rejects.toThrow("Sale event not found or unauthorized.");
  });
});
