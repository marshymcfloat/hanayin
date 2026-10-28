# Harness Engineering Cleanup Backlog

Last reviewed: 2026-09-16

This backlog turns the remaining harness-engineering work into bounded slices.
Complete one coherent slice at a time and preserve observable behavior unless a
reviewed correctness or security fix is explicitly in scope. Track active status,
priority, ownership, and dependencies in Linear (see `docs/work-tracking.md`).
This document records historical evidence and durable completion rules, not
changing execution status.

## Priority Model

- **P0:** Security, tenant isolation, financial correctness, or booking
  concurrency risk.
- **P1:** Large boundary modules, external integrations, or frequently changed
  workflows.
- **P2:** Structural debt with lower immediate production risk.
- **Effort:** Relative estimate for implementation, focused tests, and review:
  S (up to 1 day), M (2-3 days), L (4-5 days), XL (split before starting).

## Ordered Backlog

| Order | Status | Priority | Work item | Risk | Effort | Affected feature | Required evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Done 2026-09-13 | P0 | Thin `features/payments/actions/manual-gcash.ts` by extracting payment decisions and transactional persistence from the Server Action adapter. | Payment state, tenant isolation, duplicate processing, and partial writes. | M | Payments | Added boundary schemas, a tenant-scoped queue query, transactional payment services, and characterization coverage for authorization, valid transitions, stale updates, rejection, escalation, and resolution. Database integration coverage remains a follow-up when the test database is configured. |
| 2 | Done 2026-09-13 | P0 | Thin `features/bookings/actions/booking-modify.ts` into boundary validation, use cases, and repositories without changing public action contracts. | Booking concurrency, pricing, reassignment, rescheduling, and multi-write consistency. | L | Bookings | Centralized validation/authentication/permission adapters; moved transaction workflows and pure policies under `features/bookings/services/`; preserved 115 focused action and policy tests, including stale-state, permission, tenant-scope, and post-success invalidation coverage. Database/E2E verification remains environment-dependent. |
| 3 | Done 2026-09-13 | P0 | Extract gift-card issuance, redemption, balance, and audit workflows from `features/gift-cards/actions/gift-cards.ts`. | Financial balance integrity, replay, and tenant leakage. | L | Gift cards | Moved persistence and delivery orchestration to `features/gift-cards/services/gift-cards.ts`; added characterization tests for cross-tenant listing/update denial, tenant-scoped catalog selection, and compare-and-set duplicate-claim prevention. Database integration remains environment-dependent. |
| 4 | Done 2026-09-13 | P1 | Split `features/social/actions/social-post-requests.ts` and `features/social/actions/social.ts` into request lifecycle, publishing, provider adapters, and retry-safe delivery services. | External provider failure, duplicate publication, entitlement enforcement, and unsafe retries. | XL; split into request and publishing slices | Social | Reduced both action modules to stable wrappers; moved request lifecycle and publishing orchestration under `features/social/services/`; retained dedicated delivery adapters and 40 focused tests covering permissions, rate limits, state transitions, draft failures, reference-image failures, and publishing eligibility. |
| 5 | Done 2026-09-16 | P1 | Decompose `features/platform/actions/platform-admin.ts` by admin workflow and move Prisma access behind platform queries/repositories. | Broad privileged access, cross-tenant operations, and oversized change surface. | XL; split by workflow | Platform | Removed the monolithic service and split all 23 workflows across business, subscription, invoice, referral, onboarding, impersonation, and outbox services with a shared audit logger. Authorization plus 42 focused platform-service tests cover state transitions, stale requests, compensation, payments, provider delivery, deterministic owner selection, audit logging, and invalidation. |
| 6 | Implemented 2026-09-16 | P1 | Extract employee-dashboard queue commands and read models from `features/dashboard/actions/employee.ts`; keep read models in `features/dashboard/queries/`. | Role enforcement, queue state, payment handling, and mixed read/write concerns. | L | Dashboard | Four queue commands live in `features/dashboard/services/employee-queue.ts` and three read models in `features/dashboard/queries/employee-actions.ts`. The residual membership lookup now lives in `queries/employee-membership.ts`, constrained by verified employee, business, and user IDs with an ID/specialties-only selection. Adapters retain authentication, permissions, safe errors, and cache invalidation; no direct runtime Prisma import remains. |
| 7 | Done 2026-09-16 | P1 | Move the four legacy `app/actions/*.ts` modules identified by the Prisma UI inventory into their owning features and thin the adapters. | Inconsistent boundary validation and feature ownership. | M | Workforce, businesses, leave, platform onboarding | Migrated attendance and leave workflows under `features/workforce/`, business location under `features/businesses/`, and public applications under `features/platform/onboarding/`; removed all four legacy modules and added 33 focused tests covering validation, authentication, authorization, tenant scope, transitions, rate limits, and concurrency. |
| 8 | Done 2026-09-16 | P1 | Move `components/audit/audit-actions.ts` into the platform/audit feature and separate its UI, action, and persistence concerns. | Privileged audit access from a component-adjacent module. | S | Platform/audit | Split action, repository, and DTO types under `features/platform/audit/`; 11 focused action/repository/UI tests cover access denial, safe selection, filtering, limit clamping, and cursor pagination. |
| 9 | Done 2026-09-16 | P2 | Replace direct Prisma access in `app/sitemap.ts` with a public-business query DTO. | Architectural regression and accidental exposure of unpublished tenants. | S | Businesses/SEO | Added `features/businesses/queries/public-sitemap.ts`; four focused tests cover eligible subscription states, website entitlement, empty results, ordering, and service routes. |
| 10 | Recurring; group completed 2026-09-16 | P2 | Review unused files and dependencies using import, script, and runtime usage checks; remove only one verified group per change. | Removing dynamically loaded or operationally invoked code. | S per group | Repository-wide | Removed unused direct dependencies `@tanstack/react-table` and `react-icons` after confirming zero source, config, test, or script references; verified with the repository check gate. Continue reviewing one verified group per change. |
| 11 | Recurring; review completed 2026-09-16 | P2 | Record significant structural decisions and perform the monthly harness/architecture review. | Documentation drifting from implementation. | S | Repository-wide | Recorded ADR-0001, refreshed architecture and repository verification dates, and reconciled the Prisma inventory with completed migrations. Repeat monthly or after a material architectural change. |

## Execution Rules

For each backlog item:

1. Confirm the action's current callers, exports, persistence operations, and
   tests before editing.
2. Add characterization tests for fragile or unverified behavior first.
3. Preserve the public action contract unless a coordinated caller migration
   is explicitly included.
4. Move domain decisions to feature use cases and Prisma access to feature
   queries or repositories. Keep authentication, input parsing, response
   mapping, and cache invalidation at the boundary.
5. Make tenant scope and transaction boundaries visible in the extracted code.
6. Run the focused tests, strict lint, and typecheck. Run database integration,
   E2E, or production build checks when required by `docs/testing.md`.
7. Update the Linear issue with verification evidence and a pull request or
   commit link when available. Update repository documents only when durable
   guidance or the implemented architecture changes.

## Definition of Done for Thin Actions

- Untrusted input is validated at the boundary.
- Authentication and authorization occur before protected persistence.
- Tenant identity comes from verified server context.
- The adapter invokes a named feature use case instead of implementing the
  workflow.
- Multi-write outcomes use an explicit transaction.
- Returned data and errors are safe, stable, and serializable.
- Relevant cache invalidation happens only after a successful write.
- Characterization, unit, and risk-appropriate integration tests pass.
