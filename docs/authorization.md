# Role and Permission Enforcement

Last reviewed: 2026-09-18

This document operationalizes the product matrix in
`docs/role-permissions-matrix.md`. That matrix remains the source of truth for
booking-editor and social-request decisions.

## Enforcement Order

```text
authenticate session
  -> verify requested tenant equals session tenant
  -> resolve Owner/Employee membership for that tenant
  -> enforce subscription write access
  -> enforce role, profile, and permission
  -> apply business-policy modifiers
  -> execute tenant-scoped use case
```

UI visibility is not authorization. Server Actions and Route Handlers repeat
the complete applicable chain.

## Roles and Guards

| Actor/capability | Server enforcement | Notes |
| --- | --- | --- |
| Authenticated tenant read | `requireTenantAccess(slug)` | Slug must equal verified session tenant |
| Authenticated tenant write | `requireTenantAccess(slug, { write: true })` or `requireTenantWriteAccess` | Also blocks subscription read-only state |
| Delegated staff operation | `requireStaffPermission(slug, permission, { write: true })` | Resolves membership, profile, stored permissions, and business policy |
| Owner-only destructive write | `requireOwnerTenantWriteAccess(slug)` | Role-lock permanent deletion, sensitive settings, and non-delegable operations |
| Delegated owner settings write | `requireOwnerPermission(slug, OwnerPermission.SETTINGS_MANAGE)` | Subscription write gate, current owner membership, and exact stored owner capability; no primary-owner override |
| Session-derived owner administration | `requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE)` | Same capability chain, with tenant derived from authentication rather than action input |
| Platform operation | `requirePlatformAdmin()` | Tenant membership is irrelevant; platform role is mandatory |
| Public operation | Workflow-specific signed token/OTP/rate-limit guard | Never infer authority from a slug or record ID |

## Permission Sources

- `Role`: `OWNER`, `EMPLOYEE`, `PLATFORM_ADMIN`.
- `StaffProfile`: `STAFF`, `MANAGER`, `CASHIER`.
- `StaffPermission`: booking create/modify/cancel/no-show/price, payment collect
  and verify, queue self/override, catalog, social request/review/publish.
- `OwnerPermission`: billing, reports, employee/staff, settings, catalog, and
  payroll capabilities for co-owner delegation.
- Business policy: structure, employee self-booking, and manager serving flags.

Owners pass `hasStaffPermission` for tenant operational permissions, but
co-owner administration must still honor `OwnerPermission`. Platform admins do
not automatically become tenant actors; impersonation must produce an explicit,
auditable tenant context.

## Required Coding Rules

- Use `resolveTenantActorContext`; do not rebuild actor state from raw role and
  profile strings.
- Pass the narrow enum permission matching the operation.
- Keep client viewer-context helpers derived from server-provided capabilities.
- Denials return `Unauthorized` for no valid identity and `Forbidden` for an
  authenticated actor without access. Do not reveal whether a foreign record
  exists.
- Customer follow-up history requires current tenant membership; a raw customer
  ID is not a public ownership proof. Unauthenticated/public callers receive an
  empty result until a separate verified customer capability exists.
- Public booking requires fresh OTP verification even for trusted customers.
  A numeric verification ID is not authority: require the signed OTP-purpose
  proof bound to that ID, canonical phone, and verified business ID. Generate
  it only after a successful conditional verification, and validate it before
  conditional consumption inside the booking transaction. Do not log proofs.
  Verification attempts use separate normalized-phone and IP buckets; configured
  rate-store failures deny access rather than allowing verification.
  Production requires a configured shared rate store: the unconfigured
  in-memory limiter protects only one process, not all application instances.
- Owner directory reads require matching tenant context and current owner
  membership. Attendance counts are limited to tenant owners or the employee
  themself, with tenant constraints on both the target and count query.
- Notification history retains the owner/write subscription gate and verifies
  current owner membership before listing or counting outbox records. Both
  reads use the verified business ID, processed-state filtering, and only the
  seven supported notification events. Pages are finite integers from 1 to
  10000 with 50 rows per page. Contact/channel DTOs never contain raw payloads
  or internal delivery errors; failed records use generic delivery-failure text.
- New or modified user records sent to client components or action callers use
  `lib/auth/public-user.ts` selectors and explicit allowlist mapping. Never send
  password hashes or temporary credential flags/expiry, including successful
  creation with an SMS-delivery warning and employee/owner/payroll lists.
- Password changes derive user identity only from authentication context, not
  action payloads. Validate the complete payload; preserve password whitespace
  and legacy current-password comparison (bounded to 4096 characters). New
  passwords require at least eight characters and at most 72 UTF-8 bytes to
  avoid bcrypt truncation. Check the old hash, then conditionally replace that
  exact credential version and clear temporary flags in the same atomic write.
  Never log credentials or return hashes/internal errors.
- Employee pickers and internal booking notes require current owner/staff tenant
  membership, without adding queue-override permission requirements. Pickers
  return ID/name/profile only. Notes are constrained through the parent booking's
  verified business ID, use positive 32-bit integer IDs, and return at most 100
  latest-first notes with creator display fields. This internal query includes
  internal notes and must never be exposed as a public customer capability.
- Core report-read actions verify current owner membership in addition to the
  session role. Report queries and view telemetry use that verified business and
  user identity. Validate bounded filter shapes while retaining the existing
  parser's valid-string normalization, defaults, and 730-day range cap.
- Booking-policy and business-hours writes require current owner membership and
  stored `SETTINGS_MANAGE`; staff operational permissions do not grant access.
  The service persistence predicate repeats verified owner ID, user ID, business
  ID, current user role, and stored permission. Client-supplied identity fields
  are stripped during validation. Public policy/hours/category reads expose
  narrow display DTOs, not owner or business records.
- Booking-policy partial inputs retain legacy default replacement and numeric
  flooring/clamping, rather than patching omitted fields. Reject malformed types
  and numbers outside signed 32-bit bounds. Timezone remains readable but is not
  writable through this action. Business hours accept at most 500 entries, days
  0–6, `HH:mm` times, and non-empty categories up to 200 characters. Duplicate
  day/category pairs retain the last supplied entry; unspecified hours remain.
- Permission changes, impersonation, owner changes, financial actions, booking
  modifications, and social publication require audit records.
- Owner administration requires current `SETTINGS_MANAGE`, rechecked inside the
  Serializable transaction. Target reads and conditional writes require the
  verified business ID and current target user role `OWNER`. Owner IDs must be
  positive 32-bit integers; permission arrays allow at most 100 strings of at
  most 100 characters. Unknown enum strings are filtered, duplicates removed,
  and full-report access supersedes sales-only access. At least one valid
  permission remains required. A primary owner cannot lose `SETTINGS_MANAGE`;
  promotion requires it already stored and never grants it implicitly.
- Catalog service/package writes retain `requireStaffPermission` with
  `CATALOG_MANAGE` and subscription write access. The transaction-level
  `features/catalog/catalog-access.ts` helper repeats verified actor, user,
  tenant, and current role checks. For employees it uses the current profile and
  stored permissions through existing sanitization/default policy; current
  owners retain the existing operational catalog grant. This is not universal
  adoption of co-owner `OwnerPermission` for catalog operations. Referenced
  services must belong to the verified tenant inside the graph transaction.
- Expense reads require current owner/employee tenant membership; writes retain
  the owner-only subscription write gate and repeat current owner membership at
  persistence. Expense IDs are positive 32-bit integers, amounts finite and
  positive, categories supported enums, descriptions at most 2000 characters,
  dates valid, and optional limits 1–1000. Reversed date ranges are rejected.
  DTOs expose expense fields and creator name only, never a raw user record.
- Booking-detail reads require current tenant actor membership, not a new
  operational permission or subscription write gate. Positive 32-bit IDs and
  parent-booking tenant predicates protect this internal panel capability.
  Explicit nested selectors expose only panel customer, voucher, service and
  serving-actor display fields; date fields retain ISO strings or null.
- Customer operations derive tenant identity from the verified session, ignoring
  caller slugs where the existing action does so. Current owner/employee
  membership and role constrain writes, scoped reloads and nested history reads.
  IDs are non-empty strings up to 191 characters; search and names up to 200,
  email up to 320 and phone up to 50. Contact strings retain legacy raw values,
  omitted contacts remain unchanged, and explicit empty strings replace them.
  Search retains eight hits, Philippine phone matching and latest tenant visit.
  Duplicate checks reuse booking matching; they are advisory, not uniqueness.
- Sale-event internal reads require current tenant membership; writes retain the
  owner-only subscription gate and repeat owner membership, service/package
  references and prepared social target state inside the commit transaction.
  Active-sale display reads remain intentionally public, with narrow nested
  reference IDs and only noncancelled same-tenant bookings counted. Dates are
  inclusive and bounded to years 0001–9999; reversed ranges are rejected.
  Selections allow at most 100 positive 32-bit IDs each and deduplicate valid
  repeats. Discounts are finite/nonnegative, with percentages at most 100.
- Brand-asset writes require current stored `SETTINGS_MANAGE` through
  `requireAuthenticatedOwnerPermission`; a raw owner role is insufficient.
  Persistence repeats owner/user/tenant/current-role/capability predicates and
  same-tenant service/employee references after external upload. Reads require
  current owner/employee membership. Upload validation retains the allowed image
  MIME types and 8 MB cap; kind-specific references are positive 32-bit IDs,
  alt text is at most 2000 characters and asset IDs at most 200. Display DTOs
  exclude storage keys, uploaded actor identity and tenant internals.
- Business profile, payment-display and growth-setting updates require current
  owner `SETTINGS_MANAGE`. The business write repeats exact owner/user/tenant,
  current OWNER role and stored capability inside the same transaction as the
  growth upsert. Raw FormData is bounded and validated before QR/Blob work;
  coordinates must be finite and within latitude/longitude bounds.
- Voucher administration retains the existing authenticated owner/staff
  subscription read/write policy without adding an unrelated operational grant.
  Exact current role and membership constrain queries and writes. Codes are
  normalized and globally unique; public verification returns a narrow quote,
  never customer data or redemption authority. Used-booking display metadata is
  filtered by tenant even for legacy foreign links. Monetary inputs are finite
  and nonnegative; percentages are at most 100.
- Booking add-ons retain the staff `BOOKING_CREATE` OR `BOOKING_MODIFY` gate.
  Employees may only identify themselves as initiator; owners may select a
  current same-tenant employee. Each write repeats current membership, role,
  profile/default permission policy, initiator and selected references. Parent
  customers must belong to the verified tenant. An append state-race may select
  follow-up creation, but access failures and unrelated persistence errors must
  not be treated as mode-switch authority.
- Tests must table-drive owner, each staff profile, explicit grants/removals,
  business-policy modifiers, subscription read-only state, and cross-tenant
  denial.

## Dashboard Queues and Owner Specialties

Dashboard pending queues require current owner/employee membership, retaining
staff specialty visibility without adding write/subscription or operational read
permissions. Owner-claimed queues require a current owner actor and select only
that owner's claimed/serving services. Queries constrain accepted parent bookings,
customer/service/package references and current actor role/membership to the
verified tenant; legacy foreign display references are excluded. Anonymous
walk-ins with a null customer ID remain visible, without relaxing parent,
service/package or membership scopes.

Owner-specialty changes require the same current stored `SETTINGS_MANAGE` used by
owner administration, not merely authenticated tenant write access. Actor access
and same-tenant current-owner target predicates repeat inside a Serializable
transaction; snapshot-conditional replacement and its audit commit together.
Inputs allow positive 32-bit owner IDs and at most 100 nonempty specialty strings
of at most 200 characters. Raw values, order, duplicates and empty arrays remain
unchanged; this does not redefine provider qualification. No-ops skip audit,
conflict scanning and cache invalidation. Scanning/cache work is independent,
post-commit and best-effort, never a reason to report a committed write as failed.

## Owner Queue Claim and Unclaim

Owner claim/unclaim actions validate positive 32-bit service IDs (retaining the
existing numeric coercion), authenticate tenant write access and resolve the
current verified owner. No new owner operational capability gate is imposed.
The service repeats exact owner/user/business membership and current OWNER role
inside a Serializable transaction. Parent bookings, service/package references
and linked customers must belong to that tenant; anonymous walk-ins with no
customer remain supported. Foreign/missing targets share the same safe error.

Claim requires accepted, non-soft-cancelled bookings and unassigned PENDING work
without claim/serve/completion/cancellation/payroll markers. Unclaim permits
self-owner CLAIMED/SERVING work only, also requiring an accepted, active booking
and no completion/cancellation/payroll markers. It clears the active serve
timestamp; completed work must use the separate Undo Serve workflow. This closes
the legacy unclaim-any-status path, not a redesign of serve/undo semantics.
Pricing and assignment/scheduling snapshots constrain the conditional write.
Audit commits with the mutation; cache invalidation is best-effort after commit.
Other legacy owner commands remain separate migration debt.

## Owner Queue Serve and Undo Serve

Serve/undo actions use the same bounded service-ID validation, tenant write
authentication and verified current-owner context. Shared owner-queue predicates
repeat stored OWNER role, exact membership and tenant-consistent parent,
customer, service and optional package references inside the transaction. No new
`SETTINGS_MANAGE` gate is imposed; anonymous walk-ins remain supported.

Serve permits self-OWNER CLAIMED/SERVING work under an active ACCEPTED parent.
Undo permits self-OWNER COMPLETED work with a completion timestamp under an
active ACCEPTED/COMPLETED parent. Mixed employee assignments, cancellation and
payroll linkage are denied. Conditional writes repeat assignment, parent/customer
state, timestamps and `updated_at`; stale or duplicate requests fail safely with
no additional committed writes/audits. The explicit scalar DTO preserves current
fields and dates without returning customer relations or future model fields.
The remaining permanent-deletion command is separate legacy debt.

## Booking No-Show

The action validates a bounded, coercible booking ID before tenant write
authentication. The feature command reuses the existing tenant actor resolver
inside its transaction. Current stored role, exact owner/employee membership,
profile, effective no-show capability and business policy constrain both reads
and conditional writes. Owners need no new settings capability. Existing STAFF/
MANAGER empty-permission defaults and explicit CASHIER no-show grants remain;
this extraction does not introduce a new manager-only policy.

Only active HOLD/ACCEPTED bookings with tenant-consistent customer references
qualify. Anonymous bookings remain supported. Already cancelled, soft-cancelled,
completed, started/completed-service and payroll-linked work is denied. Customer
counter bounds and booking/customer snapshots are checked before mutation.
Errors do not expose resolver or database internals.

## Booking Cancellation Routing

Generic booking-status updates reject CANCELLED before authentication or data
access; callers must use the reason-required cancellation workflow. The booking
list's existing ACCEPTED quick action now respects the shared viewer's
`canCancel` capability and excludes soft-cancelled rows. It opens the same
`CancelBookingDialog`/`cancelBookingAction` used by the detail panel, so the list
no longer has a separate status-only cancellation route. The canonical action still
enforces tenant write access and the shared `BOOKING_CANCEL` permission resolver.
This routing change does not redesign profile grants or repair canonical
transaction-revocation debt.

## Manual Booking Completion

The generic status action validates a bounded, coercible booking ID and status
enum before authentication. CANCELLED requires the canonical reason-required
workflow; HOLD and ACCEPTED targets are unsupported. Only active ACCEPTED to
COMPLETED is permitted, with PAID settlement and every service line COMPLETED
or CANCELLED. All providers' lines participate, including payroll-linked lines;
finished payroll work is never rewritten. As in automatic completion, an empty
line set has no unfinished work. No unfinished-work override or reopening is
introduced.

The command reuses the current tenant actor resolver inside its transaction and
requires `BOOKING_MODIFY`. Stored role, exact membership, current profile,
effective permission and business-policy snapshots constrain the parent read
and conditional write. Owners retain implicit grants; STAFF/MANAGER defaults
and explicit CASHIER grants remain, without a new manager-only or settings gate.
Customer, service and optional package references must belong to the tenant;
anonymous bookings remain supported. Soft- or customer-cancelled and terminal
bookings cannot be completed. Automatic service-driven completion remains
payment-independent. Manual completion changes neither customer trust nor money.

## Self-Service Attendance

Attendance status and zero-based monthly reads require current stored tenant
membership. Owners may read a tenant employee's attendance; employees may read
only their own. Clock-in/out remain employee-self-only, with the existing
subscription write gate, verified tenant slug and 100-metre GPS policy. Input
schemas bound employee IDs, dates, years/months and finite geographic coordinates.
Reads repeat tenant/membership predicates rather than relying only on a prior
lookup. Clock commands repeat the exact current actor identity inside their
transaction. Philippine calendar boundaries and existing result contracts remain.
Post-commit conflict notifications, cache invalidation and optional warning
logging are best-effort and cannot reverse committed success.

## Owner Subscription Commands

Invoice creation, plan-upgrade requests and manual payment-reference submission
require actual current stored owner membership. Their tenant identity comes from
authenticated context. These commands deliberately do not apply a subscription
write gate: an expired tenant must still be able to renew or submit payment.
Employees do not gain owner-billing authority. Upgrade requests retain the
active higher-priced-plan and no-pending-request rules. Manual references retain
the OPEN/DRAFT, no-existing-submission rule and do not settle an invoice or
capture payment. Validation is bounded, errors are safe, and committed writes
remain successful when cache invalidation fails.

## Permanent Booking Deletion

Permanent deletion remains owner-only and retains the existing subscription
write gate. The adapter validates a bounded, coercible PostgreSQL booking ID
before authentication and resolves the current stored owner membership. The
bookings command repeats the exact owner/user/tenant identity inside its
transaction and scopes deletion to that tenant and current membership.

The command rejects foreign-tenant vouchers attached to the booking and
foreign-booking adjustments pointing to its service lines: deleting those
links would otherwise cascade-delete or null foreign-tenant records. Valid
database cascades remain unchanged. No status, payment, payroll or retention
restriction is introduced; a new deletion policy requires a separate product
decision. Employees do not gain permanent-deletion access. Missing or denied
targets and infrastructure failures return safe errors, and post-commit cache
failure cannot turn committed deletion into reported failure.

## Employee Administration

Employee writes require current stored owner membership and the existing
subscription write gate. List and schedule reads retain current same-tenant
member access, including colleague schedules. Employee targets and account
updates repeat tenant, role and membership predicates. Public user DTOs omit
credential fields; authorized invite resend deliberately retains its one-time
temporary-password fallback. Known-password reset clears temporary-password
flags and expiry. This is not a new password-strength or retention policy.

Schedule replacement preserves split ranges, empty clearing and existing
overnight/overlap rules. Deletion rejects malformed foreign-tenant backlinks
that would otherwise cascade-delete or null another tenant's records; legitimate
same-tenant history keeps its existing database behavior. Hashing and SMS stay
outside database locks. Provider, conflict-scan, logging and cache failures
after commit cannot turn committed writes into reported failure.

## Reference-Candidate Pilot

Reference discovery, link creation, approval and rejection require actual
current owner membership and the existing write gate. The Beautyfeel pilot,
discovery categories, link-only behavior and explicit rights confirmation are
unchanged. Candidate IDs, URLs, arrays and provider responses are bounded and
validated. Stored links are not fetched. Candidate image downloads accept only
HTTPS images.pexels.com URLs, omit credentials, reject redirects and enforce
shared MIME rules, a streamed size limit and timeout.

Approval repeats owner, tenant, pending-candidate snapshot and duplicate checks
inside its commit transaction. It creates the STYLE asset and links approval
together. Post-commit cache failure cannot undo success. Upload compensation
may delete only the confirmed newly uploaded namespace-owned object after
checking that it was not persisted; ambiguous outcomes retain the object.

## Growth Action Workflows

Growth reads require current same-tenant membership and the existing Plus/Pro
growth entitlement. Refreshes, campaign generation and event tracking require
current stored owner membership and the existing write gate; AI generation
retains the Pro entitlement. Slugs, IDs, selected references and event metadata
are bounded at the action boundary. Styling defaults, unknown-profile fallback,
draft scheduling and campaign generation rules remain in the owning service.

Campaign commit repeats the exact current owner, tenant opportunity/snapshot,
selected service/package/connection and approved candidate/asset references.
The source opportunity's exact status/update snapshot is claimed rather than
introducing an OPEN-only generation policy. Event tracking checks the tenant
campaign and linked references before its write. Approved stored reference
images must match a public Blob URL and the tenant's known storage namespace;
the growth-owned downloader rejects redirects and enforces MIME, timeout and
streamed size limits. An unavailable reference retains prompt-only generation.

## Public Availability Boundary

The six public availability actions validate input before session, rate-store or
query work. Public slugs select public booking data; they never grant protected
tenant access. Anonymous requests use separate endpoint/slug/IP buckets of 60
requests per minute, including category and business-hours reads. The existing
authenticated-user rate-limit bypass remains; it is not a tenant authorization
grant. Shared-store configuration and trusted proxy handling remain necessary
for production abuse protection.

Dates are actual valid `Date` values in years 1000–9998. Service selections and
category lists allow at most 100 entries, quantities 1–100, alternative limits
1–50, slot intervals 5–1440 minutes and provider windows at most 31 days.
Capacity ranges compute at most 90 days with concurrency four, additionally
clamped to the stored booking horizon. Empty service selections retain legacy
behavior. Lookup failures return safe errors; best-effort slot telemetry cannot
replace either a successful result or the original domain failure.

These reads do not reserve capacity or authorize booking writes. Existing
Philippine-date scheduling, category day-of-week/overnight rules, provider
qualification and public business eligibility remain unchanged; this extraction
does not establish a new global timezone or scheduling policy.
Shared alternative search computes at most 90 sequential days, starting at the
later of today or the requested Philippine calendar day, within the stored
horizon. The same budget applies to public lookups and internal booking-rejection
suggestions; it does not restrict valid booking dates to today plus 90 days.
Default count, strictly-later first-day filtering and chronological order remain.
Budget exhaustion returns collected partial/empty advisory suggestions through
the existing array contract, not proof of no capacity over the remaining horizon.
Booking validation retains its original rejection codes and acceptance rules.

## Known Enforcement Debt

`lib/auth/owner-access.ts` provides the reusable owner-capability write guard
used by booking-policy, business-hours, and owner-administration settings. Older owner-sensitive
actions are not all migrated to it; adopting it requires checking each operation's
specific capability and existing product behavior. This write guard must not be
used for read-only access without an explicit subscription-gate decision.
