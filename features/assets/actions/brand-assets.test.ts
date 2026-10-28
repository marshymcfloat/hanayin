import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), ownerAccess: vi.fn(), resolve: vi.fn(), put: vi.fn(), del: vi.fn(), cache: vi.fn(),
  prisma: { business: { findUnique: vi.fn() }, owner: { findFirst: vi.fn() }, service: { findFirst: vi.fn() }, employee: { findFirst: vi.fn() }, brandAsset: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock("@/lib/auth/owner-access", async importOriginal => ({ ...await importOriginal<object>(), requireAuthenticatedOwnerPermission: mocks.ownerAccess }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.resolve }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/prisma/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@vercel/blob", () => ({ put: mocks.put, del: mocks.del }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { listBrandAssetsAction, uploadBrandAssetAction, deleteBrandAssetAction } from "./brand-assets";

function form(kind = "LOGO") {
  const data = new FormData();
  data.set("file", new File(["image"], "photo.jpg", { type: "image/jpeg" }));
  data.set("kind", kind);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "user-a", role: "OWNER" } } });
  mocks.prisma.business.findUnique.mockResolvedValue({ id: "biz-a" });
  const context = { success: true, actorType: "OWNER", ownerId: 3, businessId: "biz-a", businessSlug: "tenant-a", userId: "user-a", role: "OWNER" };
  mocks.ownerAccess.mockResolvedValue({ success: true, context }); mocks.resolve.mockResolvedValue(context);
  mocks.prisma.owner.findFirst.mockResolvedValue({ id: 3 });
  mocks.prisma.$transaction.mockImplementation(callback => callback(mocks.prisma));
  mocks.prisma.service.findFirst.mockResolvedValue({ id: 9 });
  mocks.prisma.employee.findFirst.mockResolvedValue({ id: 7 });
  mocks.put.mockResolvedValue({ url: "https://blob.invalid/photo", pathname: "tenant-a/photo" });
  mocks.del.mockResolvedValue(undefined);
  mocks.prisma.brandAsset.create.mockResolvedValue({ id: "asset-a", kind: "LOGO", url: "https://blob.invalid/photo" });
  mocks.prisma.brandAsset.findFirst.mockResolvedValue({ id: "asset-a", url: "https://blob.invalid/photo", storage_key: "key" });
  mocks.prisma.brandAsset.deleteMany.mockResolvedValue({ count: 1 });
});
it("characterizes narrow ordered tenant list", async () => {
  mocks.prisma.brandAsset.findMany.mockResolvedValue([{ id: "asset-a" }]);
  expect(await listBrandAssetsAction("LOGO")).toEqual({ success: true, data: [{ id: "asset-a" }] });
  expect(mocks.prisma.brandAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ business_id: "biz-a", kind: "LOGO", business: expect.objectContaining({ id: "biz-a", slug: "tenant-a" }) }), orderBy: [{ kind: "asc" }, { created_at: "desc" }] }));
});
it("characterizes public random namespace and irrelevant reference nulling", async () => {
  const data = form(); data.set("serviceId", "9"); data.set("referenceSubject", "PERSON"); data.set("alt", "logo");
  expect(await uploadBrandAssetAction(data)).toEqual({ success: true, data: expect.objectContaining({ id: "asset-a" }) });
  expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/^tenant-a\/brand\/logo\/\d+\.jpg$/), expect.any(File), { access: "public", addRandomSuffix: true, contentType: "image/jpeg" });
  expect(mocks.prisma.brandAsset.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ service_id: null, employee_id: null, reference_subject: null, alt: "logo", uploaded_by_user_id: "user-a" }) }));
  expect(mocks.cache).toHaveBeenCalledWith("/app/tenant-a/business");
});
it("characterizes required same-tenant service reference", async () => {
  const data = form("SERVICE"); data.set("serviceId", "9");
  await uploadBrandAssetAction(data);
  expect(mocks.prisma.service.findFirst).toHaveBeenCalledWith({ where: { id: 9, business_id: "biz-a" }, select: { id: true } });
  expect(mocks.prisma.brandAsset.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ service_id: 9, employee_id: null }) }));
});
it("characterizes orphan cleanup after failed DB create", async () => {
  mocks.prisma.brandAsset.create.mockRejectedValue(new Error("db"));
  expect(await uploadBrandAssetAction(form())).toEqual({ success: false, error: "Failed to save asset." });
  expect(mocks.del).toHaveBeenCalledWith("https://blob.invalid/photo"); expect(mocks.cache).not.toHaveBeenCalled();
});
it("characterizes soft-fail Blob deletion after row removal", async () => {
  mocks.del.mockRejectedValue(new Error("blob"));
  expect(await deleteBrandAssetAction("asset-a")).toEqual({ success: true });
  expect(mocks.prisma.brandAsset.deleteMany).toHaveBeenCalledWith({ where: { id: "asset-a", business_id: "biz-a", url: "https://blob.invalid/photo" } });
  expect(mocks.cache).toHaveBeenCalled();
});
it.each(["Forbidden", "Unauthorized", "Subscription is read only"])("denies owner guard failure %s before Blob IO", async error => {
  mocks.ownerAccess.mockResolvedValue({ success: false, error });
  expect(await uploadBrandAssetAction(form())).toEqual({ success: false, error });
  expect(await deleteBrandAssetAction("asset-a")).toEqual({ success: false, error });
  expect(mocks.put).not.toHaveBeenCalled(); expect(mocks.del).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
});
it("requests actual SETTINGS_MANAGE and rechecks exact current owner at commit", async () => {
  await uploadBrandAssetAction(form());
  expect(mocks.ownerAccess).toHaveBeenCalledWith("SETTINGS_MANAGE");
  expect(mocks.prisma.owner.findFirst).toHaveBeenCalledWith({ where: { id: 3, business_id: "biz-a", user_id: "user-a", user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" }, business: { id: "biz-a", slug: "tenant-a" } }, select: { id: true } });
  expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
});
it("compensates newly uploaded blob when current owner capability disappears", async () => {
  mocks.prisma.owner.findFirst.mockResolvedValue(null);
  expect(await uploadBrandAssetAction(form())).toEqual({ success: false, error: "Forbidden" });
  expect(mocks.del).toHaveBeenCalledWith("https://blob.invalid/photo"); expect(mocks.prisma.brandAsset.create).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
});
it("keeps committed asset and Blob if cache invalidation throws", async () => {
  mocks.cache.mockImplementation(() => { throw new Error("cache"); });
  expect(await uploadBrandAssetAction(form())).toEqual({ success: true, data: expect.objectContaining({ id: "asset-a" }) });
  expect(mocks.del).not.toHaveBeenCalled();
});
it("keeps committed deletion successful if cache invalidation throws", async () => {
  mocks.cache.mockImplementation(() => { throw new Error("cache"); });
  expect(await deleteBrandAssetAction("asset-a")).toEqual({ success: true });
  expect(mocks.del).toHaveBeenCalledTimes(1);
});
it("safe-fails listing errors and stale membership", async () => {
  mocks.resolve.mockResolvedValueOnce({ success: false, error: "Forbidden" });
  expect(await listBrandAssetsAction()).toEqual({ success: false, error: "Forbidden" });
  mocks.prisma.brandAsset.findMany.mockRejectedValue(new Error("secret SQL"));
  expect(await listBrandAssetsAction()).toEqual({ success: false, error: "Failed to load assets." });
});
it("rejects malformed action inputs before auth or effects", async () => {
  expect(await listBrandAssetsAction("unknown")).toEqual({ success: false, error: "Invalid asset kind." });
  expect(await deleteBrandAssetAction(" ")).toEqual({ success: false, error: "Invalid asset ID." });
  expect(await uploadBrandAssetAction({} as FormData)).toEqual({ success: false, error: "Invalid upload data." });
  expect(mocks.ownerAccess).not.toHaveBeenCalled(); expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.put).not.toHaveBeenCalled();
});
it("does not delete Blob for missing foreign row or failed DB deletion", async () => {
  mocks.prisma.brandAsset.findFirst.mockResolvedValueOnce(null);
  expect(await deleteBrandAssetAction("foreign")).toEqual({ success: false, error: "Asset not found" });
  mocks.prisma.brandAsset.deleteMany.mockRejectedValue(new Error("SQL"));
  expect(await deleteBrandAssetAction("asset-a")).toEqual({ success: false, error: "Failed to delete asset." });
  expect(mocks.del).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
});
it("safe-fails unexpected authentication errors", async () => {
  mocks.ownerAccess.mockRejectedValue(new Error("secret"));
  expect(await uploadBrandAssetAction(form())).toEqual({ success: false, error: "Failed to save asset." });
  expect(await deleteBrandAssetAction("asset-a")).toEqual({ success: false, error: "Failed to delete asset." });
  mocks.auth.mockRejectedValue(new Error("secret")); expect(await listBrandAssetsAction()).toEqual({ success: false, error: "Failed to load assets." });
});
it("passes auth listing denial directly without queries", async () => {
  mocks.auth.mockResolvedValue({ success: false, error: "Unauthorized" });
  expect(await listBrandAssetsAction()).toEqual({ success: false, error: "Unauthorized" }); expect(mocks.prisma.brandAsset.findMany).not.toHaveBeenCalled();
});
it("does not authorize invalid upload file fields", async () => {
  const data = form(); data.delete("file"); expect(await uploadBrandAssetAction(data)).toEqual({ success: false, error: "No file uploaded" });
  expect(mocks.ownerAccess).not.toHaveBeenCalled();
});
