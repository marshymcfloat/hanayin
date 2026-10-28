import { beforeEach, expect, it, vi } from "vitest";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import { replaceOwnerSpecialties } from "@/features/workforce/services/owner-specialties";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), update: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/services/audit", () => ({ logAudit: mocks.audit }));
const context = { actorType: "OWNER", ownerId: 1, userId: "verified-user", businessId: "verified-business", businessSlug: "tenant" } as OwnerActorContext;
const tx = { owner: { findFirst: mocks.owner, updateMany: mocks.update } };
beforeEach(() => {
  vi.resetAllMocks(); mocks.transaction.mockImplementation(async (callback: (value: unknown) => Promise<unknown>) => callback(tx));
  mocks.owner.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2, specialties: ["GENERAL"] }); mocks.update.mockResolvedValue({ count: 1 });
});

it("denies directly invoked non-owner contexts", async () => {
  expect((await replaceOwnerSpecialties({ actorType: "EMPLOYEE" } as unknown as OwnerActorContext, 2, [])).result).toEqual({ success: false, error: "Forbidden" }); expect(mocks.transaction).not.toHaveBeenCalled();
});
it("repeats exact actor and same-tenant current-owner predicates at persistence", async () => {
  expect(await replaceOwnerSpecialties(context, 2, ["SPA"])).toEqual({ result: { success: true }, changed: true });
  const membership = { id: 1, user_id: context.userId, business_id: context.businessId, user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" } };
  expect(mocks.owner.mock.calls).toEqual([[{ where: membership, select: { id: true } }], [{ where: { id: 2, business_id: context.businessId, user: { role: "OWNER" } }, select: { id: true, specialties: true } }]]);
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: 2, business_id: context.businessId, user: { role: "OWNER" }, specialties: { equals: ["GENERAL"] }, business: { owners: { some: membership } } }, data: { specialties: ["SPA"] } });
  expect(mocks.audit).toHaveBeenCalledWith(tx, expect.objectContaining({ actorId: context.userId, businessId: context.businessId, entityId: "2", changes: { before: { specialties: ["GENERAL"] }, after: { specialties: ["SPA"], mode: "OWNER_SPECIALTIES_UPDATED" } } }));
  expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]);
  expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
});
it("denies revoked actor role/membership/capability before target reads", async () => {
  mocks.owner.mockReset().mockResolvedValue(null);
  expect((await replaceOwnerSpecialties(context, 2, [])).result).toEqual({ success: false, error: "Forbidden" }); expect(mocks.owner).toHaveBeenCalledTimes(1); expect(mocks.update).not.toHaveBeenCalled();
});
it("denies foreign/missing/stale-role targets without writes", async () => {
  mocks.owner.mockReset().mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
  expect((await replaceOwnerSpecialties(context, 2, [])).result).toEqual({ success: false, error: "Owner not found" }); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
});
it("leaves a no-op unaudited and unchanged", async () => {
  expect(await replaceOwnerSpecialties(context, 2, ["GENERAL"])).toEqual({ result: { success: true }, changed: false }); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
});
it.each([{ specialties: [] }, { specialties: ["GENERAL", "SPA"] }])("supports empty and longer replacements $specialties", async ({ specialties }) => {
  expect((await replaceOwnerSpecialties(context, 2, specialties)).changed).toBe(true); expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { specialties } }));
});
it("maps an incomplete conditional snapshot update to safe conflict", async () => {
  mocks.update.mockResolvedValue({ count: 0 });
  expect((await replaceOwnerSpecialties(context, 2, ["SPA"])).result).toEqual({ success: false, error: "Owner settings changed. Refresh and try again." }); expect(mocks.audit).not.toHaveBeenCalled();
});
it("propagates post-write audit rejection through the transaction before safe mapping", async () => {
  const error = new Error("private audit failure"); mocks.audit.mockRejectedValue(error);
  let rejection: unknown;
  mocks.transaction.mockImplementation(async (callback: (value: unknown) => Promise<unknown>) => { try { return await callback(tx); } catch (caught) { rejection = caught; throw caught; } });
  expect((await replaceOwnerSpecialties(context, 2, ["SPA"])).result).toEqual({ success: false, error: "Failed to update owner specialties" }); expect(rejection).toBe(error); expect(mocks.update).toHaveBeenCalled();
});
it.each([{ code: "P2034" }, { code: "P2002" }, null, "private"])("maps transaction failure %s", async error => {
  mocks.transaction.mockRejectedValue(error);
  expect((await replaceOwnerSpecialties(context, 2, [])).result).toEqual({ success: false, error: typeof error === "object" && error?.code === "P2034" ? "Owner settings changed. Refresh and try again." : "Failed to update owner specialties" });
});
