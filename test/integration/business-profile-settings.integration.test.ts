import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { parseBusinessSettings } from "@/features/businesses/business-settings-schemas";
import { persistBusinessSettings } from "@/features/businesses/services/business-settings";
import { updateTenantBusinessSettings } from "@/features/businesses/services/business-settings-lifecycle";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { OwnerPermission, Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failGrowth: false, wroteGrowth: false, onUpload: null as null | (() => Promise<void>), put: vi.fn(), del: vi.fn() }));
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
            if (member !== "businessGrowthSettings") return delegate;
            return new Proxy(delegate, {
              get(model, operation) {
                const value = Reflect.get(model, operation);
                if (typeof value !== "function") return value;
                return async (...args: unknown[]) => {
                  const result = await value.apply(model, args);
                  if (operation === "upsert" && controls.failGrowth) {
                    controls.wroteGrowth = true;
                    throw new Error("Fixture post-growth-write failure");
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

const factory = createSharedWorkflowFactory({ namespace: `integration-business-profile-${randomUUID()}` });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const user = factory.user({ contactNumber: `test-business-profile-${randomUUID()}` });
const tenantIds = [business.id, foreign.id];
const images = { imageUrl: "https://example.test/prior-image.png", gcashQrImageUrl: "https://example.test/prior-qr.png" };
const uploaded = { url: "https://example.test/new-image.png", pathname: "fixture/new-image.png" };
let context: OwnerActorContext;

function settings(withImage = false) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "Updated Fixture Salon", initials: "uf", description: "Updated description", latitude: "14.6", longitude: "120.98", timezone: "Asia/Manila", gcashAccountName: "Fixture Account", gcashMobileNumber: "09170000001", gcashInstructions: "Fixture instructions", existingImageUrl: images.imageUrl, existingGcashQrImageUrl: images.gcashQrImageUrl, growthBusinessType: "SPA", growthMaxDiscountPercent: "30", growthEnableStudentPromo: "on", growthAvoidCheapWording: "on", growthWeatherHooksEnabled: "on", growthToneProfile: "taglish-natural", formalScheduleEnabled: "true" })) form.set(key, value);
  if (withImage) form.set("imageFile", new File(["fixture image"], "fixture.png", { type: "image/png" }));
  const parsed = parseBusinessSettings(form);
  if (!parsed.success) throw new Error("Fixture settings must validate");
  return parsed.data;
}

describe("atomic business profile and growth settings in PostgreSQL", () => {
  beforeAll(async () => {
    for (const fixture of [business, foreign]) await prisma.business.create({ data: { id: fixture.id, slug: fixture.slug, name: fixture.name, initials: fixture.initials } });
    await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: Role.OWNER } });
    const membership = await prisma.owner.create({ data: { user_id: user.id, business_id: business.id, permissions: [OwnerPermission.SETTINGS_MANAGE] } });
    context = { success: true, actorType: "OWNER", role: Role.OWNER, ownerId: membership.id, userId: user.id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
  });
  beforeEach(async () => {
    controls.failGrowth = false; controls.wroteGrowth = false; controls.onUpload = null;
    controls.put.mockReset(); controls.del.mockReset();
    controls.put.mockImplementation(async () => { await controls.onUpload?.(); return uploaded; });
    controls.del.mockResolvedValue(undefined);
    await prisma.businessGrowthSettings.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.user.update({ where: { id: user.id }, data: { role: Role.OWNER } });
    await prisma.owner.update({ where: { id: context.ownerId }, data: { business_id: business.id, permissions: [OwnerPermission.SETTINGS_MANAGE] } });
    for (const fixture of [business, foreign]) await prisma.business.update({ where: { id: fixture.id }, data: { name: fixture.name, initials: fixture.initials, description: fixture.description, imageUrl: images.imageUrl, gcash_qr_image_url: images.gcashQrImageUrl } });
  });
  afterAll(async () => {
    controls.failGrowth = false; controls.onUpload = null;
    let failures = 0;
    try {
      for (const cleanup of [
        () => prisma.businessGrowthSettings.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.business.deleteMany({ where: { id: { in: tenantIds } } }),
        () => prisma.user.deleteMany({ where: { id: user.id } }),
      ]) { try { await cleanup(); } catch { failures++; } }
    } finally { await prisma.$disconnect(); }
    if (failures) throw new Error(`Fixture cleanup failed in ${failures} steps`);
  });

  it("commits normalized business fields and newly created growth settings together", async () => {
    await persistBusinessSettings(context, settings(), images);
    expect(await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).toMatchObject({ name: "Updated Fixture Salon", initials: "UF", description: "Updated description", latitude: 14.6, longitude: 120.98, timezone: "Asia/Manila", formal_schedule_enabled: true, gcash_account_name: "Fixture Account", gcash_mobile_number: "09170000001", gcash_instructions: "Fixture instructions", imageUrl: images.imageUrl, gcash_qr_image_url: images.gcashQrImageUrl });
    expect(await prisma.businessGrowthSettings.findUniqueOrThrow({ where: { business_id: business.id } })).toMatchObject({ business_type: "SPA", max_discount_percent: 30, enable_student_promo: true, avoid_cheap_wording: true, weather_hooks_enabled: true, tone_profile: "taglish-natural" });
    expect(controls.put).not.toHaveBeenCalled();
  });
  it("updates existing growth fields while retaining unrelated fields and foreign settings", async () => {
    const prior = await prisma.businessGrowthSettings.create({ data: { business_id: business.id, blocked_topics: ["fixture-retained"], profit_floor_percent: 12 } });
    const other = await prisma.businessGrowthSettings.create({ data: { business_id: foreign.id, max_discount_percent: 7 } });
    await persistBusinessSettings(context, settings(), images);
    expect(await prisma.businessGrowthSettings.findUniqueOrThrow({ where: { business_id: business.id } })).toMatchObject({ id: prior.id, blocked_topics: ["fixture-retained"], profit_floor_percent: 12, max_discount_percent: 30 });
    expect(await prisma.businessGrowthSettings.findUniqueOrThrow({ where: { business_id: foreign.id } })).toEqual(other);
  });
  it.each([false, true])("rolls back both real writes after growth upsert failure (existing=%s)", async existing => {
    const priorBusiness = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    const priorGrowth = existing ? await prisma.businessGrowthSettings.create({ data: { business_id: business.id, max_discount_percent: 9 } }) : null;
    controls.failGrowth = true;
    await expect(persistBusinessSettings(context, settings(), images)).rejects.toThrow();
    expect(controls.wroteGrowth).toBe(true);
    expect(await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).toEqual(priorBusiness);
    expect(await prisma.businessGrowthSettings.findUnique({ where: { business_id: business.id } })).toEqual(priorGrowth);
  });
  it.each(["role", "settings", "membership"])("denies current %s revoked after actor resolution", async revoked => {
    const prior = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    if (revoked === "role") await prisma.user.update({ where: { id: user.id }, data: { role: Role.EMPLOYEE } });
    if (revoked === "settings") await prisma.owner.update({ where: { id: context.ownerId }, data: { permissions: [] } });
    if (revoked === "membership") await prisma.owner.update({ where: { id: context.ownerId }, data: { business_id: foreign.id } });
    await expect(persistBusinessSettings(context, settings(), images)).rejects.toThrow();
    expect(await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).toEqual(prior);
    expect(await prisma.businessGrowthSettings.count({ where: { business_id: business.id } })).toBe(0);
  });
  it("denies a valid owner identity paired with a foreign tenant", async () => {
    const prior = await prisma.business.findUniqueOrThrow({ where: { id: foreign.id } });
    await expect(persistBusinessSettings({ ...context, businessId: foreign.id, businessSlug: foreign.slug }, settings(), images)).rejects.toThrow();
    expect(await prisma.business.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(prior);
    expect(await prisma.businessGrowthSettings.count({ where: { business_id: foreign.id } })).toBe(0);
  });
  it("compensates only newly uploaded storage if permission is removed during mocked upload", async () => {
    const prior = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    controls.onUpload = async () => { await prisma.owner.update({ where: { id: context.ownerId }, data: { permissions: [] } }); };
    await expect(updateTenantBusinessSettings(context, settings(true))).rejects.toThrow();
    expect(controls.put).toHaveBeenCalledTimes(1);
    expect(controls.del).toHaveBeenCalledTimes(1);
    expect(controls.del).toHaveBeenCalledWith(uploaded.url);
    expect(await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).toEqual(prior);
    expect(await prisma.businessGrowthSettings.count({ where: { business_id: business.id } })).toBe(0);
  });
  it("compensates a new upload after real persistence rollback, not previous images", async () => {
    const prior = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    controls.failGrowth = true;
    await expect(updateTenantBusinessSettings(context, settings(true))).rejects.toThrow();
    expect(controls.wroteGrowth).toBe(true);
    expect(controls.del).toHaveBeenCalledTimes(1);
    expect(controls.del).toHaveBeenCalledWith(uploaded.url);
    expect(await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).toEqual(prior);
    expect(await prisma.businessGrowthSettings.count({ where: { business_id: business.id } })).toBe(0);
  });
});
