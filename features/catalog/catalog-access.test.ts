import { describe, expect, it, vi } from "vitest";
import { hasCurrentCatalogWriteAccess, type CatalogActorContext } from "./catalog-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { Role, StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";

vi.mock("@/prisma/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/guards", () => ({}));
const shared = { success: true as const, businessId: "catalog-business", businessSlug: "catalog-slug", userId: "catalog-user", businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE" as const, allowEmployeeSelfBooking: false, managerCanServe: false } };
const owner: CatalogActorContext = { ...shared, actorType: "OWNER", role: Role.OWNER, ownerId: 7, employeeId: null, profile: null, permissions: [] };
const staff: CatalogActorContext = { ...shared, actorType: "EMPLOYEE", role: Role.EMPLOYEE, ownerId: null, employeeId: 9, profile: StaffProfile.STAFF, permissions: [StaffPermission.CATALOG_MANAGE] };
function fixture() {
  const ownerRead = vi.fn().mockResolvedValue({ id: 7 });
  const employeeRead = vi.fn();
  const tx = { owner: { findFirst: ownerRead }, employee: { findFirst: employeeRead } } as unknown as Prisma.TransactionClient;
  return { tx, ownerRead, employeeRead };
}

describe("current catalog transaction access", () => {
  it("retains owner catalog access but verifies exact current tenant membership and role", async () => {
    const { tx, ownerRead, employeeRead } = fixture();
    expect(await hasCurrentCatalogWriteAccess(tx, owner)).toBe(true);
    expect(ownerRead).toHaveBeenCalledWith({ where: { id: 7, user_id: "catalog-user", business_id: "catalog-business", user: { role: Role.OWNER } }, select: { id: true } });
    expect(employeeRead).not.toHaveBeenCalled();
  });

  it("denies removed, foreign, or stale-role owner membership", async () => {
    const { tx, ownerRead } = fixture();
    ownerRead.mockResolvedValue(null);
    expect(await hasCurrentCatalogWriteAccess(tx, owner)).toBe(false);
  });

  it("rechecks employee id, tenant, user and current role", async () => {
    const { tx, employeeRead } = fixture();
    employeeRead.mockResolvedValue({ profile: StaffProfile.STAFF, permissions: [StaffPermission.CATALOG_MANAGE] });
    expect(await hasCurrentCatalogWriteAccess(tx, staff)).toBe(true);
    expect(employeeRead).toHaveBeenCalledWith({ where: { id: 9, user_id: "catalog-user", business_id: "catalog-business", user: { role: Role.EMPLOYEE } }, select: { profile: true, permissions: true } });
  });

  it("denies missing current employee membership", async () => {
    const { tx, employeeRead } = fixture();
    employeeRead.mockResolvedValue(null);
    expect(await hasCurrentCatalogWriteAccess(tx, staff)).toBe(false);
  });

  it.each(Object.values(StaffProfile))("retains existing default and explicit catalog grants for %s", async profile => {
    const { tx, employeeRead } = fixture();
    employeeRead.mockResolvedValue({ profile, permissions: [] });
    expect(await hasCurrentCatalogWriteAccess(tx, staff)).toBe(profile === StaffProfile.MANAGER);
    employeeRead.mockResolvedValue({ profile, permissions: [StaffPermission.CATALOG_MANAGE] });
    expect(await hasCurrentCatalogWriteAccess(tx, staff)).toBe(true);
    employeeRead.mockResolvedValue({ profile, permissions: [StaffPermission.BOOKING_CREATE] });
    expect(await hasCurrentCatalogWriteAccess(tx, staff)).toBe(false);
  });

  it("ignores old resolved grants in favor of current profile and permissions", async () => {
    const { tx, employeeRead } = fixture();
    employeeRead.mockResolvedValue({ profile: StaffProfile.CASHIER, permissions: [] });
    expect(await hasCurrentCatalogWriteAccess(tx, { ...staff, profile: StaffProfile.MANAGER })).toBe(false);
  });

  it("denies unsupported runtime actors without queries", async () => {
    const { tx, ownerRead, employeeRead } = fixture();
    expect(await hasCurrentCatalogWriteAccess(tx, { ...owner, actorType: "PLATFORM_ADMIN" } as unknown as CatalogActorContext)).toBe(false);
    expect(ownerRead).not.toHaveBeenCalled();
    expect(employeeRead).not.toHaveBeenCalled();
  });

  it.each(["owner", "employee"])("propagates %s persistence failure to the transaction caller", async actor => {
    const { tx, ownerRead, employeeRead } = fixture();
    (actor === "owner" ? ownerRead : employeeRead).mockRejectedValue(new Error("Fixture failure"));
    await expect(hasCurrentCatalogWriteAccess(tx, actor === "owner" ? owner : staff)).rejects.toThrow("Fixture failure");
  });
});
