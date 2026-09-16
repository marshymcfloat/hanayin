# Harness Engineering TODO

Last updated: 2026-09-16

Update this checklist as work is completed. Add links to pull requests or
decision records where useful.

## 1. Repository Guidance

- [x] Create the root `AGENTS.md`.
- [x] Review `AGENTS.md` after the first three agent-assisted changes and refine
  any unclear rules.
- [x] Add nested `AGENTS.md` files only where a directory needs rules that differ
  from the repository root.
- [x] Create `ARCHITECTURE.md` describing the current state, target state, system
  boundaries, and data flow.
- [x] Create `IDEAS.md` for unapproved ideas, experiments, and open questions.
- [x] Create `docs/decisions/` and an Architecture Decision Record template.
- [x] Update `README.md` so setup steps, environment guidance, scripts, and
  project structure match the repository.
- [x] Create a safe `.env.example` containing placeholders only.

## 2. Repository Structure

- [x] Inventory every top-level directory and assign an owner or purpose.
- [x] Adopt `features/<domain>/` as the canonical location for domain services,
  schemas, types, and tests.
- [x] Resolve overlap between `features/` and `lib/features/`.
- [x] Migrate `lib/server actions/` into feature-owned action boundaries.
- [ ] Extract remaining business logic from migrated `features/*/actions/`
  modules until the Server Action adapters are thin.
- [x] Migrate `lib/zod schemas/` into the owning feature modules or shared
  validation infrastructure.
- [x] Migrate `lib/next auth/` to a directory without spaces.
- [x] Consolidate `test/` and `tests/` under a documented test structure.
- [x] Review temporary cleanup scripts such as `remove_wave.js` and
  `remove_wave2.js`; document, relocate, or remove them.
- [x] Confirm generated and local artifacts remain excluded from Git.

## 3. Validation Harness

- [x] Add a single `npm run check` command for lint, typecheck, unit tests, and
  the production application build.
- [x] Keep local verification and CI commands aligned.
- [x] Document which tests require PostgreSQL or external services.
- [x] Separate fast isolated tests from database integration tests.
- [x] Add deterministic test factories and seed data for shared workflows.
- [x] Improve missing-environment-variable errors for database and E2E commands.
- [x] Decide whether to add a pre-commit or pre-push hook after measuring local
  check duration.
- [x] Define and document coverage expectations by risk area.

## 4. Architecture Boundaries

- [x] Document the required flow from boundary validation through authorization,
  domain logic, persistence, and response mapping.
- [x] Inventory direct Prisma usage in pages and React components.
- [x] Move feature-specific business logic out of UI and routing modules.
  - [x] Move the public directory and storefront query/mapping slice into
    `features/businesses/public-directory.ts`.
  - [x] Move legacy-session workspace resolution out of the shared sidebar into
    `features/auth/workspace-navigation.ts`.
  - [x] Extract owner/employee dashboard data and mapping into
    `features/dashboard/queries/`.
  - [x] Extract billing and booking-list workspace queries into their features.
  - [x] Extract platform overview queries and KPI aggregation with an explicit
    platform-admin guard.
  - [x] Extract employee, gift-card, owner, package, customer, service, voucher,
    payroll, growth, report, and sale-event workspace queries.
  - [x] Migrate the remaining slices in the order recorded in
    `docs/prisma-ui-inventory.md`.
- [x] Define transaction boundaries for multi-write workflows.
- [x] Document tenant isolation invariants for every tenant-owned model.
- [x] Document role and permission enforcement using the existing permission
  matrix.
- [x] Inventory payment, email, storage, social, cron, and monitoring
  integrations, including failure and retry behavior.
- [x] Add automated dependency-boundary checks after the target modules are
  established.

## 5. Incremental Cleanup

- [x] Create a prioritized cleanup backlog with risk, effort, and affected
  feature for each item. See `docs/harness-engineering-cleanup-backlog.md`.
- [x] Add characterization tests before changing fragile legacy behavior.
- [x] Migrate one bounded feature at a time instead of performing a repository-wide
  rewrite.
- [x] Remove unused files and dependencies only after usage checks and tests.
- [x] Record significant structural decisions in `docs/decisions/`.
- [x] Review this checklist and architecture documentation monthly.

## Progress Log

| Date | Change | Evidence |
| --- | --- | --- |
| 2026-09-06 | Added repository-wide agent instructions | `AGENTS.md` |
| 2026-09-06 | Refined root guidance and added Prisma/test rules | `AGENTS.md`, `prisma/AGENTS.md`, `test/AGENTS.md` |
| 2026-09-06 | Documented current and target system architecture | `ARCHITECTURE.md` |
| 2026-09-06 | Captured product, brand, social automation, and quality ideas | `IDEAS.md` |
| 2026-09-06 | Added the ADR workflow, index, and reusable template | `docs/decisions/` |
| 2026-09-06 | Reconciled setup, environment, commands, routes, and repository guidance | `README.md` |
| 2026-09-06 | Added a tracked, placeholder-only environment template | `.env.example` |
| 2026-09-06 | Inventoried directories and consolidated feature modules under `features/` | `docs/repository-structure.md`, `features/` |
| 2026-09-06 | Migrated legacy actions, schemas, auth, and tests; removed temporary scripts; excluded local artifacts | `features/`, `test/`, `.gitignore` |
| 2026-09-07 | Unified local and CI checks and separated isolated, integration, and E2E suites | `package.json`, `.github/workflows/ci.yml`, `docs/testing.md` |
| 2026-09-07 | Added deterministic shared workflow factories and reused them in database/browser fixtures | `test/factories/shared-workflows.ts`, `test/integration/`, `test/e2e/` |
| 2026-09-07 | Added actionable database/E2E environment guards, risk-based coverage expectations, and the measured no-hook decision | `scripts/require-env.mjs`, `docs/testing.md` |
| 2026-09-07 | Defined the application boundary contract and inventoried direct Prisma access in React rendering modules | `docs/application-boundaries.md`, `docs/prisma-ui-inventory.md` |
| 2026-09-07 | Moved public directory/storefront persistence and schema mapping from pages into the businesses feature | `features/businesses/public-directory.ts` |
| 2026-09-07 | Documented transaction, tenant, authorization, and external-integration invariants | `docs/transaction-boundaries.md`, `docs/tenant-isolation.md`, `docs/authorization.md`, `docs/integration-inventory.md` |
| 2026-09-07 | Added a tested dependency-boundary ratchet and migrated sidebar persistence into the auth feature | `scripts/check-boundaries.mjs`, `features/auth/workspace-navigation.ts` |
| 2026-09-07 | Extracted owner/employee dashboard, billing, booking-list, and platform overview loaders; reduced the React Prisma allowlist to 34 modules | `features/dashboard/queries/`, `features/billing/queries/`, `features/bookings/queries/`, `features/platform/queries/`, `docs/prisma-ui-inventory.md` |
| 2026-09-06 | Migrated action, validation, auth, and test paths; removed temporary scripts and untracked generated reports | `features/`, `test/`, `.gitignore` |
| 2026-09-13 | Prioritized the remaining cleanup into bounded, risk-ranked feature slices with verification requirements | `docs/harness-engineering-cleanup-backlog.md` |
| 2026-09-13 | Thinned the manual GCash actions into validated adapters, tenant-scoped queries, and transactional payment services | `features/payments/`, `features/payments/actions/manual-gcash.test.ts` |
| 2026-09-13 | Thinned booking-modification actions and moved transactional workflows and pure policies into the bookings feature | `features/bookings/actions/booking-modify.ts`, `features/bookings/services/` |
| 2026-09-13 | Thinned gift-card actions and added financial/tenant characterization tests around the extracted workflows | `features/gift-cards/actions/gift-cards.ts`, `features/gift-cards/services/` |
| 2026-09-13 | Split social request and publishing actions into stable adapters backed by feature-owned workflow services | `features/social/actions/`, `features/social/services/` |
| 2026-09-13 | Reduced the platform-admin action boundary and added denial coverage across all privileged workflows | `features/platform/actions/platform-admin.ts`, `features/platform/services/` |
| 2026-09-13 | Extracted platform outbox retry/skip workflows with guarded state-transition tests | `features/platform/services/outbox-admin.ts` |
| 2026-09-16 | Extracted platform business creation, suspension, reactivation, and demo-cleanup workflows with deterministic authorization, compensation, and state-transition coverage | `features/platform/services/business-admin.ts`, `features/platform/services/business-admin.test.ts`, `features/platform/actions/platform-admin.test.ts` |
| 2026-09-16 | Began the platform subscription split by extracting trial extension and plan configuration workflows | `features/platform/services/subscription-admin.ts` |
| 2026-09-16 | Extracted employee queue commands and read models from the dashboard action boundary | `features/dashboard/services/employee-queue.ts`, `features/dashboard/queries/employee-actions.ts` |
| 2026-09-16 | Moved tenant audit persistence out of the component layer and added safe filtering and pagination coverage | `features/platform/audit/` |
| 2026-09-16 | Replaced sitemap Prisma access with a narrow public-business query DTO | `features/businesses/queries/public-sitemap.ts`, `app/sitemap.test.ts` |
| 2026-09-16 | Migrated the four legacy Prisma-backed `app/actions` modules into workforce, businesses, and platform-onboarding features | `features/workforce/`, `features/businesses/actions/`, `features/platform/onboarding/` |
| 2026-09-16 | Completed the platform-admin decomposition and removed the monolithic service with focused persistence/state coverage | `features/platform/services/` |
| 2026-09-16 | Closed migration-review regressions for attendance redirects and malformed leave payload validation | `features/workforce/queries/attendance.ts`, `features/workforce/actions/leave-request.ts` |
| 2026-09-16 | Removed the first verified unused dependency group after repository-wide reference checks | `package.json`, `package-lock.json` |
| 2026-09-16 | Accepted the feature-first modular-monolith decision and reconciled architecture inventories during the monthly review | `docs/decisions/0001-feature-first-modular-monolith.md`, `ARCHITECTURE.md`, `docs/prisma-ui-inventory.md` |
| 2026-09-16 | Adopted Linear for active execution tracking while retaining repository documentation as the durable engineering source of truth | `AGENTS.md`, `docs/work-tracking.md`, [Harness Engineering - Phase 2](https://linear.app/serviceflow/project/harness-engineering-phase-2-6975eeac0fea) |
| 2026-09-16 | Added a tested shrinking-allowlist ratchet that blocks new runtime Prisma access in feature actions and Route Handlers | `scripts/check-boundaries-core.mjs`, `scripts/architecture-boundaries.json`, `scripts/check-boundaries.test.ts` |
| 2026-09-16 | Thinned booking creation into a validated/authenticated adapter plus feature-owned tenant, pricing, availability, concurrency, metrics, and transactional persistence services; database/E2E verification is deferred until a disposable `service-flow-test` database exists | `features/bookings/actions/booking.ts`, `features/bookings/services/booking-create.ts`, `features/bookings/services/booking-persistence.ts` |
