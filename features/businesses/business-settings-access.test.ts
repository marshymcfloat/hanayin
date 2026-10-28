import { beforeEach, describe, expect, it, vi } from "vitest";
import { businessSettingsWhere, requireBusinessSettingsAccess } from "@/features/businesses/business-settings-access";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireOwnerTenantWriteAccess: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.auth }));
vi.mock("@/prisma/prisma", () => ({ prisma: {} }));
const actor: OwnerActorContext = { success: true, actorType: "OWNER", role: "OWNER", businessId: "fixture-business", businessSlug: "fixture-slug", ownerId: 5, userId: "fixture-owner", employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
beforeEach(() => { vi.resetAllMocks(); });
describe("business settings owner predicate", () => {
  it("requires exact owner, user, tenant and SETTINGS_MANAGE", () => { expect(businessSettingsWhere(actor)).toEqual({ id: "fixture-business", slug: "fixture-slug", owners: { some: { id: 5, user_id: "fixture-owner", business_id: "fixture-business", user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" } } } }); });
  it.each([{ actorType: "EMPLOYEE", role: "EMPLOYEE" }, { actorType: "OWNER", role: "EMPLOYEE" }, { actorType: "OTHER", role: "OWNER" }])("rejects unsupported actor %j", values => { expect(() => businessSettingsWhere({ ...actor, ...values } as OwnerActorContext)).toThrow("Forbidden"); });
  it("retains denied tenant/subscription guard without accessing Prisma", async () => { mocks.auth.mockResolvedValue({ success: false, error: "Forbidden" }); expect(await requireBusinessSettingsAccess("foreign-slug")).toEqual({ success: false, error: "Forbidden" }); expect(mocks.auth).toHaveBeenCalledWith("foreign-slug"); });
});
