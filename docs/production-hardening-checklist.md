# Production Hardening Checklist

This checklist is ordered for safe rollout. Each PR should be deployable on its own.

## PR-1: Critical Tenant Security and Access Control

- [x] Enforce tenant ownership in customer mutations.
  - `features/customers/actions/customer.ts`
- [x] Enforce tenant ownership in service mutations.
  - `features/catalog/actions/services.ts`
- [x] Enforce tenant ownership in employee mutations and password reset.
  - `features/workforce/actions/employees.ts`
- [x] Enforce tenant ownership in sale-event delete and stricter owner-only mutation policy.
  - `features/catalog/actions/sale-event.ts`
  - `lib/auth/guards.ts` (reuse existing owner guard)
- [x] Enforce owner access to sale-events page.
  - `app/(private)/app/[businessSlug]/sale-events/page.tsx`
- [x] Prevent cross-tenant service/package linking in sale-event creation.
  - `features/catalog/actions/sale-event.ts`
- [x] Remove business-slug trust from customer search and force auth tenant scope.
  - `features/customers/actions/customer.ts`
- [x] Add auth and upload validation (type/size) to server upload action.
  - `features/assets/actions/upload.ts`

## PR-2: High-Priority Data/Query Scalability

- [x] Reduce owner dashboard query load and move heavy aggregates to DB.
  - `components/dashboard/owner/OwnerDashboardDataContainer.tsx`
- [x] Fix tenant filter bug on attendance metric.
  - `components/dashboard/owner/OwnerDashboardDataContainer.tsx`
- [x] Paginate bookings server-side and support server filters.
  - `app/(private)/app/[businessSlug]/bookings/page.tsx`
  - `components/dashboard/owner/BookingList.tsx`

## PR-3: High-Priority Async Reliability (Outbox/Cron/Reminders)

- [x] Make outbox claiming concurrency-safe and increase controlled throughput.
  - `app/api/cron/process-outbox/route.ts`
- [x] Make subscription renewal/dunning cron batches parallel-safe and chunked.
  - `app/api/cron/subscription-renewals/route.ts`
  - `app/api/cron/subscription-dunning/route.ts`
- [x] Fix reminder booking links to use canonical business slug.
  - `lib/services/flow-reminders.ts`
  - `lib/services/re-engagement.ts`
- [x] Improve reminder sending batching and DB access patterns.
  - `lib/services/reminders.ts`
  - `lib/services/flow-reminders.ts`
  - `lib/services/re-engagement.ts`

## PR-4: Caching and Schema Hardening

- [x] Add cache tagging for tenant business/service/package caches.
  - `lib/data/cached.ts`
- [x] Add revalidation tag invalidation on relevant write paths.
  - `features/catalog/actions/services.ts`
  - `features/catalog/actions/packages.ts`
  - `features/businesses/actions/business-settings.ts`
  - `features/catalog/actions/sale-event.ts`
- [x] Harden auth zod schema (non-empty password and proper register schema constraints).
  - `features/auth/schemas.ts`

## PR-5: Runtime Security and Request Protection

- [x] Tighten CSP and remove duplicate header injection path.
  - `lib/security/headers.ts`
  - `next.config.ts`
  - `proxy.ts`
- [x] Narrow proxy matcher and reduce unnecessary auth token work on public routes.
  - `proxy.ts`
- [x] Harden rate-limit behavior for sensitive paths and reduce fail-open risk.
  - `lib/rate-limit.ts`
  - `proxy.ts`
  - `app/api/paymongo/webhook/route.ts` (if endpoint-specific policy needed)

## PR-6: Booking Flow Efficiency and UX Maintainability

- [x] Remove duplicate pricing/availability compute path from booking create flow.
  - `features/bookings/actions/booking.ts`
  - `features/bookings/services/booking-persistence.ts`
- [x] Begin decomposition of oversized booking form module.
  - `components/bookings/BookingForm.tsx`
  - `components/bookings/*` (new extracted hooks/components)

## PR-7: Quality Gates and Test Depth

- [x] Add auth/tenant boundary tests for customer/service/employee/sale-event actions.
  - `features/*/actions/*.test.ts`
- [x] Add outbox concurrency and idempotency tests.
  - `app/api/cron/process-outbox/route.test.ts`
  - `lib/services/outbox.test.ts`
- [x] Add sale-event integration tests (owner-only, cross-tenant IDs rejected).
  - `features/catalog/actions/sale-event.test.ts` (new)
- [x] Raise coverage thresholds to production bar.
  - `vitest.config.ts`
- [x] Expand E2E beyond smoke paths.
  - `test/e2e/*.spec.ts`
  - `playwright.config.ts` (if parallel/test matrix adjustments required)

## Release Gate

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test:ci`
- [x] `npm run test:e2e` (requires `DIRECT_DATABASE_URL` for DB smoke)
- [x] `npm run build` (runs `prisma migrate deploy` before build)
- [x] `npm run verify:release`

## PR-N: Booking Editor + Phase 1 Schema (Wave A–D rollout)

Backing docs: `docs/role-permissions-matrix.md`, `docs/booking-editor-design.md`, `docs/phase1-migration-runbook.md`, `docs/help/booking-editor.md`.

### Schema migration safety

- [ ] `prisma migrate deploy` against production succeeds with zero data-loss steps.
  - All Phase 1 changes are additive: new `StaffPermission` enum values; new `BookingNote`, `BookingPriceAdjustment`, `SocialPostRequest` models; new nullable columns on `Booking` (`cancelled_at`, `cancelled_by_id`, `cancellation_reason`); back-relations on `User`, `SocialPost`, `Business`, `AvailedService`.
  - The QRPH→ONLINE rewrite of `20260425000000_remove_qrph_replace_online` is replay-safe inside a single transaction; no transaction-disable directive required.
- [ ] Permission backfill SQL from `docs/phase1-migration-runbook.md` §3 has been run against production.
  - `UPDATE "Employee" SET "permissions" = array_append("permissions", 'SOCIAL_POST_REQUEST_CREATE') WHERE NOT 'SOCIAL_POST_REQUEST_CREATE' = ANY ("permissions");`
  - Manager-only batch for `BOOKING_MODIFY` / `BOOKING_MARK_NO_SHOW` / `BOOKING_ADJUST_PRICE` / `BOOKING_CANCEL` / `SOCIAL_POST_REVIEW`.
  - Dedup pass to remove any duplicates introduced by re-runs.

### Feature-flag rollout

- [ ] `BOOKING_EDITOR_ENABLED=false` set in production env (default off).
- [ ] `BOOKING_EDITOR_PILOT_SLUGS` populated with the chosen pilot tenant slugs (CSV).
- [ ] First flip: turn `BOOKING_EDITOR_ENABLED=true` with a non-empty pilot list.
- [ ] Pilot tenants confirm key flows (Reschedule, Cancel, Adjust Price, Reassign, Add Note) work as expected.
- [ ] Wider rollout: clear `BOOKING_EDITOR_PILOT_SLUGS` so all tenants see it.

### Verification

- [ ] `lib/auth/permission-matrix.test.ts` — matrix table-driven test passes (new in Wave D).
- [ ] `features/bookings/services/booking-modify-policy.test.ts` + `features/bookings/actions/booking-modify.test.ts` pass (helper + action tests).
- [ ] Manual role walkthrough completed against staging following `docs/verification-plan.md` §3.
  - Owner / Manager / Cashier / Staff sign-in.
  - Each role sees the matrix-correct surface and triggers.
  - Audit trail entries appear after every modifying action.
- [ ] Customer notification spot-check after a Reschedule and a Cancel.

### Telemetry & observability

- [ ] Sentry breadcrumbs `booking.modified.*` appear after a sample test action.
- [ ] On-call alerting: a fired-action error rate >5% in any 1-hour window pages the on-call.

### Communication

- [ ] In-app announcement (per `docs/help/booking-editor-announcement.md`) is queued for the first owner login post-flip.
- [ ] `docs/help/booking-editor.md` is published to the help center.
- [ ] Internal release notes include the new permission flags and where to grant them.

### Rollback plan

- [ ] One-line env flip restores legacy behavior: set `BOOKING_EDITOR_ENABLED=false`.
- [ ] Schema rollback recipe documented (additive — `git revert` of schema + migration is sufficient; data tables are inert if unused).
- [ ] Runbook entry: which logs to grep, which Sentry tag (`booking.modified`) to filter, who to page.

## PR-N+1: Social Post Requests (Wave E + F rollout)

Backing docs: `docs/social-post-request-design.md`, `docs/social-post-request-implementation-plan.md`, `docs/help/social-post-requests.md`.

### Schema migration safety

- [ ] `SocialPostRequest` table + `SocialPostRequestStatus` enum from Phase 1 migration are present in production. (No additional migration needed — Phase 1 already covered this.)
- [ ] Verify the `social_post_id @unique` constraint on `SocialPostRequest` is enforced in production (one request → at most one SocialPost).

### Feature-flag rollout

- [ ] `SOCIAL_POST_REQUESTS_ENABLED=false` set in production env (default off).
- [ ] Parent flag `SOCIAL_PUBLISHING_ENABLED=true` and the business is in `SOCIAL_PUBLISHING_PILOT_SLUGS` (or pilot is empty). The request workflow falls back to false when the parent is off — verify both layers are aligned for the chosen pilot tenants.
- [ ] `SOCIAL_POST_REQUESTS_PILOT_SLUGS` populated with the chosen pilot tenant slugs (CSV).
- [ ] First flip: turn `SOCIAL_POST_REQUESTS_ENABLED=true` with a non-empty pilot list.
- [ ] Pilot tenants confirm submit / approve / reject / publish flows end-to-end including the close-the-loop notification.
- [ ] Wider rollout: clear `SOCIAL_POST_REQUESTS_PILOT_SLUGS` so all tenants on `SOCIAL_PUBLISHING_ENABLED` see it.

### Verification

- [ ] `features/social/actions/social-post-requests.test.ts` — 24 backend cases pass (action permissions, rate limits, dedup, state machine).
- [ ] `components/dashboard/social-posts/viewer-context.test.ts` — 6 cases for `deriveSocialViewerContext`.
- [ ] `features/social/social-post-requests.test.ts` — 4 cases for the feature flag with parent fallback.
- [ ] Manual role walkthrough: staff submits, manager approves, owner publishes, staff sees close-the-loop notification with permalink.
- [ ] Rate-limit smoke: rapid double-submit triggers `RATE_LIMITED_USER` toast.
- [ ] Duplicate-detection smoke: submitting the same topic+category twice in 14 days surfaces the `duplicateWarning`.

### Telemetry & observability

- [ ] Sentry breadcrumbs `social.post_request.*` appear after a sample submission and approval.
- [ ] Approve events with `aiInvoked: true` are visible in the cost-attribution dashboard (or queued for it — the field exists; the dashboard panel can come later).
- [ ] On-call alert: error rate >5% for `social.post_request.approved` over a 1-hour window pages the on-call.

### Communication

- [ ] In-app announcement (per `docs/help/social-post-requests-announcement.md`) is queued for the first owner login post-flip.
- [ ] Manager toast and staff toast also queued for their respective first sessions post-flip.
- [ ] `docs/help/social-post-requests.md` is published to the help center.
- [ ] Internal release notes mention the rate limits, duplicate detection, and the new permission flags (`SOCIAL_POST_REQUEST_CREATE`, `SOCIAL_POST_REVIEW`, `SOCIAL_POST_PUBLISH`).

### Rollback plan

- [ ] One-line env flip restores legacy behavior: set `SOCIAL_POST_REQUESTS_ENABLED=false`. Owners keep the direct-create flow; staff stop seeing the dialog. The `SocialPostRequest` table stays — existing rows are inert under a flag-off state.
- [ ] Schema rollback: not applicable. The model is additive and the rest of the system doesn't reference it.
- [ ] If the close-the-loop notification spams: the `SOCIAL_POST_REQUEST_PUBLISHED` outbox handler can be feature-flag-gated independently in a follow-up; it's currently always-on inside `recomputePostStatus` when `source_request` is set.
