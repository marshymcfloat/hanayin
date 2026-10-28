import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => vi.fn()); const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guards", () => ({ requireAuth: auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: resolve }));
import { requireVoucherAccess, voucherBusinessWhere, type VoucherActorContext } from "./voucher-access";
const context = { success: true, actorType: "OWNER", role: "OWNER", businessId: "biz", businessSlug: "demo", userId: "user", ownerId: 7 } as VoucherActorContext;
describe("voucher current membership", () => {
  beforeEach(() => { vi.resetAllMocks(); auth.mockResolvedValue({ success: true, businessSlug: "demo", session: { user: { id: "user" } } }); resolve.mockResolvedValue(context); });
  it("resolves current owner instead of trusting session role", async () => { expect(await requireVoucherAccess()).toEqual({ success: true, context }); expect(resolve).toHaveBeenCalledWith("demo", "user"); });
  it("keeps existing current employee write policy without catalog permission expansion", async () => { const employee = { ...context, actorType: "EMPLOYEE", role: "EMPLOYEE", employeeId: 3, ownerId: null, permissions: [] }; resolve.mockResolvedValue(employee); expect(await requireVoucherAccess(true)).toEqual({ success: true, context: employee }); expect(auth).toHaveBeenCalledWith({ write: true }); });
  it("passes subscription write denial", async () => { auth.mockResolvedValue({ success: false, error: "Read only" }); expect(await requireVoucherAccess(true)).toEqual({ success: false, error: "Read only" }); expect(resolve).not.toHaveBeenCalled(); });
  it("preserves generic read unauthorized", async () => { auth.mockResolvedValue({ success: false, error: "Private auth error" }); expect(await requireVoucherAccess()).toEqual({ success: false, error: "Unauthorized" }); });
  it("denies requested foreign slug before resolving", async () => { expect(await requireVoucherAccess(false, "other")).toEqual({ success: false, error: "Unauthorized" }); expect(resolve).not.toHaveBeenCalled(); });
  it("denies missing session identity", async () => { auth.mockResolvedValue({ success: true, businessSlug: "demo", session: { user: {} } }); expect(await requireVoucherAccess(true)).toEqual({ success: false, error: "Unauthorized" }); expect(resolve).not.toHaveBeenCalled(); });
  it("passes revoked membership denial", async () => { resolve.mockResolvedValue({ success: false, error: "Forbidden" }); expect(await requireVoucherAccess(true)).toEqual({ success: false, error: "Forbidden" }); });
  it("owner predicate checks exact identity, role and tenant", () => expect(voucherBusinessWhere(context)).toEqual({ id: "biz", slug: "demo", owners: { some: { id: 7, user_id: "user", business_id: "biz", user: { role: "OWNER" } } } }));
  it("employee predicate checks exact identity, role and tenant", () => expect(voucherBusinessWhere({ ...context, actorType: "EMPLOYEE", role: "EMPLOYEE", employeeId: 3, ownerId: null } as VoucherActorContext)).toEqual({ id: "biz", slug: "demo", employees: { some: { id: 3, user_id: "user", business_id: "biz", user: { role: "EMPLOYEE" } } } }));
  it("fails closed for actor/role mismatch", () => expect(voucherBusinessWhere({ ...context, role: "PLATFORM_ADMIN" } as VoucherActorContext)).toEqual({ id: { in: [] } }));
});
