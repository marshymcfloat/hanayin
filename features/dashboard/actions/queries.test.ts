import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPendingServicesAction, getOwnerClaimedServicesAction, updateOwnerSpecialties } from "@/features/dashboard/actions/queries";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), access: vi.fn(), business: vi.fn(), owner: vi.fn(), employee: vi.fn(), services: vi.fn(), update: vi.fn(), updateMany: vi.fn(), transaction: vi.fn(), audit: vi.fn(), scan: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth, requireTenantAccess: vi.fn() }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/lib/auth/owner-access", () => ({ requireAuthenticatedOwnerPermission: mocks.access, ownerPermissionMembershipWhere: (context: { ownerId: number; businessId: string; userId: string }, permission: string) => ({ id: context.ownerId, business_id: context.businessId, user_id: context.userId, user: { role: "OWNER" }, permissions: { has: permission } }) }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.business }, owner: { findFirst: mocks.owner, update: mocks.update, updateMany: mocks.updateMany }, employee: { findFirst: mocks.employee }, availedService: { findMany: mocks.services }, $transaction: mocks.transaction } }));
vi.mock("@/lib/services/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: mocks.scan }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));

const owner = { success: true, actorType: "OWNER", businessId: "verified-business", businessSlug: "tenant", userId: "actor", ownerId: 1 };
const row = { id: 12, service: { category: "SPA" }, booking: { customer: { name: "Customer" } } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "actor", role: "OWNER" } } });
  mocks.actor.mockResolvedValue(owner); mocks.access.mockResolvedValue({ success: true, context: owner });
  mocks.business.mockResolvedValue({ id: owner.businessId }); mocks.owner.mockResolvedValue({ id: 2, specialties: ["GENERAL"] }); mocks.employee.mockResolvedValue({ specialties: ["SPA"] }); mocks.services.mockResolvedValue([row]);
  mocks.update.mockResolvedValue({}); mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ owner: { findFirst: mocks.owner, updateMany: mocks.updateMany } }));
});

describe("dashboard queue and specialty contracts", () => {
  it("preserves owner pending queue DTOs", async () => { expect(await getPendingServicesAction()).toEqual([row]); });
  it("preserves employee category filtering", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "actor", role: "EMPLOYEE" } } });
    mocks.actor.mockResolvedValue({ ...owner, actorType: "EMPLOYEE", employeeId: 3 });
    mocks.services.mockResolvedValue([row, { ...row, id: 13, service: { category: "NAILS" } }]);
    expect(await getPendingServicesAction()).toEqual([row]);
  });
  it("preserves owner claimed-service result shape", async () => { expect(await getOwnerClaimedServicesAction()).toEqual({ success: true, data: [row] }); });
  it("preserves valid specialty values, success and post-commit cache/scan", async () => {
    expect(await updateOwnerSpecialties(2, ["SPA", " NAILS "])).toEqual({ success: true });
    expect(mocks.scan).toHaveBeenCalledWith({ businessSlug: "tenant", trigger: "OWNER_SPECIALTIES_UPDATED" });
    expect(mocks.cache).toHaveBeenCalledWith("/app/tenant/owners");
  });

  it("denies unauthenticated queue reads before actor/query work", async () => {
    mocks.auth.mockResolvedValue({ success: false, error: "Unauthorized" });
    expect(await getPendingServicesAction()).toEqual([]);
    expect(await getOwnerClaimedServicesAction()).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.actor).not.toHaveBeenCalled(); expect(mocks.services).not.toHaveBeenCalled();
  });
  it("denies missing current actor membership", async () => {
    mocks.actor.mockResolvedValue({ success: false, error: "Forbidden" });
    expect(await getPendingServicesAction()).toEqual([]);
    expect(await getOwnerClaimedServicesAction()).toEqual({ success: false, error: "Owner not found" });
    expect(mocks.services).not.toHaveBeenCalled();
  });
  it("denies employee owner-claimed reads before context resolution", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "actor", role: "EMPLOYEE" } } });
    expect(await getOwnerClaimedServicesAction()).toEqual({ success: false, error: "Unauthorized" }); expect(mocks.actor).not.toHaveBeenCalled();
  });
  it("denies stale owner sessions resolving to employees", async () => {
    mocks.actor.mockResolvedValue({ ...owner, actorType: "EMPLOYEE" });
    expect(await getOwnerClaimedServicesAction()).toEqual({ success: false, error: "Owner not found" }); expect(mocks.services).not.toHaveBeenCalled();
  });
  it.each(["auth", "query"])("maps private %s failures to safe queue outcomes", async stage => {
    if (stage === "auth") mocks.auth.mockRejectedValue(new Error("private")); else mocks.services.mockRejectedValue(new Error("private"));
    expect(await getPendingServicesAction()).toEqual([]);
    expect(await getOwnerClaimedServicesAction()).toEqual({ success: false, error: "Unable to fetch claimed services." });
  });
  it.each(["Unauthorized", "Forbidden"])("denies specialty %s before transaction/provider/cache", async error => {
    mocks.access.mockResolvedValue({ success: false, error });
    expect(await updateOwnerSpecialties(2, [])).toEqual({ success: false, error });
    expect(mocks.access).toHaveBeenCalledWith("SETTINGS_MANAGE");
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.scan).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("validates specialty input before authorization", async () => {
    expect(await updateOwnerSpecialties(0, ["SPA"])).toEqual({ success: false, error: "Invalid input" }); expect(mocks.access).not.toHaveBeenCalled();
  });
  it("returns safe authorization infrastructure failures", async () => {
    mocks.access.mockRejectedValue(new Error("private")); expect(await updateOwnerSpecialties(2, [])).toEqual({ success: false, error: "Failed to update owner specialties" });
  });
  it("does not invalidate or scan after a specialty denial", async () => {
    mocks.owner.mockResolvedValue(null);
    expect(await updateOwnerSpecialties(2, [])).toEqual({ success: false, error: "Forbidden" }); expect(mocks.scan).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("does not invalidate or scan a specialty no-op", async () => {
    expect(await updateOwnerSpecialties(2, ["GENERAL"])).toEqual({ success: true }); expect(mocks.scan).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(["scan", "cache"])("preserves committed success after %s failure", async stage => {
    if (stage === "scan") mocks.scan.mockRejectedValue(new Error("private")); else mocks.cache.mockImplementation(() => { throw new Error("private"); });
    expect(await updateOwnerSpecialties(2, ["SPA"])).toEqual({ success: true });
    expect(mocks.audit).toHaveBeenCalled(); expect(mocks.cache).toHaveBeenCalled();
    expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.scan.mock.invocationCallOrder[0]);
  });
});
