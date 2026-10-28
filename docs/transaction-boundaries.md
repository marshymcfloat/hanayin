# Transaction Boundaries

Last inventoried: 2026-09-18

A transaction boundary represents one business outcome. All database state that
must agree about that outcome belongs in the same Prisma transaction. Network
calls never belong inside a database transaction.

## Required Rules

- Use a transaction for two or more dependent writes, unguarded read-check-write races,
  state transitions, counters/balances, claim operations, and writes coupled to
  audit or outbox records.
- Scope the initial read and conditional update by verified tenant identity.
- Prefer conditional `updateMany` plus affected-row checks for claims and
  compare-and-set transitions.
- Create audit and outbox rows in the same transaction as the aggregate change.
- Commit before email, SMS, social, AI, storage, or other network calls.
- Make post-commit delivery idempotent with a dedupe key or provider reference.
- Keep transactions bounded; do not render, hash passwords, generate images, or
  wait on providers while holding database locks.

## Workflow Inventory

| Workflow | Atomic unit | Current owner | Boundary requirement |
| --- | --- | --- | --- |
| Booking create/modify/cancel/self-serve | Booking, service lines, vouchers, totals, audit, notification event | `features/bookings/services/` | One transaction per requested booking outcome; self-service cancel/reschedule use Serializable isolation; exclusion constraints remain final concurrency guard |
| Booking OTP verification/consumption | Conditional verification plus identity lookup; consumption plus booking/payment/outbox writes | `features/bookings/services/booking-otp.ts`, `booking-persistence.ts` | Verification claims an unverified, unused, unexpired tenant/phone/code match exactly once. Consumption requires the booking transaction client and changes exactly one verified, unused, unexpired match; booking failure rolls back consumption. SMS stays outside transactions. |
| Manual GCash verification/resolution/void | Payment transition, booking balance/status, service/voucher release, audit/outbox | `features/payments/services/manual-gcash.ts` | Conditional transition and all financial state in one transaction; immediate delivery only after commit |
| Payslip generation/release | Payslip, audit, attendance/service payment stamps | `features/payroll/services/payslip.ts` | Serializable selection and conditional stamps with affected-row checks; conflict aborts the whole release |
| Gift-card claim/update | Claim lock, customer, booking, line items, included service/package links | `features/gift-cards/services/gift-cards.ts` | Claim uses compare-and-set and creates the booking atomically |
| Subscription invoicing/payment/reward | Invoice, credits, subscription status, referral reward ledger | `features/billing/subscription-service.ts` | Balance consumption and lifecycle changes are atomic and idempotent |
| Campaign/social draft creation | Sale event, post, targets, campaign/opportunity and feature-specific audits | `features/growth/services/growth-campaign-persistence.ts`, `features/catalog/services/sale-event-administration.ts`, `features/social/services/social.ts` | Persist the complete feature draft graph or nothing; repeat current actor, tenant references and source snapshots inside the commit |
| Social request lifecycle | Request transition, linked post, audit/outbox | `features/social/services/social-post-requests.ts` | Status precondition and side-effect records share the transaction |
| Social publish state | Post/target transition, audit/outbox | `features/social/services/social.ts`, `lib/services/social/deliver-social-target.ts` | Provider call is outside transaction; persist claim/result in short transactions |
| Staff/owner membership and schedules | User plus employee/owner and schedules | `features/workforce/actions/` | Membership pairs change atomically; remaining legacy orchestration must move behind feature services |
| Owner permissions and primary switching | Conditional owner replacement or tenant-wide primary switch, plus audit | `features/workforce/services/owner-administration.ts` | Serializable transaction rechecks current actor SETTINGS_MANAGE. Target writes compare verified tenant, current OWNER role, exact permissions, and primary flag; require one affected target row. Primary switching clears the observed primary set and promotes the eligible target in the same transaction as its audit. No-op, conflict, or failure does not invalidate cache. Acquisition wait is bounded to 5 seconds and transaction duration to 10 seconds. |
| Employee permission changes | Tenant-scoped employee read, conditional permission replacement, audit | `features/workforce/services/employee-permissions.ts` | Only a verified owner may invoke the use case. Compare employee tenant, profile, and exact stored permission list before updating; require one affected row and audit in the same transaction. No-op, conflict, and failure do not invalidate cache. |
| Authenticated password change | Conditional credential replacement and temporary-flag clearing on one user row | `features/auth/services/password-change.ts` | Derive ID from authentication, check the current hash, hash outside database locks, then update only the same ID/hash version and require one affected row. This single conditional statement guards the race without a multi-statement transaction. |
| Business-hours settings | All supplied day/category upserts and audit | `features/businesses/services/business-hours.ts` | One nested-write transaction for the entire validated set, including more than 25 rows. Recheck verified owner SETTINGS_MANAGE in the business predicate; keep the last duplicate and retain unspecified hours. Acquisition wait is bounded to 5 seconds and transaction duration to 15 seconds; timeout aborts the whole request. Conflict scanning is post-commit and best-effort. |
| Booking-policy settings | Verified-tenant policy replacement and audit | `features/bookings/services/booking-policy.ts` | Require one business row matching current owner membership, role, and SETTINGS_MANAGE, then audit in the same transaction. Failure does not invalidate cache. |
| Catalog service administration | Service metadata and supplied flow replacement | `features/catalog/services/service-administration.ts` | Serializable transaction repeats current catalog access and verifies all suggested-service references against the actor's business. All target/flow predicates use that business ID. Omitted flows are retained; an explicit empty array clears them. Creation and all supplied links commit together. |
| Catalog package administration | Package metadata and item graph | `features/catalog/services/package-administration.ts` | Serializable create/replace/delete verifies current catalog access and same-tenant service references inside the transaction. Replacement deletes and recreates all supplied items atomically; an empty list clears them. Duplicate service IDs are rejected at the boundary to respect the unique package/service pair. |
| Expense administration | Tenant expense creation/revision/deletion and verified-actor audit | `features/payroll/services/expenses.ts` | Serializable transaction repeats current owner membership. Update/delete compare verified tenant, stored updated_at and complete amount/category/description/date snapshot, require one affected row and audit in the same transaction. Audit or revision failure aborts the expense write; caches invalidate only on committed success. |
| Customer administration | Tenant customer create, or conditional update plus scoped reload | `features/customers/services/customer-administration.ts` | Serializable create repeats current membership. Update and its same-tenant reload share the transaction; missing reload throws and rolls the update back. Contact omission and empty-string replacement remain distinct. Delete is one current-membership/tenant-scoped conditional statement with an affected-row check. |
| Sale-event administration | Sale metadata/relations plus optional social post, targets and audit | `features/catalog/services/sale-event-administration.ts` | Serializable commit repeats current owner membership, tenant service/package references and exact prepared connected targets. Graph replacement and all draft rows commit together. Caption/image generation and entitlement checks happen before the transaction; no external publication occurs in this use case. |
| Brand-asset lifecycle | Permission-checked asset row create or conditional removal | `features/assets/services/brand-assets.ts`, `brand-asset-lifecycle.ts` | Serializable persistence repeats exact current owner SETTINGS_MANAGE and tenant references. Upload precedes row creation outside locks; persistence failure triggers best-effort compensating Blob deletion. Committed row removal precedes best-effort Blob deletion; provider failure leaves no row. |
| Voucher administration | Current-member voucher creation or tenant-conditional deletion | `features/catalog/services/voucher-administration.ts` | Bounded Serializable writes repeat exact current owner/staff membership and role. Code uniqueness is global; the existing unique constraint is the final collision guard. Generation and public verification are advisory reads, not reservations or redemption. |
| Business profile and growth settings | Business metadata/payment configuration plus growth settings upsert | `features/businesses/services/business-settings.ts`, `business-settings-lifecycle.ts` | One bounded Serializable transaction repeats current owner SETTINGS_MANAGE. Either both writes commit or both roll back. QR processing/uploads precede persistence outside locks; failed later upload/persistence compensates only newly uploaded objects best effort. Prior images are not deleted. |
| Booking add-ons and follow-ups | Appended lines/totals/audit/outbox, or follow-up booking/outbox plus two audits | `features/bookings/services/booking-addons.ts`, `booking-persistence.ts` | Transaction-bound access repeats current role/membership, staff BOOKING_CREATE or BOOKING_MODIFY, initiator and tenant references. Internal before/after hooks let follow-up guards and both audits share booking creation's transaction and retries. Only the specific append state-race error permits follow-up fallback; unrelated or committed cache errors do not. |
| Meta OAuth callback | Connection upsert and audit | `app/api/social/meta/callback/route.ts` | Existing route transaction is valid debt; move orchestration to `features/social/` |
| Outbox claim/process | Claim, attempt count, processed/error result | `app/api/cron/process-outbox/route.ts`, `lib/services/outbox-immediate.ts` | Short attempt-count compare-and-set; not an exclusive delivery lease. Provider delivery stays outside transactions; overlapping later claims and provider idempotency remain verification/remediation debt. |

OTP verification also returns a signed, OTP-purpose ownership proof scoped to
verification ID, canonical phone, and verified business ID. Public creation
requires both ID and proof; neither a guessed ID nor another booking-token
purpose can consume verification. Proof expiry and stored OTP expiry both apply.
Clients verified before this contract change must request and verify a new code.

The owner primary index is not unique. Serializable switching protects this
use case's concurrent writes; it does not establish a database-wide uniqueness
constraint or make unmigrated owner-creation/deletion writers safe. A constraint
and all-writer review require a separately scoped migration with isolated-database
verification. Do not claim the whole owner lifecycle is concurrency-verified.

## Non-Transactional Operations

Voucher and business-profile writes, and standalone add-on writes, bound
transaction acquisition to 5 seconds and duration to 10 seconds. Add-on InTx
composition uses the outer caller's transaction bounds. The optional booking
persistence hooks use the same transaction client, and their failure aborts the
booking/outbox/audits together; callers without hooks retain the existing API
and retry policy. No provider operations are allowed in these hooks.

Business-profile cache invalidation is independent, post-commit and best-effort;
it never compensates storage referenced by a committed business row. Cleanup
failure can leave newly uploaded orphan objects. This is not a durable cleanup
outbox, a database-wide permission/reference constraint or proof of SQL-race
ordering. Public voucher verification is a read-time quotation: a later booking
must still perform its own atomic voucher reservation.

Customer create/update, sale-event and brand-asset transactions bound acquisition
wait to 5 seconds and duration to 10 seconds. Their cache invalidation is
post-commit and best-effort: a cache exception does not change committed success
or delete an uploaded Blob referenced by a committed asset. Independent cache
operations are attempted separately where applicable.

Storage compensation is not a distributed transaction. Failed compensating
deletion or post-removal provider cleanup can leave an orphan Blob. Likewise,
sale promo media generated before a later commit failure may remain in storage;
this extraction does not add a durable cleanup outbox or provider-wide rollback.
Application reference checks do not add cross-tenant foreign-key constraints or
coordinate unmigrated reference writers. Isolated database/provider-boundary
verification and separately scoped cleanup/concurrency work remain required.

Catalog service/package and expense transactions bound acquisition wait to
5 seconds and duration to 10 seconds, with no provider calls. Serializable
conflicts return safe refresh-and-retry errors. These application boundaries do
not add cross-tenant foreign-key constraints or make unmigrated reference writers
safe; isolated PostgreSQL race and cascade proof remains required.

Today's expense summary preserves the server-local inclusive day boundaries.
Its full-day sum and five recent display rows are independent read-only queries,
not a joint snapshot; concurrent writes can make those two views briefly differ.
The aggregate is no longer limited to the five displayed rows. Changing business
timezone semantics or adding a snapshot contract is a separate use case.

The settings page submits policy and hours as two independent requests. Each
request is atomic, but the pair is not: one may commit while the other fails.
The UI waits for both outcomes and reports partial saves instead of announcing
unconditional success. A joint settings transaction would require a separate
application-level use case; these services do not promise cross-request rollback.

Payroll preview and release share `features/payroll/services/payslip-policy.ts`.
Duplicate attendance dates count once toward wages, but every selected row is
stamped so a duplicate cannot be compensated in a later release. A serialization
conflict or incomplete stamp returns a refresh-and-retry response without cache
invalidation. Real-PostgreSQL concurrency verification requires the dedicated
`service-flow-test` database; shared `service-flow-dev` is not a test target.

Independent read-only queries may use `Promise.all`. A single isolated write
does not need `$transaction` unless it participates in an unguarded read-check-write race,
audit requirement, or externally visible event. PostgreSQL constraints remain
required even when application transactions exist.

## Owner-Specialty Replacement

Owner-specialty replacement checks current actor `SETTINGS_MANAGE` and exact
membership, same-tenant current-owner target and previous specialties, then
conditionally writes and records the audit in one Serializable transaction
(5-second acquisition wait, 10-second duration). Incomplete updates/serialization
conflicts require refresh and retry. No provider operations run inside it.
Conflict scanning and cache invalidation are separate post-commit best-effort
operations; neither changes committed success. No-ops skip these operations.
This is an application boundary, not an all-writer authorization constraint or
proof of real PostgreSQL rollback/revocation ordering.

## Owner Queue Claim and Unclaim

Claim/unclaim recheck current owner membership/role, same-tenant target and
references, supported state, pricing, assignment and scheduling snapshots in one
Serializable transaction (5-second acquisition wait, 10-second duration). The
conditional mutation and status audit commit together. Lost snapshots and
P2025/P2034 failures retain the safe command-specific retry/denial result; no
automatic transaction retry or provider I/O is introduced.

Claim reads inclusive active sale bounds, tenant-filtered service/package IDs
and non-cancelled booking slot counts through the same transaction, then reuses
the existing discount selection and commission-base policy. A sale lookup
failure now fails safely rather than silently applying no discount. This read
does not reserve/decrement sale slots or replace booking-level reservation rules.
Overlap diagnostics reuse the existing helper with the transaction and verified
reference/membership scope. Exclusion violations roll back and attempt a bounded
read-only transaction for safe optional diagnostics; failures omit details.

Unclaim restores original pricing and clears assignment/claim/serve fields only
for active self-owner work; completed/cancelled/payroll work is not reset. Cache
invalidation follows committed success and cannot convert it to failure. These
application predicates are not all-writer database authorization constraints;
real SQL rollback/race/revocation ordering and owner browser evidence remain
required separately.

## Owner Queue Serve and Undo Serve

Service mutation, optional parent completion/reopen, customer-trust promotion
and verified service/booking status audits share one Serializable transaction
(5-second acquisition wait, 10-second duration). Missing/stale conditional writes,
reloads, audits or infrastructure failures roll back and return the original safe
command-specific error. No automatic retry or provider I/O is introduced. Cache
invalidation runs best-effort after committed success.

Serve reuses `promoteBookingToCompletedIfEligible` with verified tenant and parent
snapshot scope. Its lookup, remaining-service count and conditional parent update
retain that scope; customer NEW→TRUSTED promotion is tenant-filtered. Every line
of the verified parent still participates in the existing completion policy:
COMPLETED/CANCELLED lines do not block completion. The employee caller retains
the legacy two-argument helper contract; its separate authorization/state debt
is not repaired by the new optional owner scope.

Completion is independent of payment settlement. Undo returns the service to
CLAIMED and clears serve/completion dates, reopening only a COMPLETED parent to
ACCEPTED. It does not reprice work, reverse payments or downgrade customer trust.
These application boundaries do not prove all-writer invariants or concurrent
membership-revocation ordering; guarded real-SQL and owner-browser evidence is
still required on the dedicated disposable test database.

## Booking No-Show

The status-only booking transition, linked customer counter/date/trust update
and verified customer/booking audits share one Serializable transaction
(5-second acquisition wait, 10-second duration). Anonymous bookings commit only
the parent transition and booking audit in that same boundary. Conditional
writes repeat tenant/current-actor policy and parent/customer state snapshots;
missing writes or audit failure throw through the transaction before safe error
translation. No automatic retry is performed. Cache invalidation is best-effort
after committed success.

A booking can increment the counter only once. Competing bookings for the same
customer must retain the observed counter, trust, date and update snapshot; a
loser rolls back its parent transition and can be retried from fresh state.
The second no-show sets RESTRICTED; the first preserves the existing trust tier.

This preserves the legacy no-show policy, not general cancellation: payment,
prepayment, services, vouchers and soft-cancellation stamps are unchanged, with
no provider calls or notification/outbox writes. Guarded SQL rollback/race and
authenticated browser evidence remain required on the dedicated disposable
test database. These predicates do not prove all-writer invariants or concurrent
membership-revocation ordering.

## Manual Booking Completion

Current actor/capability checks, parent/payment/work eligibility, conditional
parent status mutation and verified booking status audit share one Serializable
transaction (5-second acquisition wait, 10-second duration). The write repeats
tenant/current membership and policy, tenant-consistent references, ACCEPTED,
PAID, amount/total, customer, cancellation and `updated_at` snapshots, and no
unfinished service lines. Missing conditional writes and audit failures escape
the transaction before safe error translation. Duplicate/terminal requests do
not produce another mutation or audit. No automatic retry or provider I/O runs
inside the transaction. Cache invalidation is best-effort after committed success.

Manual completion does not modify service/payroll records, customer trust,
payments, vouchers or outbox messages. Automatic completion remains a separate,
payment-independent service-driven workflow. These application predicates do
not establish all-writer payment/status invariants or concurrent permission-
revocation ordering. Guarded SQL rollback/race and authenticated owner/allowed-
staff browser evidence remain required on the dedicated disposable database.

## Self-Service Attendance

Clock-in/out use bounded Serializable transactions (5-second acquisition wait,
10-second duration), repeating current self membership and tenant location
checks. Clock-in checks the Philippine day range and retains the existing
employee/date unique constraint as the final duplicate guard. Clock-out updates
only the verified tenant/self record with a null `time_out`, then reloads it
inside the same transaction; a missing update or reload aborts the write.
External conflict detection, cache invalidation and optional logging run
best-effort after commit. No automatic retry, payroll write or new GPS policy
is introduced. Separate attendance-admin writers and all-writer revocation
ordering are not proved by this command boundary.

## Owner Subscription Commands

Plan-upgrade decisions and request creation share a bounded Serializable
transaction with current owner/tenant verification. Manual-reference reads,
eligibility/duplicate checks, conditional invoice metadata update and
`MANUAL_PAYMENT_SUBMITTED` outbox publication share the same transaction. The
conditional write repeats tenant/membership, subscription tenant, status,
metadata, `updated_at`, amount-paid and paid-at snapshots; an incomplete write
or outbox failure aborts the transaction. There is no automatic retry or invoice
settlement in the reference-submission workflow.

Invoice creation delegates a tenant-derived subscription ID to the existing
financial helper, which owns its own transaction. This extraction does not
repair that helper's separate authorization-revocation, credit-consumption or
all-writer invoice-concurrency debt. Cache invalidation follows committed
success. Real PostgreSQL race/rollback and authenticated expired-owner billing
evidence require the dedicated disposable database.

## Permanent Booking Deletion

Current-owner identity verification and tenant-filtered parent deletion share
one Serializable transaction (5-second acquisition wait, 10-second duration).
The delete predicate repeats stored owner membership and rejects foreign-tenant
voucher and price-adjustment backlinks. Existing valid database cascades remove
booking-owned services, payments, used vouchers, notes and adjustments; catalog,
customer and actor records are not deleted. No new payment/status/retention
policy, audit requirement, provider call or automatic retry is introduced.

Cache invalidation is best-effort after commit. These application predicates
do not prove all-writer tenant integrity or concurrent membership-revocation
ordering. Real PostgreSQL cascade, rollback and tenant-backlink evidence and
authenticated owner-browser verification require the dedicated disposable test
database.

## Employee Administration

Account/employee creation, updates, deletion, credential rotation and schedule
replacement use bounded Serializable transactions. Commands repeat the exact
current owner identity and tenant target inside the transaction; conditional
account writes include the original credential/contact snapshot. Schedule
replacement clears and recreates ranges atomically. Deletion checks malformed
foreign-tenant cascade/nulling edges without adding a new payroll or retention
restriction. Serialization conflicts fail safely; no automatic retry is added.

Hashing, SMS, future-conflict scans and cache invalidation remain outside locks.
An SMS failure after credential rotation preserves the authorized manual invite
fallback. These transaction checks do not prove ordering against every legacy
writer or concurrent membership-revocation path.

## Reference-Candidate Approval

Pexels discovery and image download/Blob upload occur outside locks. Discovery
upserts and approval persistence use bounded Serializable transactions with
current owner checks. Approval compares the downloaded candidate snapshot,
checks tenant duplicates, creates the asset and conditionally updates exactly
one pending candidate in the same transaction. Rejection remains tenant-scoped.

Failed persistence compensates only a confirmed newly uploaded owned Blob after
an exact persisted-asset lookup. A lookup failure or ambiguous commit retains
the upload rather than risking deletion of a committed or unrelated object.
Mocks do not establish simultaneous-approval SQL behavior or all-writer
uniqueness; those require isolated database evidence.

## Growth Campaign Commit

Offer, caption/image-prompt generation, image download/upload and telemetry run
outside database locks. Campaign persistence uses a bounded Serializable
transaction to repeat current owner and tenant references, compare the source
opportunity snapshot, create the sale event when applicable, draft post and
targets, campaign/assets and conditionally convert the opportunity together.
An incomplete conditional transition aborts all of those database writes.
Campaign-event tracking likewise checks the current owner and tenant campaign
inside its bounded transaction. Cache/telemetry failure after commit is
best-effort; it cannot reverse committed success.

Snapshot/settings/detector helpers remain trusted-context legacy delegates with
separate writes. Refresh dismisses and regenerates opportunities in separate
steps, not one transaction. Their revocation ordering, partial-refresh recovery,
generated-image orphan cleanup and all-writer invariants need separately scoped
verification/remediation. Extracting action orchestration does not fix those
legacy helpers or establish SQL concurrency evidence.

## Review Triggers

Add or revise the boundary when a workflow gains another write, an audit/event
requirement, a balance/counter, a provider call, or concurrent workers. Critical
transaction behavior requires a real-PostgreSQL integration test.
