# Role-Based Permissions Matrix

**Status:** Design / source of truth for the booking-edit and social-post-request features.
**Scope:** Both features must use the same role + permission model so behavior is predictable across the dashboard.

This document defines, in one place, who can do what — for **booking modification** and **social post requests** — across every actor that exists in the system today.

## 1. Real role identifiers (no inventions)

The schema already gives us three layers we have to compose. Use these exact identifiers everywhere:

| Layer            | Source                                 | Values                                                                                                                                             |
| ---------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top-level role   | `Role` enum (`prisma/schema.prisma`)   | `OWNER`, `EMPLOYEE`, `PLATFORM_ADMIN`                                                                                                              |
| Staff profile    | `StaffProfile` (employees only)        | `STAFF`, `MANAGER`, `CASHIER`                                                                                                                      |
| Permission flags | `StaffPermission` (per employee)       | `BOOKING_CREATE`, `PAYMENT_COLLECT`, `QUEUE_CLAIM_SELF`, `QUEUE_SERVE_SELF`, `QUEUE_OVERRIDE_ALL`, `CATALOG_MANAGE`                                |
| Business policy  | `Business` flags + `BusinessStructure` | `allow_employee_self_booking`, `manager_can_serve`; structure is `OWNER_EMPLOYEE_SELF_SERVICE` / `MANAGER_LED` / `CASHIER_LED` / `MANAGER_CASHIER` |

Resolution helper: `resolveTenantActorContext()` in `lib/auth/staff-access.ts` already returns the composed `TenantActorContext` for any signed-in user. **Use it; do not re-derive role state.**

`PLATFORM_ADMIN` is out of scope for both features — those users operate platform-wide tooling, not tenant flows.

## 2. New permissions to add

`PAYMENT_COLLECT` is a regular `STAFF` default. It records received booking balances only; manual GCash deposit verification remains owner-only.

The current `StaffPermission` enum doesn't cover the actions these features need. Add the following values to the enum and to `DEFAULT_PERMISSIONS_BY_PROFILE` (`lib/auth/staff-access.ts`). A migration is required.

| New permission               | Purpose                                                       | Default for STAFF | Default for MANAGER | Default for CASHIER |
| ---------------------------- | ------------------------------------------------------------- | ----------------- | ------------------- | ------------------- |
| `BOOKING_MODIFY`             | Add/remove services, change time/staff on an existing booking | yes               | yes                 | no                  |
| `BOOKING_MARK_NO_SHOW`       | Flag a customer as no-show                                    | yes               | yes                 | no                  |
| `BOOKING_ADJUST_PRICE`       | Apply manual discount or override final price                 | yes               | yes                 | no                  |
| `BOOKING_CANCEL`             | Cancel a booking (soft, recoverable)                          | yes               | yes                 | no                  |
| `SOCIAL_POST_REQUEST_CREATE` | Submit a custom-post request to the owner                     | yes               | yes                 | yes                 |
| `SOCIAL_POST_REVIEW`         | Approve, reject, or edit a request before it becomes a draft  | no                | yes                 | no                  |
| `SOCIAL_POST_PUBLISH`        | Take a draft and publish it                                   | no                | no                  | no                  |

Notes:

- `BOOKING_MODIFY` replaces ad-hoc reuse of `BOOKING_CREATE` for add-on services. Existing call sites in `addBookingServiceOrCreateFollowUpAction` should accept either while we migrate, then drop `BOOKING_CREATE` for that branch.
- `SOCIAL_POST_PUBLISH` defaults off for everyone. Owners get it implicitly via the `actorType === "OWNER"` short-circuit in `hasStaffPermission`. Granting it to a manager is an explicit per-employee opt-in.
- Permanent **deletion** of a booking remains owner-only and is intentionally not a permission flag — destructive ops shouldn't be delegated through the same matrix.

## 3. Booking modification — full matrix

Columns are exact actions reachable from the booking detail panel. Each cell is the gate that must be true. `OWNER` always gets every action (handled by `hasStaffPermission`'s owner short-circuit).

| Action                        | OWNER | MANAGER                | CASHIER                         | STAFF                      | Customer-visible side effect |
| ----------------------------- | ----- | ---------------------- | ------------------------------- | -------------------------- | ---------------------------- |
| View booking detail           | ✓     | ✓                      | ✓                               | ✓ (own claimed only)       | none                         |
| Add service to booking        | ✓     | `BOOKING_MODIFY`       | `BOOKING_MODIFY` (opt-in)       | ✗                          | price + ETA email/SMS        |
| Remove service from booking   | ✓     | `BOOKING_MODIFY`       | ✗                               | ✗                          | price + ETA email/SMS        |
| Change scheduled time         | ✓     | `BOOKING_MODIFY`       | ✗                               | ✗                          | reschedule notification      |
| Reassign staff                | ✓     | `QUEUE_OVERRIDE_ALL`   | ✗                               | ✗                          | none (internal)              |
| Apply discount / adjust price | ✓     | `BOOKING_ADJUST_PRICE` | `BOOKING_ADJUST_PRICE` (opt-in) | ✗                          | updated receipt              |
| Mark as paid                  | ✓     | `PAYMENT_COLLECT`      | `PAYMENT_COLLECT`               | `PAYMENT_COLLECT` (opt-in) | receipt                      |
| Mark as no-show               | ✓     | `BOOKING_MARK_NO_SHOW` | ✗                               | ✗                          | none                         |
| Cancel booking                | ✓     | `BOOKING_CANCEL`       | ✗                               | ✗                          | cancellation email/SMS       |
| Add internal note             | ✓     | ✓                      | ✓                               | ✓                          | none                         |
| Permanently delete            | ✓     | ✗                      | ✗                               | ✗                          | none                         |
| View audit log                | ✓     | ✓                      | ✗                               | ✗                          | none                         |

Business-policy modifiers (already present in `hasStaffPermission`):

- `allow_employee_self_booking = false` blocks `BOOKING_CREATE` and `BOOKING_MODIFY` for `STAFF`.
- `manager_can_serve = false` blocks managers from `QUEUE_CLAIM_SELF` / `QUEUE_SERVE_SELF`. It does **not** block `BOOKING_MODIFY` — managing bookings is a separate axis from serving them.

## 4. Social post request — full matrix

A new lifecycle is introduced: `REQUEST` → `DRAFT` (existing `SocialPost`) → `READY` → `PUBLISHING` → `PUBLISHED` / `FAILED`. The request stage is a new model (see `social-post-request-design.md`); everything from `DRAFT` onward reuses the existing `SocialPost` pipeline and `createOrganicSocialPostAction`.

| Action                             | OWNER | MANAGER                        | CASHIER                      | STAFF                        |
| ---------------------------------- | ----- | ------------------------------ | ---------------------------- | ---------------------------- |
| View own submitted requests        | ✓     | ✓                              | ✓                            | ✓                            |
| View all requests for the business | ✓     | `SOCIAL_POST_REVIEW`           | ✗                            | ✗                            |
| Submit a request (topic + brief)   | ✓     | `SOCIAL_POST_REQUEST_CREATE`   | `SOCIAL_POST_REQUEST_CREATE` | `SOCIAL_POST_REQUEST_CREATE` |
| Edit own pending request           | ✓     | ✓                              | ✓                            | ✓                            |
| Cancel own pending request         | ✓     | ✓                              | ✓                            | ✓                            |
| Approve / reject a request         | ✓     | `SOCIAL_POST_REVIEW`           | ✗                            | ✗                            |
| Convert request → SocialPost draft | ✓     | `SOCIAL_POST_REVIEW`           | ✗                            | ✗                            |
| Edit caption / media on draft      | ✓     | `SOCIAL_POST_REVIEW`           | ✗                            | ✗                            |
| Publish draft                      | ✓     | `SOCIAL_POST_PUBLISH` (opt-in) | ✗                            | ✗                            |
| View published-post analytics      | ✓     | ✓                              | ✗                            | ✗                            |

Important behaviors:

- The current `social-posts/page.tsx` `OWNER`-only redirect (line 27) is removed and replaced with a permission-aware view that adapts: requesters see a "My Requests" tab, reviewers see the full inbox, owners see everything plus the existing draft/scheduling UI.
- Owners may still create posts directly without a request — the legacy `CreateOrganicPostDialog` flow stays.
- Customers and unauthenticated users see nothing related to this feature, ever.

## 5. Action gating cheatsheet (server-side)

Every action handler must call one of these from `lib/auth/staff-access.ts`:

```ts
// 1. Bare gate — pass when actor has the flag (or is an OWNER).
hasStaffPermission(context, StaffPermission.BOOKING_MODIFY);

// 2. Server-action wrapper — short-circuits with an error if not allowed.
const guard = await requireStaffPermission(
  slug,
  StaffPermission.BOOKING_MODIFY,
  { write: true },
);
if (!guard.success) return { error: guard.error };
```

Owner-only destructive ops (delete booking, revoke social connection) should keep using `requireOwnerTenantWriteAccess()` directly — they're not permissioned, they're role-locked.

## 6. UI gating cheatsheet (client-side)

Client components must never make permission decisions from raw role/profile strings. Always go through `deriveViewerContext()` (already exists in `components/bookings/BookingQuickPanel.tsx`) and any analogous helpers we add for social. The pattern:

```ts
const viewerContext = deriveViewerContext({
  role: actor.role,
  staffProfile: actor.profile,
  permissions: actor.permissions,
});

<BookingQuickPanel viewerContext={viewerContext} ... />
```

For social, a parallel helper `deriveSocialViewerContext()` will live next to the social UI. Same shape: a small object of booleans (`canSubmitRequest`, `canReviewRequests`, `canPublish`, ...). Detail in the social design doc.

## 7. Audit and notification rules

Any cell in the matrices above that reads, in plain English, "modifies state" must:

1. Write an `AuditLog` entry through `logAudit()` inside the same transaction. `actor_id` is the user, `actor_type` is `"USER"`, `entity_type` is `"Booking"` or `"SocialPostRequest"` / `"SocialPost"`, `changes` carries `{ before, after }` for the affected fields.
2. Emit an outbox event (`OutboxMessage`) for downstream notifications. Add the missing event types: `BOOKING_SERVICE_ADDED`, `BOOKING_SERVICE_REMOVED`, `BOOKING_RESCHEDULED`, `BOOKING_PRICE_ADJUSTED`, `BOOKING_NO_SHOW`, `SOCIAL_POST_REQUEST_SUBMITTED`, `SOCIAL_POST_REQUEST_APPROVED`, `SOCIAL_POST_REQUEST_REJECTED`.
3. Decide notification recipient based on the action's "Customer-visible side effect" column above. Internal-only actions don't email/SMS the customer.

This closes today's gap where status changes silently bypass the audit log and customers are never told their booking changed.

## 8. Open decisions for the team

These are the only matrix questions I deliberately left for the team to confirm before we ship migrations.

1. Should `CASHIER` be allowed `BOOKING_MODIFY` by default, or only via per-employee opt-in? (Today's draft: opt-in only.)
2. Should `MANAGER` get `SOCIAL_POST_PUBLISH` by default, or stay opt-in? (Today's draft: opt-in only — keeps publishing under owner control unless explicitly delegated.)
3. Should `STAFF` see all bookings of customers they've served before, or only the bookings currently assigned to them? (Today's draft: only currently claimed.)

Decisions go in this doc once made.
