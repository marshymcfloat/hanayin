import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), business: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.business }, user: { findUnique: mocks.user } } }));
import { requireBrandAssetReadAccess, brandAssetBusinessWhere } from "./brand-asset-access";
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "user-a", role: "OWNER" } } });
  mocks.business.mockResolvedValue({ id: "biz-a", slug: "tenant-a", structure: "OWNER_EMPLOYEE_SELF_SERVICE", allow_employee_self_booking: true, manager_can_serve: true });
  mocks.user.mockResolvedValue({ id: "user-a", role: "OWNER", owner: { id: 3, business_id: "biz-a" }, employee: null });
});
it("uses actual current owner membership resolver, not session role", async () => {
  const access = await requireBrandAssetReadAccess(); expect(access.success).toBe(true);
  if (!access.success) throw new Error("expected access");
  expect(brandAssetBusinessWhere(access.context)).toEqual({ id: "biz-a", slug: "tenant-a", owners: { some: { id: 3, user_id: "user-a", business_id: "biz-a", user: { role: "OWNER" } } } });
});
it.each(["STAFF", "MANAGER", "CASHIER"])("allows current employee %s reads without settings/write gate", async profile => {
  mocks.user.mockResolvedValue({ id: "user-a", role: "EMPLOYEE", owner: null, employee: { id: 7, business_id: "biz-a", profile, permissions: [] } });
  const access = await requireBrandAssetReadAccess(); expect(access.success).toBe(true);
  if (!access.success) throw new Error("expected access");
  expect(brandAssetBusinessWhere(access.context)).toEqual({ id: "biz-a", slug: "tenant-a", employees: { some: { id: 7, user_id: "user-a", business_id: "biz-a", user: { role: "EMPLOYEE" } } } });
  expect(mocks.auth).toHaveBeenCalledWith();
});
it.each([
  { role: "PLATFORM_ADMIN", owner: { id: 3, business_id: "biz-a" } },
  { role: "OWNER", owner: null },
  { role: "OWNER", owner: { id: 3, business_id: "foreign" } },
  { role: "EMPLOYEE", employee: { id: 7, business_id: "foreign" } },
])("denies current unsupported/missing/foreign membership %#", async user => {
  mocks.user.mockResolvedValue(user); expect(await requireBrandAssetReadAccess()).toEqual({ success: false, error: "Forbidden" });
});
it("denies missing identity/auth and missing current database user", async () => {
  mocks.auth.mockResolvedValueOnce({ success: false, error: "Unauthorized" }); expect(await requireBrandAssetReadAccess()).toEqual({ success: false, error: "Unauthorized" });
  mocks.auth.mockResolvedValueOnce({ success: true, businessSlug: "tenant-a", session: { user: {} } }); expect(await requireBrandAssetReadAccess()).toEqual({ success: false, error: "Unauthorized" });
  mocks.user.mockResolvedValueOnce(null); expect(await requireBrandAssetReadAccess()).toEqual({ success: false, error: "Unauthorized" });
});
it("rejects forged unsupported actors before producing query filters", () => {
  expect(() => brandAssetBusinessWhere({ actorType: "PLATFORM_ADMIN", role: "PLATFORM_ADMIN" } as never)).toThrow("Forbidden");
  expect(() => brandAssetBusinessWhere({ actorType: "OWNER", role: "EMPLOYEE" } as never)).toThrow("Forbidden");
});
