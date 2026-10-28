import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";

const requireAuthMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

import {
  getDefaultPermissionsForProfile,
  hasStaffPermission,
  requireStaffPermission,
  resolveTenantActorContext,
  sanitizeStaffPermissions,
} from "./staff-access";

describe("staff access helpers", () => {
  it("returns default permissions for each staff profile", () => {
    // Defaults come from docs/role-permissions-matrix.md.
    expect(getDefaultPermissionsForProfile(StaffProfile.STAFF)).toEqual([
      StaffPermission.BOOKING_CREATE,
      StaffPermission.BOOKING_MODIFY,
      StaffPermission.BOOKING_CANCEL,
      StaffPermission.BOOKING_MARK_NO_SHOW,
      StaffPermission.BOOKING_ADJUST_PRICE,
      StaffPermission.PAYMENT_COLLECT,
      StaffPermission.QUEUE_CLAIM_SELF,
      StaffPermission.QUEUE_SERVE_SELF,
    ]);
    expect(getDefaultPermissionsForProfile(StaffProfile.CASHIER)).toEqual([
      StaffPermission.BOOKING_CREATE,
      StaffPermission.PAYMENT_COLLECT,
      StaffPermission.SOCIAL_POST_REQUEST_CREATE,
    ]);
    // Use arrayContaining for MANAGER so adding flags doesn't churn this
    // test on every matrix tweak. Spot-check the four permissions that
    // distinguish a manager from a regular staff member.
    expect(getDefaultPermissionsForProfile(StaffProfile.MANAGER)).toEqual(
      expect.arrayContaining([
        StaffPermission.QUEUE_OVERRIDE_ALL,
        StaffPermission.CATALOG_MANAGE,
        StaffPermission.BOOKING_MODIFY,
        StaffPermission.SOCIAL_POST_REVIEW,
      ]),
    );
  });

  it("sanitizes permissions and falls back to defaults when empty", () => {
    const empty = sanitizeStaffPermissions(StaffProfile.STAFF, []);
    expect(empty).toEqual(getDefaultPermissionsForProfile(StaffProfile.STAFF));

    const deduped = sanitizeStaffPermissions(StaffProfile.CASHIER, [
      StaffPermission.BOOKING_CREATE,
      StaffPermission.BOOKING_CREATE,
      "INVALID_PERMISSION" as StaffPermission,
    ]);

    expect(deduped).toEqual([StaffPermission.BOOKING_CREATE]);
  });

  it("applies business policy overlays on top of assigned permissions", () => {
    const staffContext = {
      success: true as const,
      actorType: "EMPLOYEE" as const,
      businessId: "biz_1",
      businessSlug: "tenant-a",
      userId: "user-staff",
      role: Role.EMPLOYEE,
      employeeId: 10,
      ownerId: null,
      profile: StaffProfile.STAFF,
      permissions: [StaffPermission.BOOKING_CREATE],
      businessPolicy: {
        structure: "CASHIER_LED" as const,
        allowEmployeeSelfBooking: false,
        managerCanServe: true,
      },
    };

    expect(
      hasStaffPermission(staffContext, StaffPermission.BOOKING_CREATE),
    ).toBe(false);

    const managerContext = {
      ...staffContext,
      profile: StaffProfile.MANAGER,
      permissions: [
        StaffPermission.QUEUE_CLAIM_SELF,
        StaffPermission.QUEUE_SERVE_SELF,
        StaffPermission.QUEUE_OVERRIDE_ALL,
      ],
      businessPolicy: {
        ...staffContext.businessPolicy,
        managerCanServe: false,
      },
    };

    expect(
      hasStaffPermission(managerContext, StaffPermission.QUEUE_CLAIM_SELF),
    ).toBe(false);
    expect(
      hasStaffPermission(managerContext, StaffPermission.QUEUE_SERVE_SELF),
    ).toBe(false);
    expect(
      hasStaffPermission(managerContext, StaffPermission.QUEUE_OVERRIDE_ALL),
    ).toBe(true);
  });

  it("owner context always has permission checks pass", () => {
    const ownerContext = {
      success: true as const,
      actorType: "OWNER" as const,
      businessId: "biz_1",
      businessSlug: "tenant-a",
      userId: "owner-1",
      role: Role.OWNER,
      ownerId: 1,
      profile: null,
      permissions: [StaffPermission.BOOKING_CREATE],
      employeeId: null,
      businessPolicy: {
        structure: "OWNER_EMPLOYEE_SELF_SERVICE" as const,
        allowEmployeeSelfBooking: false,
        managerCanServe: false,
      },
    };

    expect(
      hasStaffPermission(ownerContext, StaffPermission.CATALOG_MANAGE),
    ).toBe(true);
  });
});

describe("requireStaffPermission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns forbidden when authenticated tenant slug differs", async () => {
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "user-1" } },
    });

    const result = await requireStaffPermission(
      "tenant-b",
      StaffPermission.BOOKING_CREATE,
    );

    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(prismaMock.business.findUnique).not.toHaveBeenCalled();
  });

  it("returns forbidden when employee lacks required permission", async () => {
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "user-1" } },
    });
    prismaMock.business.findUnique.mockResolvedValue({
      id: "biz_1",
      slug: "tenant-a",
      structure: "MANAGER_LED",
      allow_employee_self_booking: true,
      manager_can_serve: true,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      role: Role.EMPLOYEE,
      owner: null,
      employee: {
        id: 7,
        business_id: "biz_1",
        profile: StaffProfile.CASHIER,
        permissions: [StaffPermission.PAYMENT_COLLECT],
      },
    });

    const result = await requireStaffPermission(
      "tenant-a",
      StaffPermission.CATALOG_MANAGE,
    );

    expect(result).toEqual({ success: false, error: "Forbidden" });
  });
});

describe("transaction-scoped actor resolution", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each(["OWNER", "EMPLOYEE"])("uses only the injected transaction for %s without changing the context contract", async role => {
    const db = {
      business: { findUnique: vi.fn().mockResolvedValue({ id: "biz-a", slug: "tenant-a", structure: "MANAGER_LED", allow_employee_self_booking: false, manager_can_serve: false }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-a", role, owner: role === "OWNER" ? { id: 7, business_id: "biz-a" } : null, employee: role === "EMPLOYEE" ? { id: 9, business_id: "biz-a", profile: "MANAGER", permissions: ["BOOKING_MARK_NO_SHOW"] } : null }) },
    };
    expect(await resolveTenantActorContext("tenant-a", "user-a", db as never)).toMatchObject({ success: true, actorType: role, role, businessId: "biz-a", businessSlug: "tenant-a", userId: "user-a", businessPolicy: { structure: "MANAGER_LED", allowEmployeeSelfBooking: false, managerCanServe: false } });
    expect(db.business.findUnique.mock.calls[0][0].where).toEqual({ slug: "tenant-a" });
    expect(db.user.findUnique.mock.calls[0][0].where).toEqual({ id: "user-a" });
    expect(prismaMock.business.findUnique).not.toHaveBeenCalled(); expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
  it("preserves safe missing/stale role or membership results with an injected client", async () => {
    const db = { business: { findUnique: vi.fn().mockResolvedValue({ id: "biz-a" }) }, user: { findUnique: vi.fn().mockResolvedValue(null) } };
    expect(await resolveTenantActorContext("tenant-a", "user-a", db as never)).toEqual({ success: false, error: "Unauthorized" });
    db.user.findUnique.mockResolvedValue({ role: "PLATFORM_ADMIN", owner: { id: 7, business_id: "biz-a" } });
    expect(await resolveTenantActorContext("tenant-a", "user-a", db as never)).toEqual({ success: false, error: "Forbidden" });
    db.user.findUnique.mockResolvedValue({ role: "OWNER", owner: { id: 7, business_id: "biz-foreign" } });
    expect(await resolveTenantActorContext("tenant-a", "user-a", db as never)).toEqual({ success: false, error: "Forbidden" });
  });
});
