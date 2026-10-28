import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaleEventActorContext } from "@/features/catalog/sale-event-access";
const mocks = vi.hoisted(() => ({ business: vi.fn(), entitlement: vi.fn(), pilot: vi.fn(), targets: vi.fn(), caption: vi.fn(), image: vi.fn(), commit: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { socialConnection: { findMany: mocks.targets } } }));
vi.mock("@/features/catalog/queries/sale-event-administration", () => ({ getSaleEventCreationContext: mocks.business }));
vi.mock("@/features/catalog/services/sale-event-administration", () => ({ commitSaleEventCreation: mocks.commit }));
vi.mock("@/features/billing/plan-entitlements", () => ({ getBusinessEntitlementsBySlug: mocks.entitlement }));
vi.mock("@/features/social/social-publishing", () => ({ isSocialPublishingEnabledForBusiness: mocks.pilot }));
vi.mock("@/lib/services/social/caption-generator", () => ({ generateSocialCaptionDraft: mocks.caption }));
vi.mock("@/lib/services/social/promo-image", () => ({ generateAndUploadPromoImage: mocks.image }));
import { createTenantSaleEvent } from "./sale-event-creation";
const context = { success: true, businessId: "biz_a", businessSlug: "tenant-a", userId: "owner_a", actorType: "OWNER", ownerId: 8 } as SaleEventActorContext;
const input = { businessSlug: "tenant-a", title: "Promo", startDate: new Date("2026-03-01"), endDate: new Date("2026-03-05"), discountType: "PERCENTAGE" as const, discountValue: 10, serviceIds: [1, 2], packageIds: [3], createSocialDraft: true, targetPlatforms: ["FACEBOOK_PAGE" as const] };
describe("sale draft preparation outside commit", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.business.mockResolvedValue({ id: "biz_a", name: "Business", description: null, services: [{ name: "A", category: "General" }, { name: "B", category: "General" }], packages: [{ name: "P" }] });
    mocks.entitlement.mockResolvedValue({ social: true }); mocks.pilot.mockReturnValue(true); mocks.targets.mockResolvedValue([{ id: "conn_a", platform: "FACEBOOK_PAGE" }]);
    mocks.caption.mockResolvedValue({ caption: "Generated", hashtags: ["#sale"] }); mocks.image.mockResolvedValue("https://example.com/generated.jpg");
  });
  it("core sale bypasses every social entitlement, provider and preparation read", async () => {
    await createTenantSaleEvent(context, { ...input, createSocialDraft: false });
    expect(mocks.commit).toHaveBeenCalledWith(context, expect.objectContaining({ createSocialDraft: false }), null);
    expect(mocks.business).not.toHaveBeenCalled(); expect(mocks.entitlement).not.toHaveBeenCalled(); expect(mocks.targets).not.toHaveBeenCalled(); expect(mocks.caption).not.toHaveBeenCalled(); expect(mocks.image).not.toHaveBeenCalled();
  });
  it("runs caption and image before commit, deduplicates categories and uses verified tenant identity", async () => {
    await createTenantSaleEvent(context, { ...input, socialImageProfile: "WARM_EDITORIAL", socialImageDirection: "Warm room" });
    expect(mocks.caption).toHaveBeenCalledWith({ businessSlug: "tenant-a", businessName: "Business", businessDescription: null, saleTitle: "Promo", saleDescription: undefined, discountType: "PERCENTAGE", discountValue: 10, startDate: input.startDate, endDate: input.endDate, serviceNames: ["A", "B"], serviceCategories: ["General"], packageNames: ["P"] });
    expect(mocks.image.mock.calls[0][0]).toMatchObject({ captionText: "Generated", imageProfile: "WARM_EDITORIAL", ownerImageDirection: "Warm room" });
    expect(mocks.caption.mock.invocationCallOrder[0]).toBeLessThan(mocks.image.mock.invocationCallOrder[0]);
    expect(mocks.image.mock.invocationCallOrder[0]).toBeLessThan(mocks.commit.mock.invocationCallOrder[0]);
    expect(mocks.commit).toHaveBeenCalledWith(context, expect.any(Object), { targets: [{ id: "conn_a", platform: "FACEBOOK_PAGE" }], caption: "Generated", hashtags: ["#sale"], captionFinal: null, mediaUrl: "https://example.com/generated.jpg" });
  });
  it("uses existing supplied media without generation and trims owner override", async () => {
    await createTenantSaleEvent(context, { ...input, socialCaptionOverride: " Owner caption ", socialMediaUrl: "https://example.com/manual.jpg" });
    expect(mocks.image).not.toHaveBeenCalled();
    expect(mocks.commit.mock.calls[0][2]).toMatchObject({ captionFinal: "Owner caption", mediaUrl: "https://example.com/manual.jpg" });
  });
  it("uses owner caption for image generation when provided", async () => {
    await createTenantSaleEvent(context, { ...input, socialCaptionOverride: "Owner" });
    expect(mocks.image.mock.calls[0][0].captionText).toBe("Owner");
  });
  it("permits optional image failure with a null media draft", async () => {
    mocks.image.mockRejectedValue(new Error("provider private"));
    await createTenantSaleEvent(context, { ...input, socialCaptionOverride: " " });
    expect(mocks.commit.mock.calls[0][2]).toMatchObject({ captionFinal: null, mediaUrl: null });
  });
  it("rejects runtime employee before any provider or transaction", async () => {
    await expect(createTenantSaleEvent({ ...context, actorType: "EMPLOYEE", employeeId: 9, ownerId: null } as SaleEventActorContext, input)).rejects.toThrow("Forbidden");
    expect(mocks.business).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("requires Pro entitlement before generating", async () => {
    mocks.entitlement.mockResolvedValue({ social: false });
    await expect(createTenantSaleEvent(context, input)).rejects.toThrow("Social publishing is available on the Pro plan.");
    expect(mocks.caption).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("retains pilot opt-in before generating", async () => {
    mocks.pilot.mockReturnValue(false);
    await expect(createTenantSaleEvent(context, input)).rejects.toThrow("Social publishing is not enabled for this business yet. Contact support to join the pilot.");
    expect(mocks.targets).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });
  it.each([{ targetPlatforms: undefined }, { targetPlatforms: [] }])("requires selected platforms %#", async ({ targetPlatforms }) => {
    await expect(createTenantSaleEvent(context, { ...input, targetPlatforms })).rejects.toThrow("Please select at least one connected platform.");
    expect(mocks.targets).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("denies no connected targets and never selects credentials", async () => {
    mocks.targets.mockResolvedValue([]);
    await expect(createTenantSaleEvent(context, input)).rejects.toThrow("No connected social channels were found. Connect Facebook or Instagram first.");
    expect(mocks.targets).toHaveBeenCalledWith({ where: { business_id: "biz_a", status: "CONNECTED", platform: { in: ["FACEBOOK_PAGE"] } }, select: { id: true, platform: true } });
    expect(mocks.caption).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("permits a connected subset of requested platforms as before", async () => {
    await createTenantSaleEvent(context, { ...input, targetPlatforms: ["FACEBOOK_PAGE", "INSTAGRAM_BUSINESS"] });
    expect(mocks.commit.mock.calls[0][2].targets).toEqual([{ id: "conn_a", platform: "FACEBOOK_PAGE" }]);
  });
  it("caption failure propagates without starting commit or image", async () => {
    mocks.caption.mockRejectedValue(new Error("caption unavailable"));
    await expect(createTenantSaleEvent(context, input)).rejects.toThrow("caption unavailable");
    expect(mocks.image).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("preparation membership/reference failure propagates before generation", async () => {
    mocks.business.mockRejectedValue(new Error("Forbidden"));
    await expect(createTenantSaleEvent(context, input)).rejects.toThrow("Forbidden");
    expect(mocks.entitlement).not.toHaveBeenCalled(); expect(mocks.caption).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });
});
