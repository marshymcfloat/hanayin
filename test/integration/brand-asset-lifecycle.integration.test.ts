import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { persistBrandAsset } from "@/features/assets/services/brand-assets";
import { uploadTenantBrandAsset, deleteTenantBrandAsset } from "@/features/assets/services/brand-asset-lifecycle";
import type { BrandAssetUpload } from "@/features/assets/brand-asset-schemas";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { BrandAssetKind, OwnerPermission, Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failCreate: false, insertedBeforeFailure: false, onUpload: null as null | (() => Promise<void>), put: vi.fn(), del: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({ put: controls.put, del: controls.del }));
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, {
    get(client, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) =>
        client.$transaction(tx => work(new Proxy(tx, {
          get(transaction, member) {
            const delegate = Reflect.get(transaction, member);
            if (member !== "brandAsset") return delegate;
            return new Proxy(delegate, {
              get(model, operation) {
                const value = Reflect.get(model, operation);
                if (typeof value !== "function") return value;
                return async (...args: unknown[]) => {
                  const result = await value.apply(model, args);
                  if (operation === "create" && controls.failCreate) {
                    controls.insertedBeforeFailure = true;
                    throw new Error("Fixture post-insert failure");
                  }
                  return result;
                };
              },
            });
          },
        })), options);
      const value = Reflect.get(client, key);
      return typeof value === "function" ? value.bind(client) : value;
    },
  }) };
});
requireTestDatabase();

const factory = createSharedWorkflowFactory({ namespace: `integration-assets-${randomUUID()}` });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const user = factory.user({ contactNumber: `test-asset-owner-${randomUUID()}` });
const foreignStaff = factory.user({ id: `${user.id}-foreign-staff`, role: "EMPLOYEE", contactNumber: `test-asset-staff-${randomUUID()}` });
const tenantIds = [business.id, foreign.id];
const blob = { url: "https://example.test/fixture-asset.png", pathname: "fixture-asset.png" };
let context: OwnerActorContext;
let ownServiceId: number;
let foreignServiceId: number;
let foreignEmployeeId: number;
const upload = (patch: Partial<BrandAssetUpload> = {}): BrandAssetUpload => ({ file: new File(["fixture"], "fixture.png", { type: "image/png" }), kind: BrandAssetKind.SERVICE, alt: "Fixture asset", serviceId: ownServiceId, employeeId: null, referenceSubject: null, ...patch });

describe("brand asset lifecycle in PostgreSQL with mocked Blob IO", () => {
  beforeAll(async () => {
    for (const fixture of [business, foreign]) await prisma.business.create({ data: { id: fixture.id, slug: fixture.slug, name: fixture.name, initials: fixture.initials } });
    for (const fixture of [user, foreignStaff]) await prisma.user.create({ data: { id: fixture.id, contact_number: fixture.contactNumber, name: fixture.name, hashed_password: fixture.hashedPassword, role: fixture.role } });
    const membership = await prisma.owner.create({ data: { user_id: user.id, business_id: business.id, permissions: [OwnerPermission.SETTINGS_MANAGE] } });
    const employee = await prisma.employee.create({ data: { user_id: foreignStaff.id, business_id: foreign.id, salary: 0 } });
    foreignEmployeeId = employee.id;
    context = { success: true, actorType: "OWNER", role: Role.OWNER, ownerId: membership.id, userId: user.id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
  });
  beforeEach(async () => {
    controls.failCreate = false; controls.insertedBeforeFailure = false; controls.onUpload = null;
    controls.put.mockReset(); controls.del.mockReset();
    controls.put.mockImplementation(async () => { await controls.onUpload?.(); return blob; });
    controls.del.mockResolvedValue(undefined);
    await prisma.brandAsset.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.service.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.user.update({ where: { id: user.id }, data: { role: Role.OWNER } });
    await prisma.owner.update({ where: { id: context.ownerId }, data: { permissions: [OwnerPermission.SETTINGS_MANAGE], business_id: business.id } });
    const own = await prisma.service.create({ data: { name: "Fixture service", category: "GENERAL", price: 100, business_id: business.id } });
    const other = await prisma.service.create({ data: { name: "Foreign service", category: "GENERAL", price: 100, business_id: foreign.id } });
    ownServiceId = own.id; foreignServiceId = other.id;
  });
  afterAll(async () => {
    controls.failCreate = false; controls.onUpload = null;
    let failures = 0;
    try {
      for (const cleanup of [
        () => prisma.brandAsset.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.service.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.business.deleteMany({ where: { id: { in: tenantIds } } }),
        () => prisma.user.deleteMany({ where: { id: { in: [user.id, foreignStaff.id] } } }),
      ]) { try { await cleanup(); } catch { failures++; } }
    } finally { await prisma.$disconnect(); }
    if (failures) throw new Error(`Fixture cleanup failed in ${failures} steps`);
  });

  it("persists verified owner and tenant references without returning storage internals", async () => {
    const created = await persistBrandAsset(context, upload(), blob);
    const stored = await prisma.brandAsset.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored).toMatchObject({ business_id: business.id, uploaded_by_user_id: user.id, service_id: ownServiceId, employee_id: null, url: blob.url, storage_key: blob.pathname });
    expect(Object.keys(created).sort()).toEqual(["id", "kind", "reference_subject", "url", "alt", "service_id", "employee_id", "created_at"].sort());
    expect(controls.put).not.toHaveBeenCalled(); expect(controls.del).not.toHaveBeenCalled();
  });

  it.each(["owner role", "settings capability", "owner membership", "service membership"])("rechecks %s changed during upload and compensates the mock Blob", async changed => {
    controls.onUpload = async () => {
      if (changed === "owner role") await prisma.user.update({ where: { id: user.id }, data: { role: Role.EMPLOYEE } });
      else if (changed === "settings capability") await prisma.owner.update({ where: { id: context.ownerId }, data: { permissions: [] } });
      else if (changed === "owner membership") await prisma.owner.update({ where: { id: context.ownerId }, data: { business_id: foreign.id } });
      else await prisma.service.update({ where: { id: ownServiceId }, data: { business_id: foreign.id } });
    };
    expect(await uploadTenantBrandAsset(context, upload())).toEqual({ success: false, error: changed === "service membership" ? "Service not found." : "Forbidden" });
    expect(await prisma.brandAsset.count({ where: { business_id: business.id } })).toBe(0);
    expect(controls.put).toHaveBeenCalledTimes(1);
    expect(controls.del).toHaveBeenCalledExactlyOnceWith(blob.url);
  });

  it.each(["service", "employee"])("denies a foreign %s before uploading", async reference => {
    const input = reference === "service" ? upload({ serviceId: foreignServiceId }) : upload({ kind: BrandAssetKind.EMPLOYEE, serviceId: null, employeeId: foreignEmployeeId });
    expect(await uploadTenantBrandAsset(context, input)).toEqual({ success: false, error: reference === "service" ? "Service not found." : "Employee not found." });
    expect(await prisma.brandAsset.count({ where: { business_id: business.id } })).toBe(0);
    expect(controls.put).not.toHaveBeenCalled(); expect(controls.del).not.toHaveBeenCalled();
  });

  it("rolls a real inserted row back and compensates Blob on a later transaction failure", async () => {
    controls.failCreate = true;
    expect(await uploadTenantBrandAsset(context, upload())).toEqual({ success: false, error: "Failed to save asset." });
    expect(controls.insertedBeforeFailure).toBe(true);
    expect(await prisma.brandAsset.count({ where: { business_id: business.id } })).toBe(0);
    expect(controls.put).toHaveBeenCalledTimes(1);
    expect(controls.del).toHaveBeenCalledExactlyOnceWith(blob.url);
  });

  it("keeps committed DB deletion when the mocked Blob deletion fails", async () => {
    const prior = await persistBrandAsset(context, upload(), blob);
    controls.del.mockRejectedValue(new Error("Fixture provider failure"));
    expect(await deleteTenantBrandAsset(context, prior.id)).toEqual({ success: true });
    expect(await prisma.brandAsset.findUnique({ where: { id: prior.id } })).toBeNull();
    expect(controls.del).toHaveBeenCalledExactlyOnceWith(blob.url);
  });

  it("does not remove a foreign asset or call Blob deletion", async () => {
    const prior = await prisma.brandAsset.create({ data: { business_id: foreign.id, kind: BrandAssetKind.LOGO, url: blob.url, storage_key: blob.pathname } });
    expect(await deleteTenantBrandAsset(context, prior.id)).toEqual({ success: false, error: "Asset not found" });
    expect(await prisma.brandAsset.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
    expect(controls.del).not.toHaveBeenCalled();
  });
});
