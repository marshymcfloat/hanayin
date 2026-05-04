# Roadmap

**Status:** Living roadmap. Single source of truth for remaining work on
the booking-editor and social-post-request tracks plus housekeeping
items we noticed along the way.

**Companion docs (the "what" and "why"):**
- `role-permissions-matrix.md`
- `role-aware-ui-primitives.md`
- `booking-editor-design.md` and `booking-editor-implementation-plan.md`
- `social-post-request-design.md` and `social-post-request-implementation-plan.md`
- `verification-plan.md`
- `phase1-migration-runbook.md`

This doc is the **"when"** — items grouped into delivery waves so each
wave is independently shippable and verifiable.

## What's already in `main`

- Phase 0 cross-cutting primitives (`useViewer`, `<PermissionGate>`, `<RoleBadge>`, `<AuditTrail>`, `permission-toasts`, `BookingQuickPanel`, layout provider).
- Phase 1 schema migration (7 new `StaffPermission` flags; `BookingNote`, `BookingPriceAdjustment`, `SocialPostRequest` models; `Booking` soft-cancel fields; permission defaults extended).
- Owner `BookingList` rewire and Manager `Today's bookings` dialog — both routed through `BookingQuickPanel` with role-aware viewer context.
- Phase 2 backend (partial): `removeBookingServiceAction`, `BOOKING_SERVICE_REMOVED` outbox event, add-on action gate widened to accept `BOOKING_MODIFY` alongside `BOOKING_CREATE`.

## Wave A — small visible wins (close the Phase 2 loop)

Goal: validate that the recently-shipped Phase 2 backend actually surfaces in the UI, and finish the cheap items left behind by earlier waves.

| # | Item | Effort | Dependency |
| - | ---- | ------ | ---------- |
| A1 | Remove button on each service line in `BookingDetailsDialog`, gated by `viewerContext.canAddService` | XS | Phase 2 backend (in main) |
| A2 | Switch `markBookingNoShowAction` from owner-only to `BOOKING_MARK_NO_SHOW` | XS | Phase 1 schema (in main) |
| A3 | Surface `<AuditTrail>` inside the booking panel for owner + manager | S | Phase 0 primitive (in main) |

Ship together as one PR titled "Wave A: close Phase 2 loop". Manual smoke as owner and as manager.

## Wave B — booking actions backend + dialogs

Goal: every modifying action in `booking-editor-design.md §4` exists as a server action with audit + outbox, and has a minimal dialog that opens from the panel.

| # | Item | Effort | Notes |
| - | ---- | ------ | ----- |
| B1 | Refactor `lib/services/booking-addons.ts` so the append helper accepts an external transaction client; build `swapBookingServiceAction` on top | M | Unblocks any future action that wants to share a tx with add-on logic |
| B2 | `rescheduleBookingAction` + `RescheduleDialog`. Recomputes `estimated_end`, fires `BOOKING_RESCHEDULED` outbox, customer SMS via existing reminder pipeline | M | |
| B3 | `reassignBookingStaffAction` + `ReassignStaffDialog`. Permission: `QUEUE_OVERRIDE_ALL`. Reuses queue-claim validation | S | |
| B4 | `adjustBookingPriceAction` + `AdjustPriceDialog`. Writes to `BookingPriceAdjustment`. Reason required and shown in audit + (eventual) receipt | M | Schema in main |
| B5 | `cancelBookingAction` (soft) + `CancelBookingDialog`. Uses `Booking.cancelled_at` / `cancelled_by_id` / `cancellation_reason`. Recoverable for 24h. Customer cancel SMS | M | Schema in main |
| B6 | `addBookingNoteAction` + inline `AddNoteForm` in panel. Visibility: `INTERNAL` or `CUSTOMER_VISIBLE` | S | Schema in main |
| B7 | New outbox event types and delivery handlers for the above (`BOOKING_RESCHEDULED`, `BOOKING_STAFF_REASSIGNED`, `BOOKING_PRICE_ADJUSTED`, `BOOKING_NO_SHOW`, `BOOKING_NOTE_ADDED`) | S | Per action; can ship piecewise |

Each item ships as its own PR with happy path + permission denial + state-machine guard tests.

## Wave C — surface coverage

Goal: every staff role that has bookings to do can find them and act on them.

| # | Item | Effort |
| - | ---- | ------ |
| C1 | New `CashierDashboard` surface, routed when `StaffProfile = CASHIER` and structure is cashier-aware. Today's bookings + payment column + single-tap "Record payment" focus | M |
| C2 | "My bookings" section in `EmployeeDashboard` — bookings where the user is `served_by_id` on at least one `AvailedService`. Read-mostly via panel | S |
| C3 | Customer profile page — booking history opens via `BookingQuickPanel` | S |
| C4 | Calendar / queue surfaces (`OwnerServiceQueue`, `ManagerQueueBoard`) — clicking a row opens the panel | S |
| C5 | Notification deep-link — booking-related notifications route to `bookings?open=<id>` and the page auto-opens the panel | S |
| C6 | Mobile bottom-sheet variant of `BookingDetailsDialog` on `sm:` viewports + sticky two-action bar per role | S |
| C7 | Per-employee permission admin UI (`EditPermissionsDialog`) on the employees page; backed by `setEmployeePermissionsAction` | M |

## Wave D — booking-editor verification + rollout

| # | Item | Effort |
| - | ---- | ------ |
| D1 | Feature flag `BOOKING_EDITOR_ENABLED` + per-business pilot list helper | XS |
| D2 | Permission-matrix table-driven test (Vitest, single source of truth) | M |
| D3 | Playwright `tests/e2e/booking-editor.spec.ts` — owner / manager / cashier / staff walkthrough | M |
| D4 | Telemetry events `booking.modified.{action}` with `{businessId, actorRole, durationMs}` and dashboard panels | S |
| D5 | Production permission backfill SQL (already documented in `phase1-migration-runbook.md` §3) — execute alongside `migrate deploy` in prod | XS |
| D6 | In-app announcement when flag flips on for a tenant + help-center article with the matrix table + per-role screenshots | S |
| D7 | Production-readiness checklist additions in `production-hardening-checklist.md` | XS |

## Wave H — Social-post creation quality fixes (prerequisite for Wave E)

Reported by the owner during pilot use of the existing `CreateOrganicPostDialog`. The current organic-post creation pipeline produces low-quality output that ignores the user's customizations: a TIPS_EDUCATION post about "skin tag" generated a generic "Bookings open today" caption and a stock spa-towel image. Root causes are documented in this section's tasks; full diagnostic in conversation history.

These should ship **before** Wave E. The social-post-request track in Wave E ultimately calls `createOrganicSocialPostAction` to convert an approved request into a draft, so anything we ship there inherits the same quality bugs unless H lands first.

| # | Item | Effort | Notes |
| - | ---- | ------ | ----- |
| H1 | Fix `<SelectItem value="">` empty-string error on "Tune further" | XS | Blocker — Radix Select throws on render. Three offending rows in `CreateOrganicPostDialog.tsx`. Swap to a non-empty sentinel like `"AUTO"`, translate back to `undefined` before sending to the action. |
| H2 | Category-aware rescue captions in `buildRescueCaptionDraft` | S | Current rescue is sale-promo boilerplate ("Bookings open today", "preferred times fill up first") regardless of category. Add per-category rescue templates so a TIPS_EDUCATION fallback leads with the tip, not a booking pitch. |
| H3 | Split organic caption pipeline from `generateSocialCaptionDraft` | M | Today `generateOrganicCaptionDraft` adapts to the sale-event generator with `actionCategory: "SOCIAL_ONLY"`, `saleTitle = topic`, fake date window, and dumps category instructions into `saleDescription`. Build a dedicated `buildOrganicGeminiPrompt` that frames the model around `(category, topic, captionTone)` directly. Tip-specific template: "lead with the tip in 1-2 lines, then 2-3 supporting bullets, then ONE soft business tie-back." |
| H4 | `WARM_EDITORIAL` profile bypasses category subject for organic posts | S | `buildOrganicImagePrompt` line 634-637 routes `WARM_EDITORIAL` to `pickRandom(PROFILE_BLUEPRINTS.WARM_EDITORIAL.subjects)` and skips `ORGANIC_CATEGORY_SUBJECT[category]`. For organic posts with a non-GENERAL category, category subject should win. |
| H5 | Inject topic into image-prompt subject more strongly | S | Currently topic only appears in `contextLine`. For TIPS_EDUCATION, add the topic into the subject ("flat-lay of items related to {topic}") so the model has a concrete visual hook. |
| H6 | Optional text-overlay rendering for educational posts | M | Owner-toggle in the dialog; default ON for TIPS_EDUCATION. Headline derived from topic + first sentence of caption. Reuse the existing image composer if one is in `lib/services/social/`; otherwise add a simple canvas pass. |
| H7 | Vitest snapshot tests pinning rescue output per category | S | Lock the rescue copy in code so a future regression shows up in code review. One snapshot per `OrganicPostCategory`. |
| H8 | Surface "Gemini key missing" warning to the owner | XS | Today the action silently falls back to the rescue when `GEMINI_KEY` is unset. Owner has no idea their AI isn't running. Add a one-time dialog warning when the server reports the key is missing. |

Effort total: ~3-4 days for all of H. **H1 is a hard blocker** on anyone touching the Tune further section and should ship as its own quick fix even before the rest of H. H2-H8 ship together as one PR so the rescue rewrite, prompt rewrite, and image fixes test against each other.

## Wave E — social-post-request track (currently zero code)

Owner-side custom-post creation already works via the existing `createOrganicSocialPostAction`. This wave adds the **request → review → approve** workflow that's currently missing.

| # | Item | Effort |
| - | ---- | ------ |
| E1 | `lib/server actions/social-post-requests.ts` with the six actions per `social-post-request-design.md §4` | M |
| E2 | `createOrganicSocialPostAction` accepts optional `sourceRequestId` to atomically link a converted request to its `SocialPost` | XS |
| E3 | New outbox event types: `SOCIAL_POST_REQUEST_SUBMITTED` / `_APPROVED` / `_REJECTED` / `_PUBLISHED` + delivery handlers | S |
| E4 | `<SuggestPostDialog>` — staff-facing form (topic, brief, category, tone, attachment, due date) | M |
| E5 | `deriveSocialViewerContext` — parallel to `deriveBookingViewerContext`, returns the social-feature flags | XS |
| E6 | Replace `OWNER`-only fork in `app/(private)/app/[businessSlug]/social-posts/page.tsx` with permission-aware tree | M |
| E7 | `<RequestsInbox>` reviewer surface using shared `<WorkflowApprovalCard>`. Three tabs (Pending / Approved / Rejected) | M |
| E8 | `/app/[slug]/social-posts/my-requests` page for requesters; edit + cancel while `PENDING` | S |
| E9 | "Edit then approve" flow — pre-fills the existing `CreateOrganicPostDialog` from the request | S |
| E10 | Rate limit (1/min/user, 50/day/business) + duplicate detection (same topic+category in last 14 days) | S |
| E11 | Close-the-loop notification when the linked `SocialPost` reaches `PUBLISHED` | XS |
| E12 | Feature flag `SOCIAL_POST_REQUESTS_ENABLED` + pilot list, falls back to false when `SOCIAL_PUBLISHING_ENABLED` is off | XS |

## Wave F — social-post-request verification + rollout

| # | Item | Effort |
| - | ---- | ------ |
| F1 | Playwright `tests/e2e/social-post-request.spec.ts` — manager submits, owner approves, requester gets close-the-loop | M |
| F2 | Telemetry: `social.post_request.{action}` with `{businessId, actorRole, durationMs}`. Dashboard panel for daily counts and AI-cost attribution | S |
| F3 | In-app announcement + help-center article | S |
| F4 | Production-readiness checklist additions | XS |

## Wave G — pre-existing housekeeping (separate PRs, not blockers)

| # | Item | Effort | Notes |
| - | ---- | ------ | ----- |
| G1 | CRLF/LF line-ending normalization | S | `.gitattributes` with `* text=auto eol=lf`, then `git add --renormalize .`. Will produce a one-time noisy commit; do it on a quiet day |
| G2 | Fix `components/bookings/CustomerPicker.tsx:120` `react-hooks/set-state-in-effect` lint error | XS | Same anti-pattern as `AuditTrail.tsx`; same fix (key-based remount or move reset out of effect) |
| G3 | Stabilize `lib/services/growth/offer-generator.test.ts` flaky title assertions | S | Pre-existing; depends on seed/AI-mock state |
| G4 | Document the QRPH-style enum-add-then-use anti-pattern in `phase1-migration-runbook.md` §6 so future migrations use the `CREATE TYPE _new` → `USING` cast pattern instead of relying on the transaction-disable directive | XS | |

## Effort legend

- XS: under 30 minutes
- S: under 2 hours
- M: under a day
- L: more than a day (none in current scope — break it down)

## Sequencing rules

- Phase 0 + Phase 1 schema must stay in `main` before any wave starts (already there).
- Wave A is the prerequisite for taking Phase 2 user-visible.
- Wave B items are independent of each other; ship in any order, but each must finish its tests before it counts as done.
- Wave C surfaces can ship in parallel with Wave B once Wave A is in.
- Wave D and Wave F are pre-rollout gates — flags off until verification passes.
- Wave E (social-post-request) is independent of waves A–D and can run in parallel with one engineer per track.
- Wave G is opportunistic; pick up between waves to keep tech-debt manageable.

## Status updates

Update this file as part of every PR — bump the wave's row to checked, link to the merged commit, note any deferrals discovered during implementation. Treat it like a changelog for the two-track effort.
