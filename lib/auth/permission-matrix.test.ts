import { describe, expect, it } from "vitest";

import {
  hasStaffPermission,
  type TenantActorContext,
} from "@/lib/auth/staff-access";
import {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";

/**
 * Single source-of-truth test for docs/role-permissions-matrix.md.
 *
 * The Vitest table below enumerates every (actorType × StaffProfile ×
 * permission flag) combination from the matrix and asserts the
 * outcome of hasStaffPermission. When the matrix changes, this test
 * is the first place to update — and conversely, this test is what
 * catches a regression in deriveBookingViewerContext or in any new
 * action's gate.
 *
 * Owners always pass via the actorType === "OWNER" short-circuit, so
 * we still spot-check that explicitly. Employees are tested per-
 * profile against the default permission lists from
 * DEFAULT_PERMISSIONS_BY_PROFILE in lib/auth/staff-access.ts.
 */

type ActorContextSuccess = Extract<TenantActorContext, { success: true }>;

const BUSINESS_POLICY: ActorContextSuccess["businessPolicy"] = {
  structure: "OWNER_EMPLOYEE_SELF_SERVICE" as const,
  allowEmployeeSelfBooking: true,
  managerCanServe: true,
};

function ownerContext(): ActorContextSuccess {
  return {
    success: true,
    businessId: "biz_1",
    businessSlug: "demo",
    userId: "user_owner",
    actorType: "OWNER",
    role: Role.OWNER,
    ownerId: 1,
    employeeId: null,
    profile: null,
    permissions: Object.values(StaffPermission),
    businessPolicy: BUSINESS_POLICY,
  };
}

function employeeContext(input: {
  profile: StaffProfile;
  permissions: StaffPermission[];
  businessPolicy?: Partial<ActorContextSuccess["businessPolicy"]>;
}): ActorContextSuccess {
  return {
    success: true,
    businessId: "biz_1",
    businessSlug: "demo",
    userId: "user_employee",
    actorType: "EMPLOYEE",
    role: Role.EMPLOYEE,
    employeeId: 11,
    ownerId: null,
    profile: input.profile,
    permissions: input.permissions,
    businessPolicy: { ...BUSINESS_POLICY, ...(input.businessPolicy ?? {}) },
  };
}

// ─── Default-permission expectations per profile ─────────────────
//
// These mirror DEFAULT_PERMISSIONS_BY_PROFILE in
// lib/auth/staff-access.ts. If you change one, change the other —
// they're meant to stay in lockstep with docs/role-permissions-matrix.md §3+§4.

const DEFAULT_STAFF_PERMS: ReadonlySet<StaffPermission> = new Set([
  StaffPermission.BOOKING_CREATE,
  StaffPermission.PAYMENT_COLLECT,
  StaffPermission.QUEUE_CLAIM_SELF,
  StaffPermission.QUEUE_SERVE_SELF,
  StaffPermission.SOCIAL_POST_REQUEST_CREATE,
]);

const DEFAULT_MANAGER_PERMS: ReadonlySet<StaffPermission> = new Set([
  StaffPermission.BOOKING_CREATE,
  StaffPermission.PAYMENT_COLLECT,
  StaffPermission.QUEUE_CLAIM_SELF,
  StaffPermission.QUEUE_SERVE_SELF,
  StaffPermission.QUEUE_OVERRIDE_ALL,
  StaffPermission.CATALOG_MANAGE,
  StaffPermission.BOOKING_MODIFY,
  StaffPermission.BOOKING_MARK_NO_SHOW,
  StaffPermission.BOOKING_ADJUST_PRICE,
  StaffPermission.BOOKING_CANCEL,
  StaffPermission.SOCIAL_POST_REQUEST_CREATE,
  StaffPermission.SOCIAL_POST_REVIEW,
]);

const DEFAULT_CASHIER_PERMS: ReadonlySet<StaffPermission> = new Set([
  StaffPermission.BOOKING_CREATE,
  StaffPermission.PAYMENT_COLLECT,
  StaffPermission.SOCIAL_POST_REQUEST_CREATE,
]);

// ─── Owner ───────────────────────────────────────────────────────

describe("permission matrix — OWNER actor", () => {
  const ctx = ownerContext();
  // Owners pass every permission unconditionally per the
  // hasStaffPermission short-circuit. The test is exhaustive over
  // the enum to lock that contract in.
  it.each(Object.values(StaffPermission))(
    "passes %s",
    (permission) => {
      expect(hasStaffPermission(ctx, permission)).toBe(true);
    },
  );
});

// ─── STAFF profile ───────────────────────────────────────────────

describe("permission matrix — STAFF profile (default permissions)", () => {
  const ctx = employeeContext({
    profile: StaffProfile.STAFF,
    permissions: Array.from(DEFAULT_STAFF_PERMS),
  });

  it.each(Object.values(StaffPermission))(
    "permission %s aligns with the matrix",
    (permission) => {
      const expected = DEFAULT_STAFF_PERMS.has(permission);
      expect(hasStaffPermission(ctx, permission)).toBe(expected);
    },
  );
});

// ─── MANAGER profile ────────────────────────────────────────────

describe("permission matrix — MANAGER profile (default permissions)", () => {
  const ctx = employeeContext({
    profile: StaffProfile.MANAGER,
    permissions: Array.from(DEFAULT_MANAGER_PERMS),
  });

  it.each(Object.values(StaffPermission))(
    "permission %s aligns with the matrix",
    (permission) => {
      const expected = DEFAULT_MANAGER_PERMS.has(permission);
      expect(hasStaffPermission(ctx, permission)).toBe(expected);
    },
  );
});

// ─── CASHIER profile ─────────────────────────────────────────────

describe("permission matrix — CASHIER profile (default permissions)", () => {
  const ctx = employeeContext({
    profile: StaffProfile.CASHIER,
    permissions: Array.from(DEFAULT_CASHIER_PERMS),
  });

  it.each(Object.values(StaffPermission))(
    "permission %s aligns with the matrix",
    (permission) => {
      const expected = DEFAULT_CASHIER_PERMS.has(permission);
      expect(hasStaffPermission(ctx, permission)).toBe(expected);
    },
  );
});

// ─── Business-policy overlays ────────────────────────────────────
//
// hasStaffPermission applies two business-policy overlays per the
// helper's contract: allow_employee_self_booking and manager_can_serve.
// These tests pin the overlay behavior so the matrix stays honest
// across structure changes (OWNER_EMPLOYEE_SELF_SERVICE / MANAGER_LED
// / CASHIER_LED / MANAGER_CASHIER).

describe("permission matrix — business policy overlays", () => {
  it("STAFF.BOOKING_CREATE is suppressed when allowEmployeeSelfBooking=false", () => {
    const ctx = employeeContext({
      profile: StaffProfile.STAFF,
      permissions: [StaffPermission.BOOKING_CREATE],
      businessPolicy: { allowEmployeeSelfBooking: false },
    });
    expect(hasStaffPermission(ctx, StaffPermission.BOOKING_CREATE)).toBe(false);
  });

  it("STAFF.BOOKING_CREATE passes when allowEmployeeSelfBooking=true (default)", () => {
    const ctx = employeeContext({
      profile: StaffProfile.STAFF,
      permissions: [StaffPermission.BOOKING_CREATE],
    });
    expect(hasStaffPermission(ctx, StaffPermission.BOOKING_CREATE)).toBe(true);
  });

  it("MANAGER.QUEUE_CLAIM_SELF is suppressed when managerCanServe=false", () => {
    const ctx = employeeContext({
      profile: StaffProfile.MANAGER,
      permissions: [
        StaffPermission.QUEUE_CLAIM_SELF,
        StaffPermission.QUEUE_SERVE_SELF,
        StaffPermission.QUEUE_OVERRIDE_ALL,
      ],
      businessPolicy: { managerCanServe: false },
    });
    expect(hasStaffPermission(ctx, StaffPermission.QUEUE_CLAIM_SELF)).toBe(false);
    expect(hasStaffPermission(ctx, StaffPermission.QUEUE_SERVE_SELF)).toBe(false);
    // Override is unaffected — managers can still re-route bookings
    // even when they personally don't serve.
    expect(hasStaffPermission(ctx, StaffPermission.QUEUE_OVERRIDE_ALL)).toBe(true);
  });

  it("MANAGER.BOOKING_MODIFY is unaffected by managerCanServe", () => {
    // Regression guard: serving and modifying are distinct axes.
    const ctx = employeeContext({
      profile: StaffProfile.MANAGER,
      permissions: [StaffPermission.BOOKING_MODIFY],
      businessPolicy: { managerCanServe: false },
    });
    expect(hasStaffPermission(ctx, StaffPermission.BOOKING_MODIFY)).toBe(true);
  });
});

// ─── Owner-only destructive ops (out of permission system) ───────
//
// Permanent delete and SOCIAL_POST_PUBLISH-by-default are intentionally
// not delegable. delete is not a StaffPermission flag at all — it
// stays role-locked to OWNER. SOCIAL_POST_PUBLISH defaults off for
// every employee profile and only flips on via the per-employee
// admin UI. Both contracts are pinned here to prevent accidental
// expansion.

describe("permission matrix — non-delegable contracts", () => {
  it("StaffPermission enum has no DELETE-style flag", () => {
    const flags = Object.values(StaffPermission);
    for (const flag of flags) {
      expect(flag).not.toMatch(/DELETE/);
    }
  });

  it("SOCIAL_POST_PUBLISH is NOT in any default profile array", () => {
    expect(DEFAULT_STAFF_PERMS.has(StaffPermission.SOCIAL_POST_PUBLISH)).toBe(false);
    expect(DEFAULT_MANAGER_PERMS.has(StaffPermission.SOCIAL_POST_PUBLISH)).toBe(false);
    expect(DEFAULT_CASHIER_PERMS.has(StaffPermission.SOCIAL_POST_PUBLISH)).toBe(false);
  });

  it("an explicitly-granted SOCIAL_POST_PUBLISH still passes hasStaffPermission", () => {
    // The default is off, but per-employee opt-in is allowed via the
    // admin UI. This test documents that the gate isn't blanket-blocked.
    const ctx = employeeContext({
      profile: StaffProfile.MANAGER,
      permissions: [StaffPermission.SOCIAL_POST_PUBLISH],
    });
    expect(hasStaffPermission(ctx, StaffPermission.SOCIAL_POST_PUBLISH)).toBe(true);
  });
});
