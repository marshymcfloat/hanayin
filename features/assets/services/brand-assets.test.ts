import { beforeEach, expect, it, vi } from "vitest";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { BrandAssetUpload } from "@/features/assets/brand-asset-schemas";
const mocks = vi.hoisted(() => ({ owner: { findFirst: vi.fn() }, service: { findFirst: vi.fn() }, employee: { findFirst: vi.fn() }, brandAsset: { create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() }, $transaction: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: mocks }));
import { persistBrandAsset, removeBrandAsset, brandAssetFailure, BrandAssetError } from "./brand-assets";
import { uploadTenantBrandAsset, deleteTenantBrandAsset } from "./brand-asset-lifecycle";
const blob = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
const actor = { success: true, actorType: "OWNER", role: "OWNER", ownerId: 3, businessId: "biz-a", businessSlug: "tenant-a", userId: "user-a", employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } } satisfies OwnerActorContext;
function input(): BrandAssetUpload { return { file: new File(["x"], "x.png", { type: "image/png" }), kind: "LOGO", alt: null, serviceId: null, employeeId: null, referenceSubject: null }; }
beforeEach(() => {
  vi.resetAllMocks(); mocks.$transaction.mockImplementation(callback => callback(mocks)); mocks.owner.findFirst.mockResolvedValue({ id: 3 }); mocks.service.findFirst.mockResolvedValue({ id: 9 }); mocks.employee.findFirst.mockResolvedValue({ id: 7 });
  mocks.brandAsset.create.mockResolvedValue({ id: "asset-a", url: "https://blob.invalid/photo" }); mocks.brandAsset.findFirst.mockResolvedValue({ id: "asset-a", url: "https://blob.invalid/photo" }); mocks.brandAsset.deleteMany.mockResolvedValue({ count: 1 }); blob.put.mockResolvedValue({ url: "https://blob.invalid/photo", pathname: "key" }); blob.del.mockResolvedValue(undefined);
});
it.each(["EMPLOYEE", "PLATFORM_ADMIN"])("denies runtime %s before DB or Blob IO", async role => {
  const context = { ...actor, actorType: role, role } as unknown as OwnerActorContext;
  await expect(persistBrandAsset(context, input(), { url: "url", pathname: "key" })).rejects.toThrow("Forbidden");
  await expect(removeBrandAsset(context, "asset")).rejects.toThrow("Forbidden");
  expect(await uploadTenantBrandAsset(context, input())).toEqual({ success: false, error: "Forbidden" });
  expect(mocks.$transaction).not.toHaveBeenCalled(); expect(blob.put).not.toHaveBeenCalled();
});
it("repeats service reference after preflight; disappearing reference compensates with no row", async () => {
  mocks.service.findFirst.mockResolvedValueOnce({ id: 9 }).mockResolvedValueOnce(null);
  expect(await uploadTenantBrandAsset(actor, { ...input(), kind: "SERVICE", serviceId: 9 })).toEqual({ success: false, error: "Service not found." });
  expect(mocks.service.findFirst).toHaveBeenCalledTimes(2); expect(mocks.brandAsset.create).not.toHaveBeenCalled(); expect(blob.del).toHaveBeenCalledWith("https://blob.invalid/photo");
});
it("denies foreign employee before upload and repeats valid employee inside TX", async () => {
  const data = { ...input(), kind: "EMPLOYEE" as const, employeeId: 7 };
  mocks.employee.findFirst.mockResolvedValueOnce(null);
  expect(await uploadTenantBrandAsset(actor, data)).toEqual({ success: false, error: "Employee not found." }); expect(blob.put).not.toHaveBeenCalled();
  expect((await uploadTenantBrandAsset(actor, data)).success).toBe(true); expect(mocks.employee.findFirst).toHaveBeenCalledTimes(3);
  expect(mocks.employee.findFirst).toHaveBeenCalledWith({ where: { id: 7, business_id: "biz-a" }, select: { id: true } });
});
it("does not hold DB transaction while external Blob APIs run", async () => {
  let inTx = false;
  mocks.$transaction.mockImplementation(async callback => { inTx = true; try { return await callback(mocks); } finally { inTx = false; } });
  blob.put.mockImplementation(async () => { expect(inTx).toBe(false); return { url: "https://blob.invalid/photo", pathname: "key" }; }); blob.del.mockImplementation(async () => { expect(inTx).toBe(false); });
  expect((await uploadTenantBrandAsset(actor, input())).success).toBe(true); expect(await deleteTenantBrandAsset(actor, "asset-a")).toEqual({ success: true });
});
it("upload failure does not create DB row or attempt deletion", async () => {
  blob.put.mockRejectedValue(new Error("provider secret")); expect(await uploadTenantBrandAsset(actor, input())).toEqual({ success: false, error: "Upload failed." }); expect(mocks.$transaction).not.toHaveBeenCalled(); expect(blob.del).not.toHaveBeenCalled();
});
it("safe-fails unexpected preflight failure and unsupported extension without upload", async () => {
  mocks.service.findFirst.mockRejectedValue(new Error("SQL secret")); expect(await uploadTenantBrandAsset(actor, { ...input(), kind: "SERVICE", serviceId: 9 })).toEqual({ success: false, error: "Failed to save asset." });
  expect(await uploadTenantBrandAsset(actor, { ...input(), file: new File(["x"], "x", { type: "text/plain" }) })).toEqual({ success: false, error: "Could not infer file extension." }); expect(blob.put).not.toHaveBeenCalled();
});
it("failed compensation remains safe; serializable conflict instructs refresh", async () => {
  mocks.$transaction.mockRejectedValue({ code: "P2034", secret: "hidden" }); blob.del.mockRejectedValue(new Error("secret")); expect(await uploadTenantBrandAsset(actor, input())).toEqual({ success: false, error: "Asset changed. Refresh and try again." });
});
it("CAS mismatch does not call external Blob deletion", async () => {
  mocks.brandAsset.deleteMany.mockResolvedValue({ count: 0 }); expect(await deleteTenantBrandAsset(actor, "asset-a")).toEqual({ success: false, error: "Asset changed. Refresh and try again." }); expect(blob.del).not.toHaveBeenCalled();
});
it("revoked current owner cannot delete row", async () => {
  mocks.owner.findFirst.mockResolvedValue(null); expect(await deleteTenantBrandAsset(actor, "asset-a")).toEqual({ success: false, error: "Forbidden" }); expect(mocks.brandAsset.findFirst).not.toHaveBeenCalled(); expect(blob.del).not.toHaveBeenCalled();
});
it("maps only owned domain errors and serializable conflicts; hides all other failures", () => {
  expect(brandAssetFailure(new BrandAssetError("Asset not found"), "fallback")).toBe("Asset not found");
  for (const error of [null, "secret", new Error("secret"), { code: "P2025", sql: "secret" }]) expect(brandAssetFailure(error, "fallback")).toBe("fallback");
});
