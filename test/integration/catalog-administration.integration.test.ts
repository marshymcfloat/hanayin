import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { createTenantCatalogService, updateTenantCatalogService, deleteTenantCatalogService } from "@/features/catalog/services/service-administration";
import { createCatalogPackage, replaceCatalogPackage, deleteCatalogPackage } from "@/features/catalog/services/package-administration";
import { listTenantCatalogServices } from "@/features/catalog/queries/service-catalog";
import type { CatalogActorContext } from "@/features/catalog/catalog-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { Role, StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failInsert: null as null | "serviceFlow" | "packageItem" }));
vi.mock("server-only", () => ({}));
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, {
    get(client, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) =>
        client.$transaction(tx => work(new Proxy(tx, {
          get(transaction, member) {
            const delegate = Reflect.get(transaction, member);
            if (member !== "serviceFlow" && member !== "packageItem") return delegate;
            return new Proxy(delegate, {
              get(model, operation) {
                const value = Reflect.get(model, operation);
                if (typeof value !== "function") return value;
                return async (...args: unknown[]) => {
                  if (operation === "createMany" && controls.failInsert === member) throw new Error("Fixture insert failure");
                  return value.apply(model, args);
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

const factory = createSharedWorkflowFactory({ namespace: `integration-catalog-${randomUUID()}` });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const ownerUser = factory.user({ contactNumber: `test-catalog-owner-${randomUUID()}` });
const employeeUser = factory.user({ id: `${ownerUser.id}-employee`, contactNumber: `test-catalog-employee-${randomUUID()}` });
const tenantIds = [business.id, foreign.id];
let actor: CatalogActorContext;
let employee: CatalogActorContext;
let serviceIds: number[];
const serviceInput = { name: "Fixture service", category: "GENERAL", price: 100 };
const packageInput = { name: "Fixture package", category: "GENERAL", price: 150, items: [] as { serviceId: number; customPrice: number }[] };
const flow = () => ({ suggested_service_id: serviceIds[1], delay_duration: 7, delay_unit: "DAYS" as const, type: "SUGGESTED" as const });

describe("catalog graph administration in PostgreSQL", () => {
  beforeAll(async () => {
    for (const fixture of [business, foreign]) await prisma.business.create({ data: { id: fixture.id, slug: fixture.slug, name: fixture.name, initials: fixture.initials } });
    for (const [user, role] of [[ownerUser, Role.OWNER], [employeeUser, Role.EMPLOYEE]] as const) await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role } });
    const membership = await prisma.owner.create({ data: { user_id: ownerUser.id, business_id: business.id } });
    const staff = await prisma.employee.create({ data: { user_id: employeeUser.id, business_id: business.id, salary: 0, profile: StaffProfile.STAFF, permissions: [StaffPermission.CATALOG_MANAGE] } });
    const businessPolicy = { structure: "OWNER_EMPLOYEE_SELF_SERVICE" as const, allowEmployeeSelfBooking: true, managerCanServe: true };
    actor = { success: true, actorType: "OWNER", role: Role.OWNER, ownerId: membership.id, userId: ownerUser.id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy };
    employee = { ...actor, actorType: "EMPLOYEE", role: Role.EMPLOYEE, ownerId: null, employeeId: staff.id, userId: employeeUser.id, profile: StaffProfile.STAFF, permissions: [StaffPermission.CATALOG_MANAGE] };
  });
  beforeEach(async () => {
    controls.failInsert = null;
    await prisma.servicePackage.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.service.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.user.update({ where: { id: ownerUser.id }, data: { role: Role.OWNER } });
    await prisma.employee.update({ where: { id: employee.employeeId! }, data: { permissions: [StaffPermission.CATALOG_MANAGE], profile: StaffProfile.STAFF } });
    serviceIds = [];
    for (const [index, tenantId] of [business.id, business.id, foreign.id].entries()) {
      const fixture = factory.service({ name: `Fixture-${index}` });
      const service = await prisma.service.create({ data: { name: fixture.name, category: fixture.category, price: fixture.price, business_id: tenantId } });
      serviceIds.push(service.id);
    }
  });
  afterAll(async () => {
    controls.failInsert = null;
    let failures = 0;
    try {
      for (const cleanup of [
        () => prisma.servicePackage.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.service.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.business.deleteMany({ where: { id: { in: tenantIds } } }),
        () => prisma.user.deleteMany({ where: { id: { in: [ownerUser.id, employeeUser.id] } } }),
      ]) { try { await cleanup(); } catch { failures++; } }
    } finally { await prisma.$disconnect(); }
    if (failures) throw new Error(`Fixture cleanup failed in ${failures} steps`);
  });

  it("creates a service and all tenant flow links together", async () => {
    const created = await createTenantCatalogService(actor, { ...serviceInput, flows: [flow()] });
    expect(created).toMatchObject({ ...serviceInput, business_id: business.id });
    expect(await prisma.serviceFlow.findMany({ where: { trigger_service_id: created.id } })).toEqual([expect.objectContaining({ ...flow(), business_id: business.id })]);
  });

  it("retains omitted flows and clears an explicitly empty replacement", async () => {
    await prisma.serviceFlow.create({ data: { ...flow(), trigger_service_id: serviceIds[0], business_id: business.id } });
    await updateTenantCatalogService(actor, serviceIds[0], { name: "Patched" });
    expect(await prisma.serviceFlow.count({ where: { trigger_service_id: serviceIds[0] } })).toBe(1);
    await updateTenantCatalogService(actor, serviceIds[0], { flows: [] });
    expect(await prisma.serviceFlow.count({ where: { trigger_service_id: serviceIds[0] } })).toBe(0);
  });

  it("rolls back service metadata and deleted flows if replacement insertion fails", async () => {
    const prior = await prisma.serviceFlow.create({ data: { ...flow(), trigger_service_id: serviceIds[0], business_id: business.id } });
    controls.failInsert = "serviceFlow";
    await expect(updateTenantCatalogService(actor, serviceIds[0], { name: "Must roll back", flows: [{ ...flow(), delay_duration: 14 }] })).rejects.toThrow("Fixture insert failure");
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceIds[0] } })).name).toBe("Fixture-0");
    expect(await prisma.serviceFlow.findMany({ where: { trigger_service_id: serviceIds[0] } })).toEqual([prior]);
  });

  it("denies foreign suggested services without partial creation or update", async () => {
    const invalid = { ...flow(), suggested_service_id: serviceIds[2] };
    await expect(createTenantCatalogService(actor, { ...serviceInput, flows: [invalid] })).rejects.toThrow("invalid for this business");
    await expect(updateTenantCatalogService(actor, serviceIds[0], { name: "Must not change", flows: [invalid] })).rejects.toThrow("invalid for this business");
    expect(await prisma.service.count({ where: { business_id: business.id } })).toBe(2);
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceIds[0] } })).name).toBe("Fixture-0");
  });

  it("creates and replaces a package graph, including clearing all items", async () => {
    const created = await createCatalogPackage(actor, { ...packageInput, items: [{ serviceId: serviceIds[0], customPrice: 100 }] });
    expect(created.success).toBe(true);
    if (!created.success) throw new Error("Fixture package creation failed");
    expect((await replaceCatalogPackage(actor, created.data.id, { ...packageInput, items: [{ serviceId: serviceIds[1], customPrice: 90 }] })).success).toBe(true);
    expect(await prisma.packageItem.findMany({ where: { package_id: created.data.id } })).toEqual([expect.objectContaining({ service_id: serviceIds[1], custom_price: 90 })]);
    expect((await replaceCatalogPackage(actor, created.data.id, packageInput)).success).toBe(true);
    expect(await prisma.packageItem.count({ where: { package_id: created.data.id } })).toBe(0);
  });

  it("rolls back package metadata and deleted items if replacement insertion fails", async () => {
    const prior = await prisma.servicePackage.create({ data: { name: "Original", category: "GENERAL", price: 100, business_id: business.id, items: { create: { service_id: serviceIds[0], custom_price: 80 } } }, include: { items: true } });
    controls.failInsert = "packageItem";
    expect(await replaceCatalogPackage(actor, prior.id, { ...packageInput, items: [{ serviceId: serviceIds[1], customPrice: 90 }] })).toEqual({ success: false, error: "Failed to update package" });
    expect(await prisma.servicePackage.findUniqueOrThrow({ where: { id: prior.id }, include: { items: true } })).toEqual(prior);
  });

  it("denies foreign package references and foreign package targets", async () => {
    expect((await createCatalogPackage(actor, { ...packageInput, items: [{ serviceId: serviceIds[2], customPrice: 1 }] })).success).toBe(false);
    const foreignPackage = await prisma.servicePackage.create({ data: { name: "Foreign", category: "GENERAL", price: 100, business_id: foreign.id } });
    expect(await replaceCatalogPackage(actor, foreignPackage.id, packageInput)).toEqual({ success: false, error: "Package not found or unauthorized" });
    expect(await prisma.servicePackage.findUniqueOrThrow({ where: { id: foreignPackage.id } })).toEqual(foreignPackage);
    expect(await prisma.servicePackage.count({ where: { business_id: business.id } })).toBe(0);
  });

  it.each(["owner role", "employee capability"])("denies %s revoked after context resolution", async revoked => {
    const current = revoked === "owner role" ? actor : employee;
    const pkg = await prisma.servicePackage.create({ data: { ...packageInput, items: undefined, business_id: business.id } });
    if (revoked === "owner role") await prisma.user.update({ where: { id: ownerUser.id }, data: { role: Role.EMPLOYEE } });
    else await prisma.employee.update({ where: { id: employee.employeeId! }, data: { permissions: [StaffPermission.BOOKING_CREATE] } });
    await expect(createTenantCatalogService(current, serviceInput)).rejects.toThrow("Forbidden");
    expect(await createCatalogPackage(current, packageInput)).toEqual({ success: false, error: "Forbidden" });
    await expect(deleteTenantCatalogService(current, serviceIds[0])).rejects.toThrow("Forbidden");
    expect(await deleteCatalogPackage(current, pkg.id)).toEqual({ success: false, error: "Forbidden" });
    expect(await prisma.service.count({ where: { business_id: business.id } })).toBe(2);
    expect(await prisma.servicePackage.count({ where: { business_id: business.id } })).toBe(1);
  });

  it("deletes only tenant aggregates and their dependent item/flow rows", async () => {
    const pkg = await prisma.servicePackage.create({ data: { name: "Delete fixture", category: "GENERAL", price: 100, business_id: business.id, items: { create: { service_id: serviceIds[0], custom_price: 80 } } } });
    await prisma.serviceFlow.create({ data: { ...flow(), trigger_service_id: serviceIds[0], business_id: business.id } });
    expect((await deleteCatalogPackage(actor, pkg.id)).success).toBe(true);
    expect(await prisma.packageItem.count({ where: { package_id: pkg.id } })).toBe(0);
    await deleteTenantCatalogService(actor, serviceIds[0]);
    expect(await prisma.serviceFlow.count({ where: { trigger_service_id: serviceIds[0] } })).toBe(0);
    expect(await prisma.service.findUnique({ where: { id: serviceIds[0] } })).toBeNull();
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceIds[2] } })).business_id).toBe(foreign.id);
  });

  it("denies deletion of foreign services and packages", async () => {
    const pkg = await prisma.servicePackage.create({ data: { name: "Foreign delete fixture", category: "GENERAL", price: 100, business_id: foreign.id } });
    await expect(deleteTenantCatalogService(actor, serviceIds[2])).rejects.toThrow("Service not found or unauthorized");
    expect(await deleteCatalogPackage(actor, pkg.id)).toEqual({ success: false, error: "Package not found or unauthorized" });
    expect(await prisma.servicePackage.findUniqueOrThrow({ where: { id: pkg.id } })).toEqual(pkg);
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceIds[2] } })).business_id).toBe(foreign.id);
  });

  it("does not return legacy cross-tenant suggested-service links", async () => {
    await prisma.serviceFlow.create({ data: { ...flow(), suggested_service_id: serviceIds[2], trigger_service_id: serviceIds[0], business_id: business.id } });
    expect((await listTenantCatalogServices(actor)).find(service => service.id === serviceIds[0])?.flow_triggers).toEqual([]);
  });
});
