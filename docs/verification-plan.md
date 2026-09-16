# Verification Plan — Booking Editor + Social Post Request

**Status:** Pre-ship gate.
**Companion docs:** `role-permissions-matrix.md`, `booking-editor-design.md`, `booking-editor-implementation-plan.md`, `social-post-request-design.md`, `social-post-request-implementation-plan.md`.

This is the gate that has to be green before either feature flag flips on for non-pilot tenants. It's organized as a checklist so each PR can tick its row. Treat it as the acceptance bar — anything red stays behind the flag.

## 1. Automated tests

### 1.1 Permission matrix coverage (table-driven)

A single Vitest table runs every cell from `role-permissions-matrix.md` for both features. One source of truth, executed end-to-end.

- [ ] `lib/auth/staff-access.test.ts` — extends existing tests with the seven new flags; covers `hasStaffPermission` for every (actorType, profile, permission, business policy) tuple.
- [ ] `features/bookings/actions/booking-modify.test.ts` — for each booking action in §3 of the matrix, assert allowed + denied actors.
- [ ] `features/social/actions/social-post-requests.test.ts` — same for §4 of the matrix.
- [ ] `components/permissions/PermissionGate.test.tsx` — render-only coverage of every gating mode.

### 1.2 State-machine tests

- [ ] `Booking` lifecycle: HOLD → ACCEPTED → COMPLETED with intermediate add-service / remove / swap / reschedule / price-adjust events; assert each transition is legal in only the allowed prior states.
- [ ] `SocialPostRequest` lifecycle: PENDING → APPROVED, → REJECTED, → CANCELLED; assert APPROVED-after-CANCELLED returns a typed error.
- [ ] `SocialPost` (existing) — confirm nothing in the existing state machine regressed.

### 1.3 Audit-log assertions

- [ ] Every modifying action under both features writes one `AuditLog` row whose `entity_type`, `entity_id`, `actor_id`, `action` and `changes` shape match the contract in `role-permissions-matrix.md` §7.
- [ ] No silent skips: a Vitest test reflects over the modify-actions module list and asserts each one writes audit. New action without audit = test failure.

### 1.4 Outbox event assertions

- [ ] Each new event type has at least one delivery-handler test (`lib/services/outbox-delivery.test.ts`).
- [ ] Customer-facing notifications trigger only on the events listed in `role-permissions-matrix.md` §3 ("Customer-visible side effect" column).
- [ ] Internal-only events (`BOOKING_NOTE_ADDED`) never reach customer channels — test asserts no Resend / Semaphore call.

### 1.5 Coverage thresholds

- [ ] `npm run test:ci` passes existing thresholds.
- [ ] New files in `features/bookings/actions/booking-modify.ts`, `features/bookings/services/booking-modify.ts`, `features/social/actions/social-post-requests.ts`, `lib/services/social/post-request.ts`, `components/permissions/`, `components/audit/` all ≥ 90% line coverage.

## 2. End-to-end role walkthrough

A scripted Playwright run that covers each role's primary surface for each feature. Lives in `test/e2e/`.

### 2.1 Booking editor (`test/e2e/booking-editor.spec.ts`, new)

- [ ] **Owner** — log in, open `/bookings`, click a row, add a service, reschedule, mark paid, mark no-show, cancel. Confirm every action succeeds and the audit trail shows them in order.
- [ ] **Manager** — log in, navigate to manager dashboard → Bookings tab, click a row, add a service, reschedule, reassign staff. Confirm "Delete" is not visible. Confirm a scheduled-change SMS was queued in the test outbox.
- [ ] **Cashier** — log in, land on cashier dashboard, click a booking, record a partial payment, apply a discount with a reason. Confirm "Reschedule" and "Reassign" are not visible.
- [ ] **Staff** — log in, see "My bookings", click their own claimed booking, add an internal note. Confirm "Add service", "Reschedule", "Cancel" are not visible.

### 2.2 Social post request (`test/e2e/social-post-request.spec.ts`, new)

- [ ] **Manager** submits a request from "Suggest a post". Confirms the request appears in the owner's inbox.
- [ ] **Owner** approves the request. Confirms a `SocialPost` draft was created with the requester's topic + brief mapped onto the existing organic-post inputs.
- [ ] **Owner** publishes the draft. Confirms the requester receives a `SOCIAL_POST_REQUEST_PUBLISHED` notification with the public permalink.
- [ ] **Staff** without `SOCIAL_POST_REQUEST_CREATE` lands on `/social-posts` and sees only the empty / upsell card — no inbox, no "Suggest a post" button.

### 2.3 Existing-test regression

- [ ] `npm run test:e2e` (existing booking smoke) still passes unchanged.
- [ ] No existing Vitest tests fail without an explicit, documented reason.

## 3. Manual sign-off checklist

Done in a staging tenant against real data with each role's user account. Tester records the date and initials.

### 3.1 Booking editor

- [ ] Owner can perform every action listed in `booking-editor-design.md` §4 without errors.
- [ ] Manager only sees and can use the actions allowed by the matrix, including in mobile viewport.
- [ ] Cashier sees the front-desk dashboard with today's bookings and a clear "Record payment" path.
- [ ] Staff can find their bookings without nav diving and add notes.
- [ ] Audit trail lists every change with actor, action, before/after, and timestamp.
- [ ] Customer received the appropriate message (or did not) per the matrix.
- [ ] The feature flag, when turned off, restores legacy owner-only behavior with no console errors.

### 3.2 Social post request

- [ ] Submission validates required fields, max-length copy, attachment size cap.
- [ ] Owner inbox refreshes within 2s of a new submission (TanStack invalidation working).
- [ ] Approval pre-fills `CreateOrganicPostDialog` with requester input — no field manually re-entered.
- [ ] Rejection requires a reason and surfaces it on requester's "My requests".
- [ ] Cancelling own pending request works; cancel after approval is blocked.
- [ ] Duplicate-submission warning appears for matching topic/category in the last 14 days.
- [ ] Rate-limiter caps fire (manual: rapid-submit until 429).

## 4. Production-readiness checklist (per feature)

Same checklist applied to both features. Entry stays open until every box ticks for that feature.

- [ ] All new server actions return typed result objects (`{ success: true, ... } | { success: false, error }`); no thrown exceptions reach the client.
- [ ] Loading state for every async action (button spinner ≥ 200ms threshold).
- [ ] Empty state for every list (inbox, my-requests, my-bookings, audit trail).
- [ ] Error state for every list with a retry control.
- [ ] Keyboard accessibility — Tab order through the booking panel and request dialog passes manual + axe scan.
- [ ] Mobile viewport (`375x667`) passes a click-through with no overflow / cut-off action bar.
- [ ] Screen-reader sweep on the panel and dialog (announce role badges, action labels).
- [ ] No PII in logs — actor IDs only, never raw names/emails. Sentry breadcrumbs scrubbed.
- [ ] Telemetry events fire: `booking.modified.{action}` and `social.post_request.{action}` with `{businessId, actorRole, durationMs}`. Confirmed in dashboards.
- [ ] Rate-limit metrics emit (count of 429s per business per day).
- [ ] Feature-flag default is OFF in production until pilot sign-off.
- [ ] Pilot list in env is populated with the sign-off tenants only.

## 5. Database migration safety

- [ ] Migrations are additive only (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`). No drops, no renames.
- [ ] New columns are nullable or default-valued. No write-locking backfill.
- [ ] Backfill SQL for default permissions runs in a single transaction with explicit `WHERE` filters by business pilot list.
- [ ] `prisma migrate diff` against staging is reviewed in PR; no surprises.
- [ ] Rollback recipe documented per phase: revert the migration; revert the env flag. Both verified in staging.

## 6. Telemetry and operational dashboards

- [ ] Booking editor dashboard panel: count of `booking.modified.*` per action per day, broken down by `actorRole`.
- [ ] Social post request dashboard panel: `submitted / approved / rejected / cancelled / published` daily counts per business.
- [ ] AI cost attribution: each successful `approveSocialPostRequestAction` writes a `cost_metric` row tagged `feature: "social_post_request"` so we can see incremental AI spend.
- [ ] On-call alert: if `booking.modified.failed` > 5% over a 1-hour window for any business, page.

## 7. Communication checklist

- [ ] In-app announcement when the booking-editor flag flips on for a tenant — explains the new role-aware actions to the existing owner.
- [ ] Help-center article with the matrix table, refreshed copy, and a screenshot per role.
- [ ] Internal release notes for support including: where users find each action, common error states, how to grant per-employee permissions.
- [ ] Changelog entry mentions both features and the new permission flags.

## 8. Rollback rehearsal

Done once per feature, in staging, before flipping the production flag.

- [ ] Flip the env flag off mid-session — confirm the UI degrades gracefully without errors and any in-flight modal closes cleanly.
- [ ] Roll back the most recent additive migration — confirm app boots, queries succeed against the older schema (the additive columns become dead but harmless).
- [ ] Verified runbook entry for incident response: which logs to grep, which metric to watch, who to page.

---

## Sign-off block

When every box above is ticked, the feature is cleared for general rollout. Add a sign-off note here — engineer, reviewer, date — and only then update the flag rollout in `features/bookings/booking-editor.ts` / `features/social/social-post-requests.ts`.
