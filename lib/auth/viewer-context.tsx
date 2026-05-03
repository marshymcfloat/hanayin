"use client";

/**
 * ViewerContext — single source of truth on the client for "who is viewing
 * this dashboard right now and what can they do".
 *
 * The provider is hydrated once, in the [businessSlug] layout, with a
 * serializable snapshot of {@link resolveTenantActorContext} from
 * `lib/auth/staff-access.ts`. Components below the provider should read
 * the actor through {@link useViewer} or check a single permission
 * imperatively via {@link usePermission}. Declarative gating is provided
 * by `<PermissionGate>` in `components/permissions/PermissionGate.tsx`.
 *
 * Important: this is **not** a security boundary. Server actions remain
 * the boundary. The provider exists so client UIs can render the right
 * affordances without re-deriving role state in every component.
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";

/**
 * Serializable shape of the resolved actor for the current tenant.
 * Mirrors the success branch of {@link TenantActorContext} but drops
 * server-only types (Prisma client, etc.) so it can cross the
 * server-component → client-component boundary.
 */
export type ViewerContextValue = {
  actorType: "OWNER" | "EMPLOYEE";
  role: Role;
  /** null for OWNER actors. */
  staffProfile: StaffProfile | null;
  /** Effective permissions. Owners receive every flag implicitly via
   *  hasViewerPermission()'s short-circuit, so this list reflects the
   *  employee-side permissions only when actorType === "EMPLOYEE". */
  permissions: ReadonlyArray<StaffPermission>;
  businessId: string;
  businessSlug: string;
  userId: string;
  /** Set when actorType === "OWNER". */
  ownerId: number | null;
  /** Set when actorType === "EMPLOYEE". */
  employeeId: number | null;
};

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ViewerContextProvider({
  value,
  children,
}: {
  value: ViewerContextValue;
  children: ReactNode;
}) {
  // Memoize so consumers re-render only when an underlying field actually
  // changes (the layout passes a fresh object on every server render, but
  // its fields are stable across renders for the same session).
  const stable = useMemo<ViewerContextValue>(
    () => ({
      actorType: value.actorType,
      role: value.role,
      staffProfile: value.staffProfile,
      permissions: value.permissions,
      businessId: value.businessId,
      businessSlug: value.businessSlug,
      userId: value.userId,
      ownerId: value.ownerId,
      employeeId: value.employeeId,
    }),
    [
      value.actorType,
      value.role,
      value.staffProfile,
      // permissions is a frozen array on the server; identity is fine.
      value.permissions,
      value.businessId,
      value.businessSlug,
      value.userId,
      value.ownerId,
      value.employeeId,
    ],
  );
  return (
    <ViewerContext.Provider value={stable}>{children}</ViewerContext.Provider>
  );
}

/**
 * Read the viewer context. Throws if called outside the provider — that
 * almost always means a component was rendered outside the
 * [businessSlug] subtree and we'd rather fail loudly in development
 * than silently render with wrong permissions.
 */
export function useViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) {
    throw new Error(
      "useViewer must be used inside <ViewerContextProvider>. " +
        "This typically means the component is rendering outside the " +
        "[businessSlug] dashboard layout.",
    );
  }
  return ctx;
}

/**
 * Like useViewer but never throws — returns null when no provider is
 * present. Use sparingly; preferred default is useViewer().
 */
export function useOptionalViewer(): ViewerContextValue | null {
  return useContext(ViewerContext);
}

/**
 * Check the viewer's permissions. Owners always pass. For employees,
 * a single permission is treated as required; an array can be passed
 * with `mode: "all"` (default) or `mode: "any"`.
 */
export function hasViewerPermission(
  viewer: ViewerContextValue,
  required: StaffPermission | ReadonlyArray<StaffPermission>,
  mode: "all" | "any" = "all",
): boolean {
  if (viewer.actorType === "OWNER") {
    return true;
  }
  const list = Array.isArray(required) ? required : [required];
  if (list.length === 0) {
    // Empty list = trivially true; useful when callers compute the
    // requirement dynamically and may end up with [].
    return true;
  }
  const owned = new Set(viewer.permissions);
  return mode === "any"
    ? list.some((p) => owned.has(p))
    : list.every((p) => owned.has(p));
}

/**
 * Hook flavor of {@link hasViewerPermission}. Owners always pass.
 *
 * @example
 *   const canPublish = usePermission("SOCIAL_POST_PUBLISH");
 *   const canModifyOrPay = usePermission(
 *     ["BOOKING_MODIFY", "PAYMENT_COLLECT"],
 *     { mode: "any" },
 *   );
 */
export function usePermission(
  required: StaffPermission | ReadonlyArray<StaffPermission>,
  options?: { mode?: "all" | "any" },
): boolean {
  const viewer = useViewer();
  return hasViewerPermission(viewer, required, options?.mode ?? "all");
}
