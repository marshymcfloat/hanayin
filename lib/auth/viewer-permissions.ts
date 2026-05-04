/**
 * Server-safe viewer permission helpers.
 *
 * `lib/auth/viewer-context.tsx` is marked `"use client"` because it owns
 * the React context provider and hooks. Importing the type or the pure
 * permission predicate from there in a Server Component triggers a
 * cross-boundary error ("Attempted to call hasViewerPermission() from
 * the server"), because every export of a `"use client"` module is
 * wrapped as a client reference.
 *
 * This module is the neutral home for things that need to live on
 * both sides:
 *   - {@link ViewerContextValue}: the serializable shape passed from
 *     server → client.
 *   - {@link hasViewerPermission}: a pure predicate with no React
 *     dependencies, used both in PermissionGate (client) and in route
 *     handlers / server components (server).
 *
 * The client-only surface (Provider, useViewer, usePermission) still
 * lives in `viewer-context.tsx` and re-exports the type from here for
 * backward compatibility with existing client imports.
 */
import type {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";

/**
 * Serializable shape of the resolved actor for the current tenant.
 * Mirrors the success branch of `TenantActorContext` from
 * `lib/auth/staff-access.ts` but drops server-only types (Prisma
 * client, etc.) so it can cross the server-component → client-component
 * boundary.
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

/**
 * Check the viewer's permissions. Owners always pass. For employees,
 * a single permission is treated as required; an array can be passed
 * with `mode: "all"` (default) or `mode: "any"`.
 *
 * Pure function — safe to call from Server Components, Server Actions,
 * Route Handlers, and Client Components alike.
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
