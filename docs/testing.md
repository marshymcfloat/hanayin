# Test Structure

Last verified: 2026-09-07

## Test Layers

| Layer | Location | Command | Dependencies |
| --- | --- | --- | --- |
| Unit and component | Colocated `*.test.ts` and `*.test.tsx` files | `npm run test:unit` | No live database or third-party services; external boundaries must be mocked. |
| PostgreSQL integration | `test/integration/**/*.integration.test.ts` | `npm run test:integration` | Direct PostgreSQL connection through `DIRECT_DATABASE_URL`; committed migrations must already be applied. |
| Core browser smoke | Selected files under `test/e2e/` | `npm run test:e2e:core` | Chromium and the local Next.js server. The owner-growth flow additionally needs a direct database URL when `E2E_OWNER_FLOW=1`. |
| Public booking browser smoke | `test/e2e/public-booking-smoke.spec.ts` | `npm run test:e2e:db` | Chromium, local Next.js server, migrated PostgreSQL, and `DIRECT_DATABASE_URL` or `E2E_DATABASE_URL`. |
| Opt-in feature browser tests | `test/e2e/booking-editor.spec.ts`, `test/e2e/social-post-request.spec.ts` | Run the relevant Playwright file directly | Staging-style role credentials and feature-specific enable variables documented in each test file. |

Unit tests and PostgreSQL integration tests use separate Vitest configurations.
The default `npm test` and `npm run test:unit` commands exclude
`test/integration/`, so a missing database cannot silently turn an intended
integration run into a passing skipped test.

## Quality Commands

- `npm run check`: strict lint, typecheck, isolated unit/component tests with
  coverage, and the production application build. This is the standard local
  and CI quality gate.
- `npm run test:integration`: database integration tests only. It fails before
  Vitest starts if `DIRECT_DATABASE_URL` is missing.
- `npm run test:e2e`: core and database-backed browser smoke suites. It requires
  direct database configuration.
- `npm run verify:release`: the standard quality gate, database integration,
  browser smoke suites, migration deployment, and release build.

CI provisions PostgreSQL, applies committed migrations, then executes the same
`npm run check` and `npm run test:integration` commands used locally. Browser
smoke tests run in the separate `e2e_smoke` job.

No automated test may call production data or live email, SMS, social, AI,
storage, monitoring, or rate-limit providers. Use deterministic mocks or a
purpose-built non-production test environment.

## Deterministic Factories and Seed Data

Shared workflow records live in `test/factories/shared-workflows.ts`. Call
`createSharedWorkflowFactory({ namespace, now })` and use either an individual
record factory or `sharedWorkflowSeed()` for a related business, owner,
employee, customer, service, and booking graph.

- Defaults use a fixed UTC clock and stable identifiers; factories never read
  wall-clock time or generate random values.
- Pass a stable namespace when suites share a database. Clean that namespace
  before setup and after teardown so interrupted runs remain repeatable.
- Override only fields relevant to the behavior under test. Do not copy whole
  fixture objects into feature tests.
- Database and E2E tests materialize only the records they need. The shared
  seed is data, not an automatic global seed, so suites remain independent.

## Environment Failures

Database commands validate their prerequisites before starting a runner:

- `test:integration` requires `DIRECT_DATABASE_URL`.
- `test:e2e:db` and `test:e2e` accept `E2E_DATABASE_URL` first, then
  `DIRECT_DATABASE_URL`.
- Database test URLs must begin with `postgresql://` or `postgres://`; Prisma
  Accelerate URLs are rejected because these suites use a direct `pg` client.
- Never point database integration or database-backed E2E commands at the
  persistent `service-flow-dev` database. It is shared by local development and
  staging. Keep these suites skipped until a dedicated, disposable
  `service-flow-test` database is configured and migrated.

Missing-variable errors name the command, required alternatives, `.env.local`
setup path, and the isolated/migrated database requirement. Use
`.env.example` as the placeholder-only reference.

## Coverage Expectations by Risk

Coverage supports review; it does not replace behavioral assertions. Every
changed branch in a critical invariant needs a test even when a percentage is
already met.

| Risk area | Required evidence for changed behavior | Target for changed domain files |
| --- | --- | --- |
| Critical: authentication, authorization, tenant isolation, payments, booking concurrency, migrations | Unit tests for decisions and failure paths, plus integration/E2E proof at the real boundary | At least 90% lines and 85% branches |
| High: booking state changes, payroll, billing, external-delivery retries, audit/outbox writes | Unit tests plus an integration test for persistence or provider boundaries | At least 85% lines and 80% branches |
| Medium: validation, pricing transforms, queries, reusable interactive components | Unit or component tests covering success, invalid input, empty state, and errors as applicable | At least 80% lines and 75% branches |
| Low: presentational components, static metadata, documentation | Focused rendering test when logic exists; visual/manual review is acceptable for static changes | At least 70% lines and 60% branches when instrumented |

The enforced repository floor in `vitest.config.ts` remains 60% statements,
55% branches, 70% functions, and 60% lines over the explicitly instrumented
high-value modules. New or materially changed risk-bearing modules should be
added to that include list. Coverage exclusions require a reviewable reason;
generated code, declarations, fixtures, and test files remain excluded.

## Git Hook Decision

No pre-commit or pre-push hook is installed. On 2026-09-07, an initial local
`npm run check` reached a type error after 166.4 seconds. After correction, the
successful lint, typecheck, unit/coverage, and production-build stages took more
than nine minutes in aggregate. Automatically blocking every commit or push for
that duration would discourage small commits and duplicate the required CI
gate. Developers should run focused tests while editing and
`npm run check:push` before opening or updating a pull request; CI remains the
authoritative full gate. Reconsider a hook if a reliable staged-file check can
finish in under 30 seconds or the full gate becomes materially faster.
