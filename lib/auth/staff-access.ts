import {
  BusinessStructure,
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { requireAuth } from "@/lib/auth/guards";

// Default permissions per StaffProfile. Source of truth for new employees
// and the fallback used by sanitizeStaffPermissions when a row has an
// empty permissions array. See docs/role-permissions-matrix.md for the
// product-level rationale; if you're changing this, update the matrix
// doc in the same PR.
const DEFAULT_PERMISSIONS_BY_PROFILE: Record<StaffProfile, StaffPermission[]> = {
  STAFF: [
    StaffPermission.BOOKING_CREATE,
    StaffPermission.BOOKING_MODIFY,
    StaffPermission.BOOKING_CANCEL,
    StaffPermission.BOOKING_MARK_NO_SHOW,
    StaffPermission.BOOKING_ADJUST_PRICE,
    StaffPermission.QUEUE_CLAIM_SELF,
    StaffPermission.QUEUE_SERVE_SELF,
  ],
  MANAGER: [
    StaffPermission.BOOKING_CREATE,
    StaffPermission.PAYMENT_COLLECT,
    StaffPermission.QUEUE_CLAIM_SELF,
    StaffPermission.QUEUE_SERVE_SELF,
    StaffPermission.QUEUE_OVERRIDE_ALL,
    StaffPermission.CATALOG_MANAGE,
    // Booking-editor: managers run the floor and need full booking
    // adjustment authority short of permanent deletion.
    StaffPermission.BOOKING_MODIFY,
    StaffPermission.BOOKING_MARK_NO_SHOW,
    StaffPermission.BOOKING_ADJUST_PRICE,
    StaffPermission.BOOKING_CANCEL,
    // Social-post-request: managers can submit and review.
    // SOCIAL_POST_PUBLISH stays off by default — owners delegate it
    // explicitly via the per-employee admin UI.
    StaffPermission.SOCIAL_POST_REQUEST_CREATE,
    StaffPermission.SOCIAL_POST_REVIEW,
  ],
  CASHIER: [
    StaffPermission.BOOKING_CREATE,
    StaffPermission.PAYMENT_COLLECT,
    StaffPermission.SOCIAL_POST_REQUEST_CREATE,
  ],
};

type TenantBusinessPolicy = {
  structure: BusinessStructure;
  allowEmployeeSelfBooking: boolean;
  managerCanServe: boolean;
};

export type TenantActorContext =
  | {
      success: true;
      businessId: string;
      businessSlug: string;
      userId: string;
      actorType: "OWNER";
      role: Role;
      ownerId: number;
      businessPolicy: TenantBusinessPolicy;
      profile: null;
      permissions: StaffPermission[];
      employeeId: null;
    }
  | {
      success: true;
      businessId: string;
      businessSlug: string;
      userId: string;
      actorType: "EMPLOYEE";
      role: Role;
      employeeId: number;
      businessPolicy: TenantBusinessPolicy;
      profile: StaffProfile;
      permissions: StaffPermission[];
      ownerId: null;
    }
  | {
      success: false;
      error: string;
    };

export function getDefaultPermissionsForProfile(
  profile: StaffProfile,
): StaffPermission[] {
  return [...DEFAULT_PERMISSIONS_BY_PROFILE[profile]];
}

export function sanitizeStaffPermissions(
  profile: StaffProfile,
  permissions: StaffPermission[] | null | undefined,
): StaffPermission[] {
  if (!permissions || permissions.length === 0) {
    return getDefaultPermissionsForProfile(profile);
  }

  const uniquePermissions = Array.from(new Set(permissions));
  const allowed = new Set(Object.values(StaffPermission));

  const filtered = uniquePermissions.filter((permission) =>
    allowed.has(permission),
  );

  return filtered.length > 0
    ? filtered
    : getDefaultPermissionsForProfile(profile);
}

export async function resolveTenantActorContext(
  businessSlug: string,
  userId: string,
): Promise<TenantActorContext> {
  const [business, user] = await Promise.all([
    prisma.business.findUnique({
      where: { slug: businessSlug },
      select: {
        id: true,
        slug: true,
        structure: true,
        allow_employee_self_booking: true,
        manager_can_serve: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        owner: {
          select: {
            id: true,
            business_id: true,
          },
        },
        employee: {
          select: {
            id: true,
            business_id: true,
            profile: true,
            permissions: true,
          },
        },
      },
    }),
  ]);

  if (!business || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const businessPolicy: TenantBusinessPolicy = {
    structure: business.structure,
    allowEmployeeSelfBooking: business.allow_employee_self_booking,
    managerCanServe: business.manager_can_serve,
  };

  if (
    user.role === Role.OWNER &&
    user.owner &&
    user.owner.business_id === business.id
  ) {
    return {
      success: true,
      businessId: business.id,
      businessSlug: business.slug,
      userId,
      actorType: "OWNER",
      role: user.role,
      ownerId: user.owner.id,
      businessPolicy,
      profile: null,
      permissions: Object.values(StaffPermission),
      employeeId: null,
    };
  }

  if (
    user.role === Role.EMPLOYEE &&
    user.employee &&
    user.employee.business_id === business.id
  ) {
    const profile = user.employee.profile ?? StaffProfile.STAFF;
    const permissions = sanitizeStaffPermissions(
      profile,
      user.employee.permissions,
    );

    return {
      success: true,
      businessId: business.id,
      businessSlug: business.slug,
      userId,
      actorType: "EMPLOYEE",
      role: user.role,
      employeeId: user.employee.id,
      businessPolicy,
      profile,
      permissions,
      ownerId: null,
    };
  }

  return { success: false, error: "Forbidden" };
}

export function hasStaffPermission(
  context: Extract<TenantActorContext, { success: true }>,
  permission: StaffPermission,
) {
  if (context.actorType === "OWNER") {
    return true;
  }

  if (!context.permissions.includes(permission)) {
    return false;
  }

  if (
    permission === StaffPermission.BOOKING_CREATE &&
    context.profile === StaffProfile.STAFF &&
    !context.businessPolicy.allowEmployeeSelfBooking
  ) {
    return false;
  }

  if (
    context.profile === StaffProfile.MANAGER &&
    !context.businessPolicy.managerCanServe &&
    (permission === StaffPermission.QUEUE_CLAIM_SELF ||
      permission === StaffPermission.QUEUE_SERVE_SELF)
  ) {
    return false;
  }

  return true;
}

export async function requireStaffPermission(
  businessSlug: string,
  permission: StaffPermission,
  options?: { write?: boolean },
): Promise<
  | {
      success: true;
      context: Extract<TenantActorContext, { success: true }>;
    }
  | {
      success: false;
      error: string;
    }
> {
  const auth = await requireAuth({ write: options?.write });
  if (!auth.success) {
    return auth;
  }

  if (auth.businessSlug !== businessSlug) {
    return { success: false, error: "Forbidden" };
  }

  const context = await resolveTenantActorContext(
    businessSlug,
    auth.session.user.id,
  );

  if (!context.success) {
    return context;
  }

  if (!hasStaffPermission(context, permission)) {
    return { success: false, error: "Forbidden" };
  }

  return {
    success: true,
    context,
  };
}
