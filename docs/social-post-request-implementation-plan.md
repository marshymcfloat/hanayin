# Social Post Request — Implementation Plan

**Status:** Implementation roadmap.
**Companion docs:** `role-permissions-matrix.md`, `role-aware-ui-primitives.md`, `social-post-request-design.md`.

This feature ships in five phases behind the existing `SOCIAL_PUBLISHING_ENABLED` flag plus a new sub-flag for the request workflow. Phase 0 from `booking-editor-implementation-plan.md` (cross-cutting primitives) is a hard prerequisite; this plan assumes those primitives are in place.

## Feature flag

```ts
// features/social/social-post-requests.ts (new)
export function isSocialPostRequestsEnabledForBusiness(slug: string): boolean;
```

Backed by `SOCIAL_POST_REQUESTS_ENABLED` (boolean) + `SOCIAL_POST_REQUESTS_PILOT_SLUGS` (CSV). Falls back to `false` when `SOCIAL_PUBLISHING_ENABLED` is also false. The owner-direct flow (`CreateOrganicPostDialog`) is *not* gated by this flag — only the new request surface is.

---

## Phase 1 — Schema, permissions, server actions (2–3 days)

### Schema

```prisma
enum StaffPermission {
  // ... existing + booking-editor additions
  SOCIAL_POST_REQUEST_CREATE   // new
  SOCIAL_POST_REVIEW           // new
  SOCIAL_POST_PUBLISH          // new
}

enum SocialPostRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}

model SocialPostRequest { ... }   // see social-post-request-design.md §3
```

Migration: `prisma/migrations/<ts>_social_post_requests/migration.sql`. Backfill: existing managers/staff/cashier records get `SOCIAL_POST_REQUEST_CREATE` automatically; managers additionally get `SOCIAL_POST_REVIEW`. `SOCIAL_POST_PUBLISH` defaults off for everyone (owners get it implicitly).

### Server actions

| File                                                   | Action                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `lib/auth/staff-access.ts`                             | edit — extend `DEFAULT_PERMISSIONS_BY_PROFILE` with the three new flags |
| `features/social/actions/social-post-requests.ts`           | new — six actions per design §4                                        |
| `features/social/actions/social-post-requests.test.ts`      | new — table-driven permission matrix + state transitions               |
| `features/social/actions/social.ts`                         | edit — `createOrganicSocialPostAction` accepts an optional `sourceRequestId` so we can wire the request → SocialPost link in one transaction |
| `lib/services/social/post-request.ts`                  | new — pure helpers: validation, duplicate detection, rate-limit checks |

### Outbox

| File                                | Action                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `lib/services/outbox.ts`            | edit — register `SOCIAL_POST_REQUEST_SUBMITTED`, `_APPROVED`, `_REJECTED`, `_PUBLISHED` event types |
| `lib/services/outbox-delivery.ts`   | edit — handlers that fire in-app notifications for each event                                     |

Acceptance: actions return correct results across every (role × permission) combination in the matrix. Tests green. No UI yet; all calls verified through unit tests and a quick scripted smoke.

---

## Phase 2 — Submission UI (`<SuggestPostDialog>`) (2 days)

### Components

| File                                                            | Action                                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `components/dashboard/social-posts/SuggestPostDialog.tsx`       | new — form per design §5 (topic, brief, category, tone, attachment, due date)           |
| `components/dashboard/social-posts/viewer-context.ts`           | new — `deriveSocialViewerContext` per `role-aware-ui-primitives.md` §4                  |
| `components/dashboard/social-posts/AttachmentUploader.tsx`      | new — wraps the existing upload-token endpoint; max 8MB image                            |
| `components/dashboard/layout/Sidebar.tsx` (or wherever nav lives)| edit — add "Suggest a post" item gated by `<PermissionGate require="SOCIAL_POST_REQUEST_CREATE">` |

### Test

| File                                                                 | Action                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| `components/dashboard/social-posts/SuggestPostDialog.test.tsx`       | new — happy path, validation errors, attachment flow    |

Acceptance: any role with `SOCIAL_POST_REQUEST_CREATE` can submit a request from the dashboard nav. Submissions land in the DB and fire the outbox event. Owners see a fresh notification.

---

## Phase 3 — Reviewer inbox + permission-aware page (2–3 days)

The big one: replace the OWNER-only fork in `app/(private)/app/[businessSlug]/social-posts/page.tsx` with a viewer-aware tree.

### Page restructure

| File                                                                             | Action                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(private)/app/[businessSlug]/social-posts/page.tsx`                         | edit — remove the `role !== "OWNER"` redirect, fetch `socialPostRequests` for the business, hand both to client                                         |
| `components/dashboard/owner/social-posts/SocialPostsPageClient.tsx`              | edit — accept new `pendingRequests`, `viewerContext` props; render `<RequestsInbox>` above the existing post list when the viewer can review            |
| `components/dashboard/social-posts/RequestsInbox.tsx`                            | new — three tabs (Pending / Approved / Rejected), uses `<WorkflowApprovalCard>` rows                                                                    |
| `components/dashboard/social-posts/MyRequestsPage.tsx`                           | new — used at `/social-posts/my-requests` (next route below)                                                                                            |
| `app/(private)/app/[businessSlug]/social-posts/my-requests/page.tsx`             | new — server page for requesters' own list                                                                                                              |

### Approval flow plumbing

| File                                                                | Action                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `components/dashboard/social-posts/ApproveRequestButton.tsx`        | new — calls `approveSocialPostRequestAction`, on success navigates the owner straight into the existing draft editor   |
| `components/dashboard/social-posts/RejectRequestDialog.tsx`         | new — required textarea for reason, calls `rejectSocialPostRequestAction`                                              |
| `components/dashboard/owner/social-posts/CreateOrganicPostDialog.tsx` | edit — accept optional `prefillFromRequest` so the "Edit then approve" path opens the existing dialog with values prefilled |

### Empty / upsell state

When the viewer has none of `SOCIAL_POST_REQUEST_CREATE`, `SOCIAL_POST_REVIEW`, `SOCIAL_POST_PUBLISH`, render a small explainer card instead of the existing "Only owners…" message — invites them to ask their owner for permission.

Acceptance: a manager with `SOCIAL_POST_REVIEW` lands on the page and sees the inbox + read-only draft list. A staff member with only `SOCIAL_POST_REQUEST_CREATE` lands and sees only "My requests" + a "Suggest a post" button. The owner sees the unified view.

---

## Phase 4 — Approve → AI handoff → publish loop (1–2 days)

This phase is small because most of it already exists; we're stitching pieces.

| File                                                | Action                                                                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/social/actions/social-post-requests.ts`        | edit — `approveSocialPostRequestAction` calls `createOrganicSocialPostAction` with the field mapping in design §7, atomically links `social_post_id` on the request, and writes both audit entries in one tx |
| `lib/services/social/post-request.ts`               | edit — helper `mapRequestToOrganicInput(request) → OrganicPostInput`                                                                                                                                          |
| `lib/services/outbox-delivery.ts`                   | edit — when a `SocialPost` transitions to `PUBLISHED` and has a linked `SocialPostRequest`, fire `SOCIAL_POST_REQUEST_PUBLISHED` to the requester                                                              |
| `components/dashboard/social-posts/RequestStatusBadge.tsx` | new — pill colored by status, used in inbox and "My requests"                                                                                                                                                  |

Acceptance: approving a request creates a draft `SocialPost`; publishing the draft notifies the requester with the public Meta permalink.

---

## Phase 5 — Polish, rate limits, edge cases (1–2 days)

| File                                                | Action                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `lib/services/social/post-request.ts`               | edit — duplicate-detection (same topic + category in last 14 days) and rate limits (1/min/user, 50/day/business). Returns typed error codes the dialog can show inline. |
| `components/dashboard/social-posts/SuggestPostDialog.tsx` | edit — handle the new error codes with friendly inline messages                  |
| `app/api/social/...`                                | optional — if we add a public POST endpoint for in-app webhooks; v1 is server-action-only |

### Verification gate

- Unit + integration tests cover the full state machine (PENDING → APPROVED, → REJECTED, → CANCELLED; APPROVED-after-Cancel rejected).
- Vitest table-driven test runs every (role × permission × action) tuple from the matrix and asserts allow/deny.
- Playwright smoke: log in as a manager, submit a request; log in as an owner, approve it, confirm a `SocialPost` exists; flip to PUBLISHED via the existing flow and confirm the requester gets the published-loop notification.
- Manual role walkthrough script.
- Production checklist: rate-limit telemetry, dedup metric (% of submissions flagged duplicate), AI-cost attribution per request, error states, accessibility, mobile.
- Rollback: env-var flip restores the page to its previous OWNER-only behavior; the data tables remain (no destructive migration).

---

## Risks and mitigations

- **AI cost spike** — staff submitting many low-quality requests could fan out to expensive AI calls on approval. Mitigation: AI runs only on owner approval, never on request submission; rate limit and dedup on the request side; owner sees a per-request cost preview before approving (v2).
- **Inbox noise for owners** — owners get an event for every submission. Mitigation: in-app notifications batch hourly; email digest mode opt-in; rejected requests don't auto-reappear.
- **Permission-fatigue UI** — three new flags is a lot. Mitigation: the per-employee permissions dialog (booking editor phase 4) groups flags into "Booking", "Payment", "Social" sections; default behavior matches the matrix so most owners never have to touch it.
- **Hidden OWNER-only assumption** — other code paths (analytics, billing) might still assume only owners touch `SocialPost`. Mitigation: grep audit during phase 3 for `role === "OWNER"` near social code paths and convert them to permission checks.

---

## Sequencing summary

```
(Booking-editor Phase 0 primitives)
  └─► Phase 1 (schema + actions + outbox)
        └─► Phase 2 (submission UI)
              └─► Phase 3 (reviewer inbox + page restructure)
                    └─► Phase 4 (approve → AI → publish loop)
                          └─► Phase 5 (polish + verification gate, ship)
```

Estimated total: ~8–11 working days. Phases 1–2 can run in parallel with the booking editor's Phases 1–2 once primitives land.
