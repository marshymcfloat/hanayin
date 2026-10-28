import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), business: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireTenantAccess: mocks.read, requireOwnerTenantWriteAccess: mocks.write }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.business }, user: { findUnique: mocks.user } } }));
vi.mock("@/lib/auth/staff-access", async () => vi.importActual("@/lib/auth/staff-access"));
import { requireSaleEventAccess, SaleEventError, saleEventClientError } from "./sale-event-access";
const auth = { success: true, businessSlug: "tenant-a", session: { user: { id: "user_a" } } };
const owner = { id: "user_a", role: "OWNER", owner: { id: 7, business_id: "biz_a" }, employee: null };
describe("sale event current membership boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.read.mockResolvedValue(auth); mocks.write.mockResolvedValue(auth);
    mocks.business.mockResolvedValue({ id: "biz_a", slug: "tenant-a", structure: "SINGLE", allow_employee_self_booking: false, manager_can_serve: false }); mocks.user.mockResolvedValue(owner);
  });
  it("resolves current owner membership after the original subscription write gate", async () => {
    expect(await requireSaleEventAccess("tenant-a", true)).toMatchObject({ success: true, context: { actorType: "OWNER", ownerId: 7, businessId: "biz_a", userId: "user_a" } });
    expect(mocks.write).toHaveBeenCalledWith("tenant-a"); expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.user).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user_a" } }));
  });
  it.each(["STAFF", "MANAGER", "CASHIER"])("allows current %s internal read without write subscription or extra management permission", async profile => {
    mocks.user.mockResolvedValue({ ...owner, role: "EMPLOYEE", owner: null, employee: { id: 11, business_id: "biz_a", profile, permissions: ["BOOKING_CREATE"] } });
    expect(await requireSaleEventAccess("tenant-a")).toMatchObject({ success: true, context: { actorType: "EMPLOYEE", employeeId: 11, profile } });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(await requireSaleEventAccess("tenant-a", true)).toEqual({ success: false, error: "Forbidden" });
  });
  it.each([
    { ...owner, role: "PLATFORM_ADMIN" }, { ...owner, owner: null }, { ...owner, owner: { id: 7, business_id: "biz_other" } },
    { ...owner, role: "EMPLOYEE", employee: null }, { ...owner, role: "EMPLOYEE", employee: { id: 11, business_id: "biz_other", profile: "MANAGER", permissions: ["CATALOG_MANAGE"] } },
  ])("rejects platform, stale or foreign membership %#", async user => {
    mocks.user.mockResolvedValue(user);
    expect(await requireSaleEventAccess("tenant-a", true)).toEqual({ success: false, error: "Forbidden" });
  });
  it.each(["user", "business"] as const)("rejects disappeared %s after cached session", async model => {
    mocks[model].mockResolvedValue(null);
    expect(await requireSaleEventAccess("tenant-a")).toEqual({ success: false, error: "Unauthorized" });
  });
  it("returns original gate denial before any current database work", async () => {
    mocks.write.mockResolvedValue({ success: false, error: "Subscription blocked" });
    expect(await requireSaleEventAccess("tenant-a", true)).toEqual({ success: false, error: "Subscription blocked" });
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.business).not.toHaveBeenCalled();
  });
  it("rejects missing session user ID before current database work", async () => {
    mocks.read.mockResolvedValue({ ...auth, session: { user: {} } });
    expect(await requireSaleEventAccess("tenant-a")).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("exposes only named safe domain failures and serialization refresh, never arbitrary errors", () => {
    expect(saleEventClientError(new SaleEventError("Forbidden"), "Fallback")).toBe("Forbidden");
    expect(saleEventClientError({ code: "P2034", message: "private SQL" }, "Fallback")).toBe("Sale event changed. Refresh and try again.");
    for (const error of [null, undefined, "private", new Error("private"), { code: "P2025" }, {}]) expect(saleEventClientError(error, "Fallback")).toBe("Fallback");
  });
});
