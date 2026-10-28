import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistBusinessSettings, businessSettingsFailure, BusinessSettingsError } from "@/features/businesses/services/business-settings";
import { parseBusinessSettings } from "@/features/businesses/business-settings-schemas";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), update: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({}));
vi.mock("@/lib/auth/staff-access", () => ({}));
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
const context: OwnerActorContext = { success: true, actorType: "OWNER", role: "OWNER", businessId: "fixture-business", businessSlug: "fixture-slug", userId: "fixture-user", ownerId: 3, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
const images = { imageUrl: "https://fixture.invalid/image.png", gcashQrImageUrl: null };
function settings() { const form = new FormData(); form.set("name", "Fixture"); form.set("initials", "fx"); const result = parseBusinessSettings(form); if (!result.success) throw new Error("Fixture must validate"); return result.data; }
beforeEach(() => { vi.resetAllMocks(); mocks.update.mockResolvedValue({ id: context.businessId }); mocks.transaction.mockImplementation(async work => work({ business: { update: mocks.update }, businessGrowthSettings: { upsert: mocks.upsert } })); });
describe("atomic business profile persistence", () => {
  it("uses only the verified tenant and current owner predicate with narrow response selections", async () => {
    expect(await persistBusinessSettings(context, settings(), images)).toBeUndefined();
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(mocks.update.mock.calls[0][0].where).toEqual({ id: context.businessId, slug: context.businessSlug, owners: { some: { id: context.ownerId, business_id: context.businessId, user_id: context.userId, user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" } } } });
    expect(mocks.update.mock.calls[0][0].select).toEqual({ id: true });
    expect(mocks.upsert.mock.calls[0][0].select).toEqual({ business_id: true });
    expect(mocks.upsert.mock.calls[0][0].where).toEqual({ business_id: context.businessId });
  });
  it("writes only explicit supported business fields and preserves unrelated growth settings", async () => {
    const input = { ...settings(), business_id: "foreign", slug: "foreign", blocked_topics: ["injected"] };
    await persistBusinessSettings(context, input, images);
    expect(Object.keys(mocks.update.mock.calls[0][0].data).sort()).toEqual(["name", "initials", "description", "imageUrl", "latitude", "longitude", "structure", "allow_employee_self_booking", "manager_can_serve", "timezone", "formal_schedule_enabled", "gcash_account_name", "gcash_mobile_number", "gcash_qr_image_url", "gcash_instructions"].sort());
    expect(mocks.upsert.mock.calls[0][0].create).toEqual({ business_id: context.businessId, business_type: "SALON", max_discount_percent: 20, enable_student_promo: false, avoid_cheap_wording: false, weather_hooks_enabled: false, tone_profile: "taglish-natural" });
    expect(mocks.upsert.mock.calls[0][0].update).not.toHaveProperty("blocked_topics");
  });
  it("propagates second-write failure to the transaction executor", async () => {
    const rollback = new Error("synthetic second-write failure"); mocks.upsert.mockRejectedValue(rollback);
    await expect(persistBusinessSettings(context, settings(), images)).rejects.toBe(rollback);
    expect(mocks.transaction).toHaveBeenCalledTimes(1); expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("stops before growth on denied/failed business update", async () => { mocks.update.mockRejectedValue({ code: "P2025" }); await expect(persistBusinessSettings(context, settings(), images)).rejects.toEqual({ code: "P2025" }); expect(mocks.upsert).not.toHaveBeenCalled(); });
  it.each([{ actorType: "EMPLOYEE", role: "EMPLOYEE" }, { actorType: "OWNER", role: "PLATFORM_ADMIN" }])("denies invalid current actor before opening transaction %j", identity => { return expect(persistBusinessSettings({ ...context, ...identity } as OwnerActorContext, settings(), images)).rejects.toThrow("Forbidden").then(() => { expect(mocks.transaction).not.toHaveBeenCalled(); }); });
  it.each([null, undefined, new Error("private"), { code: "UNKNOWN", message: "private" }, { code: "P2002", message: "private" }])("maps unknown errors to safe fallback %j", error => { expect(businessSettingsFailure(error)).toBe("Failed to update business settings."); });
  it.each([[{ code: "P2025" }, "Forbidden"], [{ code: "P2034" }, "Business settings changed. Refresh and try again."], [new BusinessSettingsError("Forbidden"), "Forbidden"]])("preserves known safe error %j", (error, expected) => { expect(businessSettingsFailure(error)).toBe(expected); });
});
