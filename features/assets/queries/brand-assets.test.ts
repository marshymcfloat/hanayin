import { expect, it, vi } from "vitest";
import type { BrandAssetActor } from "@/features/assets/brand-asset-types";
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/prisma/prisma", () => ({ prisma: { brandAsset: { findMany } } }));
import { listTenantBrandAssets, brandAssetViewSelect } from "./brand-assets";
const actor = { actorType: "OWNER", role: "OWNER", ownerId: 3, userId: "user-a", businessId: "biz-a", businessSlug: "tenant-a" } as BrandAssetActor;
it("selects only public library fields and scopes reads by current membership", async () => {
  const row = { id: "asset-a", kind: "LOGO", reference_subject: null, url: "url", alt: null, service_id: null, employee_id: null, created_at: new Date() };
  findMany.mockResolvedValue([row]); expect(await listTenantBrandAssets(actor, "LOGO")).toEqual([row]);
  expect(findMany).toHaveBeenCalledWith({ where: { business_id: "biz-a", kind: "LOGO", business: { id: "biz-a", slug: "tenant-a", owners: { some: { id: 3, user_id: "user-a", business_id: "biz-a", user: { role: "OWNER" } } } } }, orderBy: [{ kind: "asc" }, { created_at: "desc" }], select: brandAssetViewSelect });
  expect(Object.keys(brandAssetViewSelect).sort()).toEqual(["alt", "created_at", "employee_id", "id", "kind", "reference_subject", "service_id", "url"]);
});
it("does not add kind restriction when omitted", async () => {
  findMany.mockResolvedValue([]); expect(await listTenantBrandAssets(actor)).toEqual([]);
  expect(findMany.mock.lastCall?.[0].where).not.toHaveProperty("kind");
});
