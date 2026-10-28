# Direct Prisma Usage in UI and Routes

Last inventoried: 2026-09-18

Scope: production pages, layouts, route-local React components, and shared
components importing `@/prisma/prisma`. Tests, Server Actions, and Route
Handlers are tracked separately because they are transport boundaries rather
than React rendering modules.

## Snapshot

Before this cleanup work, 43 React modules imported Prisma directly. The public
directory/storefront, sidebar, dashboard, billing, booking-list, and platform-overview
migrations removed all 43 direct React consumers. Zero React modules remain
with direct Prisma calls. The former adjacent sitemap and component-audit
exceptions have also moved behind feature-owned query and repository modules.

Reproduce the inventory with:

```powershell
rg -l --fixed-strings '@/prisma/prisma' app components |
  Where-Object { $_ -notmatch '\.test\.' }
```

## Resolved in This Slice

| Previous consumer | New owner |
| --- | --- |
| `app/explore/page.tsx` | `features/businesses/public-directory.ts` |
| `app/(public)/[businessSlug]/page.tsx` | `features/businesses/public-directory.ts` |
| `app/(public)/[businessSlug]/services/page.tsx` | `features/businesses/public-directory.ts` |
| `components/dashboard/AppSidebar.tsx` | `features/auth/workspace-navigation.ts` |
| `components/dashboard/owner/OwnerDashboardDataContainer.tsx` | `features/dashboard/queries/owner-dashboard.ts` |
| `components/dashboard/employee/EmployeeDashboardDataContainer.tsx` | `features/dashboard/queries/employee-dashboard.ts` |
| `app/(private)/app/[businessSlug]/billing/page.tsx` | `features/billing/queries/workspace.ts` |
| `app/(private)/app/[businessSlug]/bookings/page.tsx` | `features/bookings/queries/workspace.ts` |
| `app/(private)/platform/page.tsx` | `features/platform/queries/overview.ts` |
| `app/(private)/app/[businessSlug]/employees/EmployeesContent.tsx` | `features/workforce/queries/employees.ts` |
| `app/(private)/app/[businessSlug]/gift-cards/GiftCardsContent.tsx` | `features/gift-cards/queries/workspace.ts` |
| `app/(private)/app/[businessSlug]/owners/OwnersContent.tsx` | `features/businesses/queries/owners.ts` |
| `app/(private)/app/[businessSlug]/packages/PackagesContent.tsx` | `features/catalog/queries/packages.ts` |
| `app/(private)/app/[businessSlug]/customers/page.tsx` | `features/customers/queries/workspace.ts` |
| `app/(private)/app/[businessSlug]/services/ServicesContent.tsx` | `features/catalog/queries/services.ts` |
| `app/(private)/app/[businessSlug]/vouchers/VouchersContent.tsx` | `features/catalog/queries/vouchers.ts` |
| `app/(private)/app/[businessSlug]/payroll/PayrollContent.tsx` | `features/payroll/queries/workspace.ts` |
| `app/(private)/app/[businessSlug]/growth/page.tsx` | `features/growth/queries/planner.ts` |
| `app/(private)/app/[businessSlug]/reports/page.tsx` | `features/reports/queries/workspace.ts` |
| `app/(private)/app/[businessSlug]/sale-events/page.tsx` | `features/catalog/queries/sale-events.ts` |

The feature module now owns directory eligibility, tenant-scoped storefront
queries, active sale-window selection, and LocalBusiness schema mapping. The
previous sitemap and component-adjacent audit exceptions are also resolved.

## Remaining React Modules

None. The dependency allowlist is empty and the boundary check rejects any new
direct Prisma import from a page, layout, or React component.

## Adjacent Boundary Debt

- Zero production feature action modules import the runtime Prisma client.
  Their allowlist in `scripts/architecture-boundaries.json` is empty; new
  imports fail the boundary check. Generated Prisma type and enum imports do
  not count as persistence access. Validation/authentication/delegation adapters
  retain existing public contracts; database/provider workflows belong to
  feature-owned queries and services.
- Eight production Route Handlers import Prisma directly. Direct access is
  acceptable only while the handler is a thin adapter. They are tracked by the
  same shrinking allowlist, and workflow logic must move to the owning feature
  service.
- The four former Prisma-backed `app/actions/*.ts` modules now live in their
  owning workforce, businesses, and platform-onboarding features.
- Platform audit actions and persistence now live under
  `features/platform/audit/`.
- Owner notification-history reads now use
  `features/notifications/queries/history.ts`, scoped by current verified owner
  identity. The action validates pagination and notification-only event filters;
  returned DTOs omit raw payloads and internal delivery errors.
- Password changes use a feature-owned credential service with an atomic
  credential-version claim. Employee-picker and internal booking-note actions
  consume tenant-scoped feature query DTOs rather than accessing Prisma.
- Report-read actions require current verified owner membership and delegate
  range parsing, shared report-query invocation, and telemetry to
  `features/reports/services/core-report.ts`.
- Booking-policy and business-hours actions validate transport input and delegate
  persistence to their owning feature services. Both use the shared owner
  capability write guard, tenant-scoped permission predicates, and transactional
  audit records. Business hours no longer commit separate 25-entry batches.
- Owner permission replacement and primary-owner switching use
  `features/workforce/services/owner-administration.ts`. The action only validates,
  obtains verified owner settings access, invokes the use case, and invalidates
  cache after a committed change.
- Catalog service CRUD and package graph replacement use feature-owned
  administration services with validated transport input, verified tenant targets,
  and same-tenant references checked inside Serializable transactions. Their
  shared catalog-access helper repeats current membership, role, and staff
  capability checks without redefining existing default grants.
- Expense actions delegate to audited financial use cases and narrow tenant
  queries. Today summaries aggregate the full local day independently of the
  five-entry recent display list.
- Booking detail uses a narrow tenant-owned query and preserves the lazy panel's
  ISO/null date and display payload contract without selecting raw user records.
- Customer search, duplicate matching, history and administration now use
  customer-owned queries and services. Current tenant membership constrains
  parent and nested reads; update and its scoped reload share one transaction.
- Sale-event actions use catalog-owned validation, queries and creation/commit
  services. Public active-sale reads remain public and expose tenant-filtered
  reference IDs and slot counts; internal reads require current membership.
- Brand-asset actions use asset-owned validation, queries and lifecycle services.
  Settings mutations enforce the stored owner capability, with Blob I/O outside
  bounded database transactions and compensation only for failed persistence.
- Voucher actions use catalog-owned validation, tenant administration queries
  and services, and an advisory public-verification policy. Public verification
  never reserves or redeems a voucher; global code uniqueness remains enforced
  by the existing database constraint.
- Business profile and growth settings use a single permission-checked
  transaction. QR processing and Blob uploads stay outside locks; only newly
  uploaded objects are candidates for best-effort failure compensation.
- Booking add-on actions delegate mode selection and race fallback to a named
  orchestration service. Transaction-bound checks repeat current actor access,
  initiator and references. Follow-up booking creation and its two audits share
  the existing booking-persistence transaction through internal hooks.
- The unused legacy attendance-count stub was removed; authenticated attendance
  counting remains in the canonical workforce action and tenant-scoped query.
- Public booking availability uses validated thin actions and server-only booking
  services/queries. Provider overlap reads select assignment fields only; hours
  reads select the existing seven scalar display fields. Capacity ranges have a
  hard 90-day cap and at most four concurrent day computations, independently of
  the stored booking horizon. Results remain advisory, not reservations.
- Dashboard pending and owner-claimed queues use verified actor contexts and
  narrow feature queries with current membership and nested tenant predicates.
  Owner-specialty administration lives in workforce services, protected by
  current `SETTINGS_MANAGE` and an audited conditional transaction.
- `app/sitemap.ts` now consumes `features/businesses/queries/public-sitemap.ts`.
- Owner claim/unclaim commands use
  `features/dashboard/services/owner-queue-claims.ts`, with verified owner context,
  transaction-bound pricing, scoped overlap diagnostics, snapshot-conditional
  writes and atomic audits. Owner serve/undo commands use
  `features/dashboard/services/owner-queue-serving.ts`, sharing owner membership/
  reference predicates and a tenant-scoped completion helper. Service status,
  optional booking state/customer-trust changes and verified status audits commit
  together; the scalar result is reloaded through verified scope. Permanent
  deletion now delegates to `features/bookings/services/booking-deletion.ts`,
  repeating current owner/tenant and malformed foreign-backlink checks while
  retaining existing valid cascades and deletion policy.
- Booking no-show handling uses
  `features/bookings/services/booking-no-show.ts`, reusing the transaction-injected
  tenant actor resolver and current effective no-show capability. Conditional
  parent status and customer counter/date/trust changes commit with verified
  audits; payment and general cancellation policy are unchanged.
- Manual booking completion uses
  `features/bookings/services/booking-status.ts` and shared booking-command access
  predicates. Current `BOOKING_MODIFY`, active ACCEPTED/PAID state, tenant-owned
  references and finished/cancelled work constrain the audited conditional
  parent write. Money, payroll, services and customer trust are unchanged;
  automatic service completion remains payment-independent. Generic cancellation
  is rejected and the booking list reuses the canonical reason-required dialog.

- Self-service attendance delegates current-member/self reads and conditional
  clock commands to workforce queries/services. Owner subscription commands
  delegate upgrades and manual-reference/outbox commits to billing services;
  expired tenants retain renewal access. Legacy invoice-helper concurrency and
  authorization-revocation debt remains separately documented.
- Employee administration delegates tenant-scoped DTO queries, account/employee
  commands, credentials and atomic schedule replacement to workforce services.
  Reference-candidate pilot actions delegate provider discovery, trusted image
  download, conditional approval and narrowly owned Blob compensation to social
  services.
- Growth actions delegate snapshot/opportunity/event and campaign orchestration
  to growth-owned services. Long provider work remains outside bounded commit
  transactions. Delegated legacy snapshot/detector helpers retain separate
  transaction and revocation debt; zero action Prisma imports does not prove
  every legacy writer is atomic or every Route Handler is thin.

## Migration Rule

Migrate one coherent feature slice at a time. Add characterization tests, move
query/policy code to the owner, update every consumer, then verify that the
consumer no longer imports Prisma. Do not create generic pass-through database
helpers solely to reduce the import count.

Reproduce the runtime-boundary inventories with:

```powershell
rg -l --fixed-strings '@/prisma/prisma' features -g '**/actions/*.ts' -g '!**/*.test.ts'
rg -l --fixed-strings '@/prisma/prisma' app/api -g '**/route.ts'
```
