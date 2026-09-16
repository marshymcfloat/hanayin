# Transaction Boundaries

Last inventoried: 2026-09-07

A transaction boundary represents one business outcome. All database state that
must agree about that outcome belongs in the same Prisma transaction. Network
calls never belong inside a database transaction.

## Required Rules

- Use a transaction for two or more dependent writes, read-check-write races,
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
| Booking create/modify/cancel/self-serve | Booking, service lines, vouchers, totals, audit, notification event | `features/bookings/actions/`, `features/bookings/services/`, remaining transitional `lib/services/booking-*.ts` | One transaction per requested booking outcome; exclusion constraints remain final concurrency guard |
| Manual GCash verification/resolution/void | Payment transition, booking balance/status, service/voucher release, audit/outbox | `features/payments/services/manual-gcash.ts` | Conditional transition and all financial state in one transaction; immediate delivery only after commit |
| Payslip generation/release | Payslip plus attendance/service payment stamps | `features/payroll/actions/payslip.ts` | One transaction prevents duplicate compensation and partial stamping |
| Gift-card claim/update | Claim lock, customer, booking, line items, included service/package links | `features/gift-cards/services/gift-cards.ts` | Claim uses compare-and-set and creates the booking atomically |
| Subscription invoicing/payment/reward | Invoice, credits, subscription status, referral reward ledger | `features/billing/subscription-service.ts` | Balance consumption and lifecycle changes are atomic and idempotent |
| Campaign/social draft creation | Sale event, post, targets, campaign/opportunity, audit | `features/growth/actions/growth.ts`, `features/catalog/actions/sale-event.ts`, `features/social/services/social.ts` | Persist the complete draft graph or nothing |
| Social request lifecycle | Request transition, linked post, audit/outbox | `features/social/services/social-post-requests.ts` | Status precondition and side-effect records share the transaction |
| Social publish state | Post/target transition, audit/outbox | `features/social/services/social.ts`, `lib/services/social/deliver-social-target.ts` | Provider call is outside transaction; persist claim/result in short transactions |
| Staff/owner administration | User plus employee/owner, permissions, primary-owner switch, schedules | `features/workforce/actions/` | Membership pairs and mutually exclusive primary state change atomically |
| Catalog replacement sets | Package items, service-flow links, business hours | `features/catalog/actions/`, `features/businesses/actions/business-hours.ts` | Delete-and-recreate sets in one transaction |
| Meta OAuth callback | Connection upsert and audit | `app/api/social/meta/callback/route.ts` | Existing route transaction is valid debt; move orchestration to `features/social/` |
| Outbox claim/process | Claim, attempt count, processed/error result | `app/api/cron/process-outbox/route.ts`, `lib/services/outbox-immediate.ts` | Short compare-and-set claim; provider delivery outside transaction; short result write |

## Non-Transactional Operations

Independent read-only queries may use `Promise.all`. A single isolated write
does not need `$transaction` unless it participates in a read-check-write race,
audit requirement, or externally visible event. PostgreSQL constraints remain
required even when application transactions exist.

## Review Triggers

Add or revise the boundary when a workflow gains another write, an audit/event
requirement, a balance/counter, a provider call, or concurrent workers. Critical
transaction behavior requires a real-PostgreSQL integration test.
