# Booking Editor — Implementation Plan

**Status:** Implementation roadmap.
**Companion docs:** `role-permissions-matrix.md`, `role-aware-ui-primitives.md`, `booking-editor-design.md`.

The work breaks into five phases. Each phase is self-contained and ships behind the same feature flag so we can pause between them. Cross-cutting primitives from `role-aware-ui-primitives.md` are built in phase 0 because both this feature and the social-post-request feature depend on them.

## Feature flag

Add a single env-var-backed flag, evaluated per-business:

```ts
// features/bookings/booking-editor.ts (new)
export function isBookingEditorEnabledForBusiness(slug: string): boolean;
```

Backed by `BOOKING_EDITOR_ENABLED` (boolean) + `BOOKING_EDITOR_PILOT_SLUGS` (CSV). Same shape as `SOCIAL_PUBLISHING_ENABLED`. Default off until phase 4 is shipped and verified.

---

## Phase 0 — Cross-cutting primitives (1–2 days)

Build the shared scaffolding from `role-aware-ui-primitives.md`. Both features need it.

| File                                                | Action                                        |
| --------------------------------------------------- | --------------------------------------------- |
| `lib/auth/viewer-context.tsx`                       | new — `ViewerContextProvider`, `useViewer`    |
| `components/permissions/PermissionGate.tsx`         | new                                           |
| `components/permissions/RoleBadge.tsx`              | new                                           |
| `components/audit/AuditTrail.tsx`                   | new                                           |
| `components/audit/audit-actions.ts`                 | new — `getEntityAuditHistoryAction`           |
| `components/feedback/permission-toasts.ts`          | new                                           |
| `app/(private)/app/[businessSlug]/layout.tsx`       | edit — wrap children in `ViewerContextProvider` hydrated from `resolveTenantActorContext` |
| `lib/auth/viewer-context.test.tsx`                  | new — provider + hook + owner short-circuit   |
| `components/permissions/PermissionGate.test.tsx`    | new — every shape of `require`/`requireAny`/`fallback`/`disabledFallback` |

Migrations: none.
Acceptance: existing dashboard pages still render; tests green; provider returns the same actor as `resolveTenantActorContext`.

---

## Phase 1 — Permissions migration + extended add/remove/swap (2–3 days)

Extend the schema and back-end so permissions reflect the new matrix and the booking detail can express scope changes.

### Schema

```prisma
enum StaffPermission {
  BOOKING_CREATE
  BOOKING_MODIFY        // new
  BOOKING_MARK_NO_SHOW  // new
  BOOKING_ADJUST_PRICE  // new
  BOOKING_CANCEL        // new
  PAYMENT_COLLECT
  QUEUE_CLAIM_SELF
  QUEUE_SERVE_SELF
  QUEUE_OVERRIDE_ALL
  CATALOG_MANAGE
}

model BookingNote { ... }                     // see booking-editor-design.md §8
enum BookingNoteVisibility { ... }
model BookingPriceAdjustment { ... }

model Booking {
  // additions
  cancelled_at        DateTime?
  cancelled_by_id     String?
  cancellation_reason String?
}
```

Migration: `prisma/migrations/<ts>_booking_editor_phase1/migration.sql`. Backfill: existing managers get the four new permissions automatically (handled in `DEFAULT_PERMISSIONS_BY_PROFILE` for fresh employees; existing rows get a one-time UPDATE in the migration's data-fix step).

### Server actions

| File                                                  | Action |
| ----------------------------------------------------- | ------ |
| `lib/auth/staff-access.ts`                            | edit — extend `DEFAULT_PERMISSIONS_BY_PROFILE` per matrix |
| `features/bookings/services/booking-addons.ts`        | edit — accept either `BOOKING_CREATE` or `BOOKING_MODIFY` for the add-on path during transition |
| `features/bookings/actions/booking-addons.ts`                | edit — same |
| `features/bookings/actions/booking-modify.ts`                | new — `removeBookingServiceAction`, `swapBookingServiceAction` |
| `features/bookings/actions/booking-modify.test.ts`           | new — permission and state-machine tests |
| `lib/services/audit-events.ts`                        | new — typed helpers for the new event payload shapes |

### UI

| File                                                       | Action                                              |
| ---------------------------------------------------------- | --------------------------------------------------- |
| `components/dashboard/owner/BookingDetailsDialog.tsx`      | edit — surface remove/swap buttons gated by `BOOKING_MODIFY` |
| `components/bookings/BookingQuickPanel.tsx`                | edit — `deriveViewerContext` reads new permission flags |

Acceptance: managers can add and remove services on bookings they could already see; owner UX unchanged; tests cover permission denial paths.

---

## Phase 2 — Reschedule, reassign, price adjust, no-show, cancel, notes (3–4 days)

The big surface-area phase. New server actions for every modifying operation in `booking-editor-design.md` §4.

### Server actions

| File                                                  | Action                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `features/bookings/actions/booking-modify.ts`                | edit — add `rescheduleBookingAction`, `reassignBookingStaffAction`, `adjustBookingPriceAction`, `cancelBookingAction`, `addBookingNoteAction` |
| `features/dashboard/actions/owner.ts`               | edit — change `markBookingNoShowAction`'s gate from owner-only to `BOOKING_MARK_NO_SHOW` |
| `features/bookings/services/booking-modify.ts`        | new — pure logic: ETA recalc, conflict detection, downstream-queue ripple                  |
| `lib/services/outbox.ts`                              | edit — register the new event types                                                        |
| `lib/services/outbox-delivery.ts`                     | edit — handlers for reschedule / cancel / price customer messages                          |

### UI

| File                                                                                  | Action                                  |
| ------------------------------------------------------------------------------------- | --------------------------------------- |
| `components/dashboard/owner/BookingDetailsDialog.tsx`                                 | edit — surface the seven new action buttons, wrap each in `<PermissionGate>` |
| `components/dashboard/owner/booking-actions/RescheduleDialog.tsx`                     | new                                     |
| `components/dashboard/owner/booking-actions/ReassignStaffDialog.tsx`                  | new                                     |
| `components/dashboard/owner/booking-actions/AdjustPriceDialog.tsx`                    | new                                     |
| `components/dashboard/owner/booking-actions/CancelBookingDialog.tsx`                  | new                                     |
| `components/dashboard/owner/booking-actions/AddNoteForm.tsx`                          | new                                     |
| Tests for each of the above                                                           | new                                     |

Acceptance: every action either updates the booking or returns a permission/validation error with a usable message. Audit trail shows the change. Customers receive notifications for reschedule and cancel.

---

## Phase 3 — Multi-surface integration (2–3 days)

Wire `BookingQuickPanel` everywhere it should appear.

### Owner side (no behavior regression)

| File                                                                  | Action                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `components/dashboard/owner/BookingList.tsx`                          | edit — open via `BookingQuickPanel` (no `viewerContext` → owner default) |
| Customer profile page (find under `app/(private)/app/[businessSlug]/customers/`) | edit — same                                                        |
| Calendar / queue surfaces (`ManagerQueueBoard`, `OwnerServiceQueue`)  | edit — clickable rows open the panel                              |

### Manager side

| File                                                              | Action                                              |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| `components/dashboard/manager/ManagerDashboard.tsx`               | edit — add a "Bookings today" tab                  |
| `components/dashboard/manager/ManagerBookingsTab.tsx`             | new — list bookings, opens `BookingQuickPanel` with `deriveViewerContext` |

### Cashier side

| File                                                                                       | Action                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `app/(private)/app/[businessSlug]/page.tsx`                                                | edit — branch by `StaffProfile`, route CASHIER → `<CashierDashboard>` |
| `components/dashboard/cashier/CashierDashboard.tsx`                                        | new — front-desk view: today's bookings + payment column |
| `components/dashboard/cashier/CashierBookingRow.tsx`                                       | new                                                     |

### Staff side

| File                                                       | Action                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `components/dashboard/employee/EmployeeDashboard.tsx`      | edit — add "My bookings" section listing bookings where the user is `served_by_id`         |
| `components/dashboard/employee/MyBookingsList.tsx`         | new — opens `BookingQuickPanel` with read-mostly viewer context                            |

### Notification deep-link

| File                                                       | Action                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `app/(private)/app/[businessSlug]/notifications/page.tsx`  | edit — clicking a booking-related notification routes to `bookings?open=<id>`              |
| `app/(private)/app/[businessSlug]/bookings/page.tsx`       | edit — read `searchParams.open` and auto-open the panel                                    |

Acceptance: a user in each role lands in their own dashboard; the panel opens from the surfaces listed; only their permitted actions appear; deep links work.

---

## Phase 4 — Mobile polish, audit viewer, employee permission admin (2–3 days)

Quality bar.

### Mobile

| File                                                  | Action                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `components/dashboard/owner/BookingDetailsDialog.tsx` | edit — switch to bottom-sheet variant on `sm:`, sticky action bar   |
| `components/dashboard/cashier/CashierDashboard.tsx`   | edit — large tap targets, single-column on mobile                   |

### Audit viewer

| File                                  | Action                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `components/audit/AuditTrail.tsx`     | already added in phase 0; here: surface a "View audit trail" link in the panel |

### Per-employee permission admin

| File                                                                 | Action                                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `app/(private)/app/[businessSlug]/employees/page.tsx`                | edit — add per-row "Permissions" button                                                 |
| `components/dashboard/owner/employees/EditPermissionsDialog.tsx`     | new — checkboxes for the `StaffPermission` flags (excluding owner-implicit ones), saves to `Employee.permissions` via existing employee update action |
| `features/workforce/actions/employees.ts`                                    | edit (or new helper) — `setEmployeePermissionsAction(employeeId, permissions[])`        |

Acceptance: owner can grant / revoke each permission per employee; changes take effect on the employee's next page load; audit log records the permission change with `entity_type: "Employee"`.

---

## Phase 5 — Verification gate (1 day)

Block ship until:

- All unit tests green; coverage ≥ existing thresholds.
- Vitest table-driven test of the booking matrix runs every (role × profile × permission tuple × action) combination from `role-permissions-matrix.md` and asserts the right outcome.
- Playwright smoke: log in as owner / manager / cashier / staff in turn; the script in `test/e2e/booking-editor.spec.ts` (new) opens the panel from each role's primary surface, performs the role's primary action, and confirms the audit trail entry appears.
- Manual role walkthrough script signed off (see `verification-plan.md`, task #10).
- Production-readiness checklist green: error states for every action, loading spinners, empty states, accessibility (Tab order through the panel), telemetry events fired (`booking.modified`, `booking.rescheduled`, etc.).
- Feature flag verified — turning it off restores legacy owner-only behavior cleanly.
- Rollback plan: a one-line env-var flip + a SQL revert of the additive migration (no data loss because no destructive change).

---

## Risk and mitigations

- **Permission default expansion** — managers gaining four new permissions by default could surprise existing tenants. Mitigation: ship behind the per-business pilot list before flipping the global flag; communicate via in-app announcement on first manager login post-rollout.
- **Notification spam** — every booking modification could fire a customer SMS. Mitigation: debounce (one outbox-delivery aggregator per booking per 5 minutes for non-cancel events); cancel and reschedule remain immediate.
- **Audit-log volume** — increases meaningfully. Mitigation: existing `AuditLog` indexes by `(business_id, entity_type, entity_id)` already cover the read paths; add `(business_id, created_at desc)` for the audit-trail viewer.
- **Cashier dashboard divergence** — historically cashiers fell through to employee dashboard; some tenants may rely on that. Mitigation: only route to `<CashierDashboard>` when `StaffProfile = CASHIER` AND business structure is cashier-aware (`CASHIER_LED` or `MANAGER_CASHIER`); otherwise keep legacy routing.

---

## Sequencing summary

```
Phase 0 (primitives)
  └─► Phase 1 (perms + remove/swap)
        └─► Phase 2 (reschedule/cancel/etc.)
              └─► Phase 3 (multi-surface integration)
                    └─► Phase 4 (mobile + audit + perm admin)
                          └─► Phase 5 (verification gate, ship)
```

Estimated total: ~10–15 working days for a single engineer, less if phases 1–2 and the social-post-request feature parallelize after phase 0.
