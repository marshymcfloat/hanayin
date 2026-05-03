import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role, StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";

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
  sanitizeStaffPermissions,
} from "./staff-access";

describe("staff access helpers", () => {
  it("returns default permissions for each staff profile", () => {
    // Defaults come from docs/role-permissions-matrix.md.
    expect(getDefaultPermissionsForProfile(StaffProfile.STAFF)).toEqual([
      StaffPermission.BOOKING_CREATE,
      StaffPermission.PAYMENT_COLLECT,
      StaffPermission.QUEUE_CLAIM_SELF,
      StaffPermission.QUEUE_SERVE_SELF,
      StaffPermission.SOCIAL_POST_REQUEST_CREATE,
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

    expect(hasStaffPermission(staffContext, StaffPermission.BOOKING_CREATE)).toBe(
      false,
    );

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
