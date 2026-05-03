# Role-Aware UI Primitives

**Status:** Design / shared building blocks.
**Why:** Both the booking-edit feature and the social-post-request feature need consistent role-aware rendering. Today only `deriveViewerContext` exists, scoped to the booking dialog. We extract and generalize so a third feature can plug in without re-deriving the wheel.

This doc specifies the small set of primitives that both features will use. Each primitive is **single-purpose, replaceable, and tested independently** of the features it serves.

## 1. `useViewerContext` — shared actor context provider

Today every page calls `resolveTenantActorContext()` server-side and then has to manually thread role + profile + permissions into every component. This is fine when one component cares; it gets ugly when ten do.

**Add:** a React context that holds the resolved actor for the current `[businessSlug]` and a hook to read it.

```ts
// lib/auth/viewer-context.tsx (new)
type ViewerContextValue = {
  actorType: "OWNER" | "EMPLOYEE";
  role: "OWNER" | "EMPLOYEE";
  staffProfile: "STAFF" | "MANAGER" | "CASHIER" | null;
  permissions: ReadonlyArray<StaffPermission>;
  businessId: string;
  businessSlug: string;
  userId: string;
  ownerId: number | null;
  employeeId: number | null;
};

export function ViewerContextProvider({ value, children }: { value: ViewerContextValue; children: ReactNode }): JSX.Element;
export function useViewer(): ViewerContextValue;
```

The provider is hydrated once, in the `[businessSlug]` layout, with the result of `resolveTenantActorContext()`. Components below never re-fetch.

## 2. `<PermissionGate>` — declarative client-side gate

A wrapper that renders children only when the actor has every permission listed. Replaces ad-hoc `viewerContext.canX && (<Button .../>)` chains and forces a single, consistent fallback story.

```tsx
<PermissionGate require="BOOKING_MODIFY">
  <Button onClick={openAddServiceDialog}>Add service</Button>
</PermissionGate>

<PermissionGate require={["BOOKING_MODIFY", "PAYMENT_COLLECT"]} fallback={<DisabledHint reason="..." />}>
  ...
</PermissionGate>
```

Behavior:

- `require` — single permission or array (treated as AND).
- `requireAny` — alternative array, treated as OR. Mutually exclusive with `require`.
- `fallback` — optional. Defaults to rendering nothing (hidden).
- `disabledFallback` — when supplied, renders a disabled, tooltip-tipped clone of the children instead of hiding. Useful when discoverability > tidiness.
- Owners always pass (the `actorType === "OWNER"` short-circuit lives in the hook, not in every gate).

The component is purely client-side — it is **not** a security boundary. Server actions remain the boundary; this just keeps UIs honest.

## 3. `usePermission` — imperative check

For places where a gate doesn't fit (e.g. branching logic in a handler, conditional toast text), expose a hook:

```ts
const canPublish = usePermission("SOCIAL_POST_PUBLISH");
const canAny = usePermission(["SOCIAL_POST_PUBLISH", "SOCIAL_POST_REVIEW"], { mode: "any" });
```

Backed by the same context as `<PermissionGate>` so behavior is identical.

## 4. `deriveBookingViewerContext` and `deriveSocialViewerContext` — feature shims

Each feature keeps a tiny adapter that turns `useViewer()` output into the booleans its existing components want. This preserves backward compatibility with `BookingDetailsDialog`'s `viewerContext` prop and lets the social feature ship its own shape without refactoring the booking work.

```ts
// components/bookings/BookingQuickPanel.tsx
export function deriveBookingViewerContext(viewer: ViewerContextValue): BookingViewerContext { ... }

// components/dashboard/social-posts/viewer-context.ts (new)
export type SocialViewerContext = {
  canSubmitRequest: boolean;
  canReviewRequests: boolean;
  canEditDraft: boolean;
  canPublish: boolean;
  canViewAnalytics: boolean;
};
export function deriveSocialViewerContext(viewer: ViewerContextValue): SocialViewerContext { ... }
```

The existing `deriveViewerContext` in `components/bookings/BookingQuickPanel.tsx` becomes a thin call to `deriveBookingViewerContext(viewer)`. Its public API does not break.

## 5. `<AuditTrail>` — shared history component

Both features write to `AuditLog` and both need to surface that history. One component, two callers.

```tsx
<AuditTrail entityType="Booking" entityId={String(booking.id)} limit={25} />
<AuditTrail entityType="SocialPostRequest" entityId={request.id} limit={25} />
```

Internally calls a new server action `getEntityAuditHistoryAction(entityType, entityId, limit)` that wraps `getAuditHistory()` from `lib/services/audit.ts`. The action enforces the viewer can read audit history for that entity (owners always; managers if the entity is in their business). Renders:

- chronological list, newest first
- actor name + role badge
- action verb (e.g. "added 2 services", "approved request")
- diff summary derived from `changes.before` / `changes.after`
- relative timestamp + tooltip with absolute UTC

## 6. `<WorkflowApprovalCard>` — generic request → review card

The social-post-request inbox and any future "request → approve" flow share the same structure: requester, subject, status pill, accept/reject actions. Build it once.

```tsx
<WorkflowApprovalCard
  requester={request.requestedBy}
  title={request.topic}
  description={request.brief}
  status={request.status}                 // PENDING / APPROVED / REJECTED / CONVERTED
  submittedAt={request.created_at}
  actions={[
    { label: "Approve & draft", onClick: handleApprove, requirePermission: "SOCIAL_POST_REVIEW" },
    { label: "Reject", onClick: handleReject, variant: "ghost", requirePermission: "SOCIAL_POST_REVIEW" },
  ]}
/>
```

`requirePermission` on each action runs through `<PermissionGate>` so reviewers see the buttons and submitters don't.

## 7. `<RoleBadge>` — consistent role labeling

Tiny but worth standardizing. Renders an actor's role + profile as a colored pill, used in audit trails, request cards, and assignment UIs. Owner / Manager / Cashier / Staff get distinct colors that match the existing dashboard palette. Single component so a color tweak is one edit.

## 8. Forbidden-action toast pattern

When a user tries to invoke something they can't (e.g. clicked a stale optimistic UI element), the server returns `{ error: "Forbidden" }`. We standardize the response in the toast layer:

```ts
import { showForbiddenToast } from "@/components/feedback/permission-toasts";

const result = await someAction(...);
if (!result.success) {
  if (result.error === "Forbidden") return showForbiddenToast({ action: "modify this booking" });
  return showGenericErrorToast(result.error);
}
```

`showForbiddenToast` produces a copy-tested message, links to a "Why can't I do this?" help page (future), and never leaks raw internal strings.

## 9. Client-state helpers for in-flight role-gated mutations

Both features will have multi-step optimistic flows (e.g. add service → reorder list → recompute total). Use TanStack Query mutations with consistent key conventions:

- `["bookings", businessSlug, bookingId]` for any booking-edit mutation.
- `["social-post-requests", businessSlug, "list"]` and `["social-post-requests", businessSlug, requestId]` for request flows.
- `["social-posts", businessSlug, "list"]` continues to work as today.

When a mutation invalidates, also invalidate any "viewer" query so permission changes (e.g. an owner just granted you `BOOKING_MODIFY`) take effect without reload.

## 10. Test strategy for primitives

Each primitive ships with its own Vitest unit tests, separate from feature tests:

- `useViewer` — provider hydration, missing-provider error, owner short-circuit.
- `<PermissionGate>` / `usePermission` — every shape of `require`/`requireAny`, fallback rendering, owner bypass.
- `deriveBookingViewerContext` / `deriveSocialViewerContext` — table-driven tests over every (role, profile, permissions[]) tuple.
- `<AuditTrail>` — renders skeleton, empty state, error state, populated list.
- `<WorkflowApprovalCard>` — buttons hide when `requirePermission` not satisfied.
- Toast pattern — golden tests on copy strings.

Once these are green we can build features on top with confidence.

## 11. File layout

```
lib/auth/
  viewer-context.tsx                      # ViewerContextProvider, useViewer, usePermission
  staff-access.ts                         # (existing) extended with new permission flags

components/feedback/
  permission-toasts.ts                    # showForbiddenToast, showGenericErrorToast

components/permissions/
  PermissionGate.tsx
  RoleBadge.tsx

components/audit/
  AuditTrail.tsx
  audit-actions.ts                        # getEntityAuditHistoryAction (server action)

components/workflows/
  WorkflowApprovalCard.tsx

components/bookings/
  BookingQuickPanel.tsx                   # (existing) thin wrapper now uses deriveBookingViewerContext

components/dashboard/social-posts/
  viewer-context.ts                       # deriveSocialViewerContext
```

Naming follows the dashboard convention (`components/dashboard/...` is the section, primitives sit one level up). New folders are intentional — these are cross-cutting and should not be buried inside a feature folder.
