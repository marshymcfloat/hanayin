# Direct Prisma Usage in UI and Routes

Last inventoried: 2026-09-16

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

- Thirty-three production feature action modules import the runtime Prisma
  client. They are a reviewed, shrinking allowlist in
  `scripts/architecture-boundaries.json`; new imports and stale entries fail the
  boundary check. Generated Prisma type and enum imports do not count as
  persistence access.
- Eight production Route Handlers import Prisma directly. Direct access is
  acceptable only while the handler is a thin adapter. They are tracked by the
  same shrinking allowlist, and workflow logic must move to the owning feature
  service.
- The four former Prisma-backed `app/actions/*.ts` modules now live in their
  owning workforce, businesses, and platform-onboarding features.
- Platform audit actions and persistence now live under
  `features/platform/audit/`.
- `app/sitemap.ts` now consumes `features/businesses/queries/public-sitemap.ts`.

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
