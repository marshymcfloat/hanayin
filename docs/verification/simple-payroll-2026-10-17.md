# Simple payroll verification — 2026-10-17

Scope: simple/government calculation policies, explicit cutover, reviewed payslip
saving, manual amounts, actual payments, redesign sheets, and employee payslips.
See [ADR 0004](../decisions/0004-simple-payroll-calculation-policy.md) and the
[operating guide](../payroll-operations.md).

## Executed checks

- `npx prisma validate` and `npx prisma generate`: passed.
- `npx prisma migrate deploy`: additive migration applied to the authorized
  development database and a separately provisioned disposable PostgreSQL 17
  database. No production migration or business activation was performed.
- `npm run lint -- --max-warnings=0`: passed. Targeted ESLint was rerun after
  the last component and browser-spec changes and also passed.
- `npm run typecheck`: passed after the final application changes.
- `npm run build:app`: passed after the responsive payslip fix.
- `git diff --check`: passed for the scoped tracked changes.

Broader focused tests: 29 files, 241 tests passed. Final component, recovery,
focus, loading, and reconciliation regression run: 6 files, 37 tests passed.
These are overlapping runs, not additive test counts.

```text
npx vitest run features/payroll components/payroll components/dashboard/owner-preview/OwnerPayrollPreviewQuery.test.tsx components/dashboard/design-study/OwnerPayrollStudy.test.tsx --maxWorkers=1 --pool=threads
npx vitest run components/payroll features/payroll/v2/legacy-reconciliation.test.ts components/dashboard/design-study/OwnerPayrollLoading.test.tsx --maxWorkers=1 --pool=threads
```

Real PostgreSQL integration: 5 files, 31 tests passed, using the explicit
verified disposable target and `TEST_DATABASE_DISPOSABLE=1`.

```text
node scripts/run-database-tests.mjs integration test/integration/payroll-simple.integration.test.ts test/integration/payroll-simple-setup.integration.test.ts test/integration/payroll-lifecycle.integration.test.ts test/integration/payroll-salary-bases.integration.test.ts test/integration/payroll-benefit-sources.integration.test.ts --maxWorkers=1 --pool=threads
```

Authenticated production-browser flow: passed with `E2E_SIMPLE_PAYROLL=1`,
`E2E_USE_PRODUCTION=1`, and the same disposable database guard.

```text
npx playwright test test/e2e/payroll-simple-flow.spec.ts --workers=1 --reporter=line
```

The browser checked manual evidence, immediate sheet dismissal, unpaid
publication, a partial payment, focus return, fixed source lines, mobile and
reduced-motion behavior, amount fitting, and the employee's identical payslip.
Desktop and mobile screenshots were inspected. No browser runtime errors were
reported. All financial browser writes used synthetic fixture-owned records.

The development route was also inspected read-only with a restored owner session.
Next.js MCP reported no compilation, configuration, or session errors; the React
tree confirmed the simple workspace and matching loading component. The existing
business remained unactivated.

Build/browser verification used an isolated source copy excluding every `.env*`
file, synthetic authentication, and disabled live providers. Its dependency
junction required a common-ancestor Turbopack root only in that temporary copy.
The application configuration was not changed. This does not certify production
Sentry release instrumentation or independently certify government payroll rules.

## Follow-up boundary check

The stale `app/api/reports/export/route.ts` exception was subsequently removed
from `scripts/architecture-boundaries.json`: the route no longer imports Prisma
directly. `npm run check:boundaries` now passes, as do all six tests from
`npx vitest run scripts/check-boundaries.test.ts --maxWorkers=1 --pool=threads`.
No route behavior or boundary enforcement was changed.

Full release verification and production deployment were not performed; neither
was requested, and production requires separately verified database and
deployment configuration.

The host blocked removal of the temporary verification build at
`C:/Programming/sfclone/payroll-simple-verify/.next`. It remains on disk and can
be regenerated; disk space remains low (about 0.5 GB free at handoff). The
disposable PostgreSQL server was stopped. The application's running development
server and its cache were left intact.
