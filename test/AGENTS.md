# Test Harness Instructions

These instructions extend the repository root `AGENTS.md` for `test/`.

## Test Types

- Keep Playwright browser tests under `test/e2e/`.
- Keep tests that require a real PostgreSQL instance under `test/integration/`.
- Keep shared Vitest setup in `test/setup.ts`.
- Colocate ordinary unit and component tests with their source as
  `*.test.ts` or `*.test.tsx`.

## Isolation and Reliability

- Make tests deterministic. Do not depend on execution order, wall-clock timing,
  production data, or live third-party services.
- Create unique records for database tests and clean them up even after partial
  failures where practical.
- Reuse `test/factories/shared-workflows.ts` for common business, actor,
  customer, service, and booking data. Use fixed namespaces and clocks; add a
  domain factory only when the shared graph cannot express the behavior.
- Never use real credentials or customer data in fixtures, screenshots, traces,
  or logs.
- Prefer user-visible behavior and stable roles or labels in Playwright tests.
  Avoid brittle CSS selectors and arbitrary sleeps.
- Preserve Playwright traces and reports for failed CI runs; do not commit those
  artifacts.

## Running Tests

- Run focused Vitest files with `npx vitest run <path>`.
- Run core browser smoke tests with `npm run test:e2e:core`.
- Run the database-backed public booking smoke test with
  `npm run test:e2e:db` only when the required database environment is ready.
- Do not treat a skipped database test as proof that database behavior passed.
