import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffPermission } from "@/prisma/generated/prisma/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), permission: vi.fn(), currentAccess: vi.fn(),
  transaction: vi.fn(), count: vi.fn(), findFirst: vi.fn(),
  create: vi.fn(), update: vi.fn(), delete: vi.fn(),
  deleteItems: vi.fn(), createItems: vi.fn(), path: vi.fn(), tag: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ requireStaffPermission: mocks.permission }));
vi.mock("@/features/catalog/catalog-access", () => ({ hasCurrentCatalogWriteAccess: mocks.currentAccess }));
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.path, revalidateTag: mocks.tag }));
vi.mock("@/lib/data/cached", () => ({ tenantCacheTags: { packagesByBusiness: (id: string) => `packages:${id}` } }));

import { createPackageAction, updatePackageAction, deletePackageAction } from "./packages";

const input = { businessSlug: "tenant-a", name: "Starter", category: "Bundles", price: 1500, duration: 60, description: "Starter package", items: [{ serviceId: 99, customPrice: 800 }] };
const context = { success: true, businessId: "biz_a", businessSlug: "tenant-a", userId: "user_a", actorType: "OWNER", ownerId: 7 };
const record = {
  id: 12,
  name: "Starter",
  description: "Starter package",
  category: "Bundles",
  price: 1500,
  duration: 60,
  business_id: "biz_a",
  created_at: new Date("2026-09-01T00:00:00.000Z"),
  updated_at: new Date("2026-09-01T00:00:00.000Z"),
  items: [{ custom_price: 800, service: { id: 99, name: "Hair Cut", category: "Hair", duration: 45, price: 1000.125 } }],
  availed_services: [{ booking_id: 1 }, { booking_id: 1 }, { booking_id: 2 }],
};
const packageMutationData = {
  revision: 0, choices: [],
  id: 12,
  name: "Starter",
  description: "Starter package",
  category: "Bundles",
  price: 1500,
  durationMinutes: 60,
  originalPrice: 1000.13,
  monthlySales: 2,
  services: [{ id: 99, name: "Hair Cut", category: "Hair", durationMinutes: 45, price: 1000.125, packageItemPrice: 800 }],
};
const tx = {
  service: { count: mocks.count },
  servicePackage: { findFirst: mocks.findFirst, create: mocks.create, update: mocks.update, delete: mocks.delete },
  packageItem: { deleteMany: mocks.deleteItems, createMany: mocks.createItems },
};
const calls = [
  { name: "create", run: () => createPackageAction(input), fallback: "Failed to create package" },
  { name: "update", run: () => updatePackageAction(12, input), fallback: "Failed to update package" },
  { name: "delete", run: () => deletePackageAction(12), fallback: "Failed to delete package" },
];

describe("package administration boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a" });
    mocks.permission.mockResolvedValue({ success: true, context });
    mocks.currentAccess.mockResolvedValue(true);
    mocks.transaction.mockImplementation(async callback => callback(tx));
    mocks.count.mockResolvedValue(1);
    mocks.findFirst.mockResolvedValue(record);
    mocks.create.mockResolvedValue(record);
    mocks.update.mockResolvedValue({ id: 12 });
    mocks.delete.mockResolvedValue({ id: 12 });
    mocks.deleteItems.mockResolvedValue({ count: 1 });
    mocks.createItems.mockResolvedValue({ count: 1 });
  });

  it("rejects package services outside the verified tenant before graph writes", async () => {
    mocks.count.mockResolvedValue(0);
    expect(await createPackageAction(input)).toEqual({ success: false, error: "One or more package services are invalid for this business." });
    expect(mocks.count).toHaveBeenCalledWith({ where: { business_id: "biz_a", id: { in: [99] } } });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.path).not.toHaveBeenCalled();
  });

  it("rejects update for a package outside the verified tenant", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await updatePackageAction(12, input)).toEqual({ success: false, error: "Package not found or unauthorized" });
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: 12, business_id: "biz_a" }, select: { id: true, choices: true, revision: true } });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns permission error when catalog management is missing", async () => {
    mocks.permission.mockResolvedValue({ success: false, error: "Forbidden" });
    expect(await createPackageAction(input)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects create slug mismatch without entering persistence", async () => {
    expect(await createPackageAction({ ...input, businessSlug: "tenant-b" })).toEqual({ success: false, error: "Unauthorized operation for this business." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(calls)("$name requires current CATALOG_MANAGE and subscription write access", async ({ run }) => {
    await run();
    expect(mocks.permission).toHaveBeenCalledWith("tenant-a", StaffPermission.CATALOG_MANAGE, { write: true });
    expect(mocks.currentAccess).toHaveBeenCalledWith(tx, context);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  });

  it.each(calls)("$name rejects unauthenticated callers without persistence", async ({ run }) => {
    mocks.auth.mockResolvedValue({ success: false, error: "Unauthorized" });
    expect(await run()).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(calls)("$name rejects subscription write gate failures without persistence", async ({ run }) => {
    mocks.permission.mockResolvedValue({ success: false, error: "Subscription is read-only" });
    expect(await run()).toEqual({ success: false, error: "Subscription is read-only" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(calls)("$name rejects revoked current transaction membership or capability", async ({ run }) => {
    mocks.currentAccess.mockResolvedValue(false);
    expect(await run()).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.path).not.toHaveBeenCalled();
  });

  it("creates only validated scalar fields and verified tenant identity", async () => {
    expect(await createPackageAction({ ...input, business_id: "evil", id: 999, items: [{ serviceId: 99, customPrice: 800, package_id: 99 }] } as unknown as typeof input)).toEqual({ success: true, data: packageMutationData });
    expect(mocks.create).toHaveBeenCalledWith({
      data: { name: input.name, category: input.category, description: input.description, price: input.price, duration: input.duration, business_id: "biz_a", items: { create: [{ service_id: 99, custom_price: 800 }] } },
      select: expect.objectContaining({ id: true, business_id: true }),
    });
    expect(mocks.count.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
  });

  it("atomically replaces package metadata and tenant-scoped items", async () => {
    expect(await updatePackageAction(12, input)).toEqual({ success: true, data: packageMutationData });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 12, business_id: "biz_a" } }));
    expect(mocks.deleteItems).toHaveBeenCalledWith({ where: { package_id: 12, package: { business_id: "biz_a" } } });
    expect(mocks.createItems).toHaveBeenCalledWith({ data: [{ package_id: 12, service_id: 99, custom_price: 800 }] });
    expect(mocks.count.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteItems.mock.invocationCallOrder[0]);
  });

  it("items=[] clears the graph without querying or creating services", async () => {
    expect((await updatePackageAction(12, { ...input, items: [] })).success).toBe(true);
    expect(mocks.deleteItems).toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.createItems).not.toHaveBeenCalled();
  });

  it("permits an empty create graph", async () => {
    expect((await createPackageAction({ ...input, items: [] })).success).toBe(true);
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ items: { create: [] } }) }));
  });

  it("denies foreign services inside update transaction before metadata or item changes", async () => {
    mocks.count.mockResolvedValue(0);
    expect((await updatePackageAction(12, input)).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteItems).not.toHaveBeenCalled();
  });

  it("deletes with verified tenant predicates and returns a stable reconciliation id", async () => {
    expect(await deletePackageAction(12)).toEqual({ success: true, data: { id: 12 } });
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 12, business_id: "biz_a" }, select: { id: true } });
  });

  it("denies a missing delete target", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await deletePackageAction(12)).toEqual({ success: false, error: "Package not found or unauthorized" });
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it.each(calls)("$name invalidates verified caches only after committed success", async ({ run }) => {
    await run();
    expect(mocks.path).toHaveBeenNthCalledWith(1, "/app/tenant-a/packages");
    expect(mocks.path).toHaveBeenNthCalledWith(2, "/owner-dashboard-preview/tenant-a/packages");
    expect(mocks.path).toHaveBeenCalledTimes(2);
    expect(mocks.tag).toHaveBeenCalledExactlyOnceWith("packages:biz_a", "max");
  });

  it.each(calls)("$name returns safe conflict errors without cache invalidation", async ({ run }) => {
    mocks.transaction.mockRejectedValue({ code: "P2034", message: "sensitive sql" });
    expect(await run()).toEqual({ success: false, error: "Package settings changed. Refresh and try again." });
    expect(mocks.path).not.toHaveBeenCalled();
    expect(mocks.tag).not.toHaveBeenCalled();
  });

  it.each(calls)("$name safely handles transaction errors", async ({ run, fallback }) => {
    mocks.transaction.mockRejectedValue(new Error("private connection details"));
    expect(await run()).toEqual({ success: false, error: fallback });
    expect(mocks.path).not.toHaveBeenCalled();
  });

  it.each(calls)("$name safely handles authentication errors", async ({ run, fallback }) => {
    mocks.auth.mockRejectedValue(new Error("private session details"));
    expect(await run()).toEqual({ success: false, error: fallback });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    { stage: "service verification", mock: mocks.count },
    { stage: "metadata update", mock: mocks.update },
    { stage: "item deletion", mock: mocks.deleteItems },
    { stage: "item insertion", mock: mocks.createItems },
  ])("does not invalidate caches on failure at $stage", async ({ mock }) => {
    mock.mockRejectedValue(new Error("private sql details"));
    expect(await updatePackageAction(12, input)).toEqual({ success: false, error: "Failed to update package" });
    expect(mocks.path).not.toHaveBeenCalled();
    expect(mocks.tag).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Infinity, 2147483648, "12", null])("rejects invalid package IDs %s before auth", async id => {
    expect(await updatePackageAction(id as number, input)).toEqual({ success: false, error: "Invalid input" });
    expect(await deletePackageAction(id as number)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it.each([
    { ...input, price: Infinity },
    { ...input, name: "a".repeat(201) },
    { ...input, items: [{ serviceId: 0, customPrice: 0 }] },
    { ...input, items: [{ serviceId: 99, customPrice: NaN }] },
    { ...input, items: Array.from({ length: 101 }, (_, index) => ({ serviceId: index + 1, customPrice: 0 })) },
    { ...input, items: [{ serviceId: 99, customPrice: 1 }, { serviceId: 99, customPrice: 2 }] },
  ])("rejects malformed payloads before authentication", async invalid => {
    expect(await createPackageAction(invalid)).toEqual({ success: false, error: "Invalid input" });
    expect(await updatePackageAction(12, invalid)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
