import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { commitSaleEventCreation, updateTenantSaleEvent, deleteTenantSaleEvent } from "@/features/catalog/services/sale-event-administration";
import { listPublicActiveSaleEvents } from "@/features/catalog/queries/sale-event-administration";
import type { SaleEventActorContext } from "@/features/catalog/sale-event-access";
import type { CreateSaleEventInput } from "@/features/catalog/sale-event-schemas";
import type { PreparedSaleSocialDraft } from "@/features/catalog/sale-event-types";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { Role, SocialPlatform } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failAfter: null as null | "saleEvent" | "socialPostTarget" | "auditLog" }));
vi.mock("server-only", () => ({}));
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, {
    get(client, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) =>
        client.$transaction(tx => work(new Proxy(tx, {
          get(transaction, member) {
            const delegate = Reflect.get(transaction, member);
            if (member !== "saleEvent" && member !== "socialPostTarget" && member !== "auditLog") return delegate;
            return new Proxy(delegate, {
              get(model, operation) {
                const value = Reflect.get(model, operation);
                if (typeof value !== "function") return value;
                return async (...args: unknown[]) => {
                  const result = await value.apply(model, args);
                  if (controls.failAfter === member && (operation === "update" || operation === "create" || operation === "createMany")) throw new Error("Fixture post-write failure");
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

const factory = createSharedWorkflowFactory({ namespace: `integration-sale-events-${randomUUID()}` });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const user = factory.user({ contactNumber: `test-sale-owner-${randomUUID()}` });
const tenantIds = [business.id, foreign.id];
let context: SaleEventActorContext;
let services: number[];
let packages: number[];
let connectionId: string;
const start = new Date("2030-01-15T09:00:00.000Z");
const end = new Date("2030-01-16T09:00:00.000Z");
const input = (patch: Partial<CreateSaleEventInput> = {}): CreateSaleEventInput => ({ businessSlug: business.slug, title: "Fixture sale", startDate: start, endDate: end, discountType: "PERCENTAGE", discountValue: 10, serviceIds: [services[0]], packageIds: [packages[0]], slotLimit: 3, ...patch });
const draft = (): PreparedSaleSocialDraft => ({ targets: [{ id: connectionId, platform: SocialPlatform.FACEBOOK_PAGE }], caption: "Fixture draft", captionFinal: "Fixture final", hashtags: ["#fixture"], mediaUrl: "https://example.test/fixture.png" });
const ownSale = () => prisma.saleEvent.findFirstOrThrow({ where: { business_id: business.id }, include: { applicable_services: true, applicable_packages: true } });

describe("atomic sale event administration in PostgreSQL", () => {
  beforeAll(async () => {
    for (const fixture of [business, foreign]) await prisma.business.create({ data: { id: fixture.id, slug: fixture.slug, name: fixture.name, initials: fixture.initials } });
    await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: Role.OWNER } });
    const membership = await prisma.owner.create({ data: { user_id: user.id, business_id: business.id } });
    context = { success: true, actorType: "OWNER", role: Role.OWNER, ownerId: membership.id, userId: user.id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
  });
  beforeEach(async () => {
    controls.failAfter = null;
    await prisma.auditLog.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.booking.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.socialPost.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.socialConnection.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.saleEvent.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.servicePackage.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.service.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.user.update({ where: { id: user.id }, data: { role: Role.OWNER } });
    services = []; packages = [];
    for (const [index, tenantId] of [business.id, business.id, foreign.id].entries()) {
      services.push((await prisma.service.create({ data: { name: `Fixture-${index}`, category: "GENERAL", price: 100, business_id: tenantId } })).id);
      packages.push((await prisma.servicePackage.create({ data: { name: `Fixture-${index}`, category: "GENERAL", price: 100, business_id: tenantId } })).id);
    }
    const connection = await prisma.socialConnection.create({ data: { business_id: business.id, platform: SocialPlatform.FACEBOOK_PAGE, external_account_id: `fixture-${randomUUID()}`, display_name: "Fixture page", access_token_encrypted: "fixture-not-a-token", status: "CONNECTED" } });
    connectionId = connection.id;
  });
  afterAll(async () => {
    controls.failAfter = null;
    let failures = 0;
    try {
      for (const cleanup of [
        () => prisma.auditLog.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.booking.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.socialPost.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.business.deleteMany({ where: { id: { in: tenantIds } } }),
        () => prisma.user.deleteMany({ where: { id: user.id } }),
      ]) { try { await cleanup(); } catch { failures++; } }
    } finally { await prisma.$disconnect(); }
    if (failures) throw new Error(`Fixture cleanup failed in ${failures} steps`);
  });

  it("commits the tenant sale graph without a social draft", async () => {
    await commitSaleEventCreation(context, input(), null);
    const sale = await ownSale();
    expect(sale).toMatchObject({ business_id: business.id, title: "Fixture sale", slot_limit: 3 });
    expect(sale.applicable_services.map(service => service.id)).toEqual([services[0]]);
    expect(sale.applicable_packages.map(pkg => pkg.id)).toEqual([packages[0]]);
    expect(await prisma.socialPost.count({ where: { business_id: business.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { business_id: business.id } })).toBe(0);
  });

  it("commits sale, post, targets and verified actor audit together", async () => {
    await commitSaleEventCreation(context, input({ createSocialDraft: true }), draft());
    const sale = await ownSale();
    const post = await prisma.socialPost.findFirstOrThrow({ where: { business_id: business.id }, include: { targets: true } });
    expect(sale).toMatchObject({ business_id: business.id, title: "Fixture sale", start_date: start, end_date: end, discount_type: "PERCENTAGE", discount_value: 10, slot_limit: 3 });
    expect(sale.applicable_services.map(service => service.id)).toEqual([services[0]]);
    expect(sale.applicable_packages.map(pkg => pkg.id)).toEqual([packages[0]]);
    expect(post).toMatchObject({ sale_event_id: sale.id, business_id: business.id, source: "SALE_EVENT", status: "READY", caption_draft: "Fixture draft", caption_final: "Fixture final", hashtags: ["#fixture"], media_url: "https://example.test/fixture.png", created_by_user_id: user.id });
    expect(post.targets).toEqual([expect.objectContaining({ social_post_id: post.id, social_connection_id: connectionId, status: "SKIPPED" })]);
    expect(await prisma.auditLog.findMany({ where: { business_id: business.id } })).toEqual([expect.objectContaining({ entity_type: "SocialPost", entity_id: post.id, action: "DRAFT_CREATED", actor_id: user.id, actor_type: "USER", business_id: business.id, changes: { saleEventId: sale.id, targetPlatforms: [SocialPlatform.FACEBOOK_PAGE] } })]);
  });

  it.each(["socialPostTarget", "auditLog"] as const)("rolls the complete real graph back after %s insertion fails", async delegate => {
    controls.failAfter = delegate;
    await expect(commitSaleEventCreation(context, input({ createSocialDraft: true }), draft())).rejects.toThrow("Fixture post-write failure");
    expect(await prisma.saleEvent.count({ where: { business_id: business.id } })).toBe(0);
    expect(await prisma.socialPost.count({ where: { business_id: business.id } })).toBe(0);
    expect(await prisma.socialPostTarget.count({ where: { social_connection: { business_id: business.id } } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { business_id: business.id } })).toBe(0);
  });

  it("rolls metadata and relation replacement back on a later transaction failure", async () => {
    await commitSaleEventCreation(context, input(), null);
    const prior = await ownSale();
    controls.failAfter = "saleEvent";
    await expect(updateTenantSaleEvent(context, { ...input({ title: "Must roll back", serviceIds: [services[1]], packageIds: [packages[1]] }), id: prior.id })).rejects.toThrow("Fixture post-write failure");
    expect(await ownSale()).toEqual(prior);
  });

  it.each(["service", "package"])("denies foreign %s references without partial creation", async reference => {
    await expect(commitSaleEventCreation(context, input(reference === "service" ? { serviceIds: [services[2]] } : { packageIds: [packages[2]] }), null)).rejects.toThrow("invalid for this business");
    expect(await prisma.saleEvent.count({ where: { business_id: business.id } })).toBe(0);
  });

  it("rechecks owner role on create, replacement and deletion", async () => {
    await commitSaleEventCreation(context, input(), null);
    const prior = await ownSale();
    await prisma.user.update({ where: { id: user.id }, data: { role: Role.EMPLOYEE } });
    await expect(commitSaleEventCreation(context, input(), null)).rejects.toThrow("Forbidden");
    await expect(updateTenantSaleEvent(context, { ...input({ title: "Denied" }), id: prior.id })).rejects.toThrow("Forbidden");
    await expect(deleteTenantSaleEvent(context, prior.id)).rejects.toThrow("Forbidden");
    expect(await ownSale()).toEqual(prior);
  });

  it("denies a social channel disconnected after draft preparation", async () => {
    const prepared = draft();
    await prisma.socialConnection.update({ where: { id: connectionId }, data: { status: "REVOKED" } });
    await expect(commitSaleEventCreation(context, input({ createSocialDraft: true }), prepared)).rejects.toThrow("Connected social channels changed");
    expect(await prisma.saleEvent.count({ where: { business_id: business.id } })).toBe(0);
  });

  it("denies foreign sale replacement and deletion", async () => {
    const prior = await prisma.saleEvent.create({ data: { business_id: foreign.id, title: "Foreign fixture", start_date: start, end_date: end, discount_type: "PERCENTAGE", discount_value: 10 } });
    await expect(updateTenantSaleEvent(context, { ...input({ title: "Denied" }), id: prior.id })).rejects.toThrow("Sale event not found or unauthorized.");
    await expect(deleteTenantSaleEvent(context, prior.id)).rejects.toThrow("Sale event not found or unauthorized.");
    expect(await prisma.saleEvent.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
  });

  it("keeps public boundaries inclusive and counts only noncancelled tenant bookings", async () => {
    await commitSaleEventCreation(context, input(), null);
    const sale = await ownSale();
    await prisma.saleEvent.update({ where: { id: sale.id }, data: { applicable_services: { connect: { id: services[2] } }, applicable_packages: { connect: { id: packages[2] } } } });
    for (const [tenantId, status] of [[business.id, "ACCEPTED"], [business.id, "CANCELLED"], [foreign.id, "ACCEPTED"]] as const) {
      await prisma.booking.create({ data: { business_id: tenantId, sale_event_id: sale.id, is_anonymous_walk_in: true, grand_total: 100, total_discount: 0, status } });
    }
    for (const now of [start, end]) expect(await listPublicActiveSaleEvents(business.slug, now)).toEqual([expect.objectContaining({ id: sale.id, slots_remaining: 2, applicable_services: [{ id: services[0] }], applicable_packages: [{ id: packages[0] }] })]);
    for (const now of [new Date(start.getTime() - 1), new Date(end.getTime() + 1)]) expect(await listPublicActiveSaleEvents(business.slug, now)).toEqual([]);
  });
});
