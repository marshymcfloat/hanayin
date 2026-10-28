# Separate pay dates from employment dates

## Contract

Show only Apply this pay from in the shared Pay settings sheet. Move Joined on
to the People profile. Pay commands must never change employment start/end dates
or saved payslip/payment history. Preserve legacy rate fields, tenant access,
permissions, decimal calculations, revision checks, retry safety, and explicit
payroll activation. No schema, dependency, or database migration changes.

## Scope and decisions

- Payroll schemas/commands, shared editor/draft, legacy compensation form, People
  profile read/write, and focused tests. No unrelated dashboard redesign.
- Ignore employment dates from older pay clients, validate the pay effective date
  against persisted employment bounds, and retain published-work/overlap guards.
- Keep unknown Joined on null. A profile can remain incomplete; unchanged payroll
  readiness rules direct the owner back to People when a verified date is needed.
- Date corrections require EMPLOYEES_MANAGE plus PAYROLL_MANAGE and the reviewed
  financial revision. Profile/account writes and the date audit are atomic.
- Block changing a recorded joining date linked to published or legacy payslips.
  A previously unknown date can be confirmed if it does not exclude recorded work
  or pay terms. Do not expose salary amounts in the profile read model.
- Retain current sheets, transitions, focus handling, error toasts, and explicit
  server-confirmed financial state. No performance benchmark is needed for these
  small guarded reads; no new background request is added to the profile.

## Required verification

Focused unit/component suites for the two editors, pay command/schema, profile
access/read/write, date history guards, and simple/government payroll regressions.
Disposable PostgreSQL tests for separate dates, rollback and preserved payslips.
Lint, typecheck, architecture boundaries, a production build and authenticated
browser flows. Never save changes to the user's working business during browser
inspection. Record exact executed results below; prepared tests are not proof.

## Executed checks

- Focused Vitest command: `node node_modules/vitest/vitest.mjs run
  features/workforce/services/employment-date.test.ts
  features/payroll/v2/pay-settings-save.test.ts features/payroll/pay-settings.test.ts
  components/payroll/EmployeePaySettings.test.tsx
  components/dashboard/design-study/OwnerEmployeesStudy.test.tsx
  features/workforce/queries/owner-employee-editor.test.ts
  components/payroll/SimplePayrollWorkspace.test.tsx
  components/payroll/PayrollWorkspace.test.tsx
  features/workforce/actions/employee-administration.test.ts
  --maxWorkers=1 --pool=forks --testTimeout=15000 --reporter=dot`:
  9 files, 179 tests passed. An earlier exact accessible-label assertion exposed
  the date helper being included in the input name; explicit naming and a linked
  description fixed this. The final action suite also passed all 105 tests after
  adding the explicit financial-revision increment for a joining-date correction.
- Disposable PostgreSQL suites: `pay-employment-dates.integration.test.ts`,
  `payroll-simple.integration.test.ts`, and
  `payroll-simple-setup.integration.test.ts`: 3 files, 13 tests passed. They cover
  separate date writes, legacy payload compatibility, saved financial sources,
  and unchanged setup requirements.
- Final database rerun: `node scripts/run-database-tests.mjs integration
  test/integration/pay-employment-dates.integration.test.ts
  test/integration/payroll-simple.integration.test.ts
  test/integration/payroll-simple-setup.integration.test.ts --maxWorkers=1
  --pool=forks --testTimeout=60000 --reporter=dot`: 13 passed, including the
  joining-date financial-revision increment and stale subsequent correction.
- Production browser flow: `node node_modules/@playwright/test/cli.js test
  test/e2e/payroll-simple-flow.spec.ts --workers=1 --reporter=line`, with
  `E2E_SIMPLE_PAYROLL=1` and `E2E_USE_PRODUCTION=1`: 1 passed in 2.4 minutes.
  The real browser/API/database flow changed Joined on through People, saved an
  unpaid payslip, recorded an installment, then changed pay through the shared
  editor. Database assertions verified unchanged employment dates, legacy rates,
  published lines, net pay, and payment balance. Payroll and employee payslip
  views agreed; reduced motion, mobile overflow, and focus return checks passed.
  Desktop review and mobile payslip screenshots were visually inspected.
- `node scripts/check-boundaries.mjs`: passed. Scoped `git diff --check`: passed.
- Final root `npm run typecheck` and `npm run lint -- --max-warnings=0`:
  both passed after the financial-revision guard was added.
- Isolated `npm run build:app`: passed against the final task source; Next.js
  compiled, completed TypeScript, and generated all 127 static pages. The prior
  successful build of the same task source was used for the production browser
  flow; this final rebuild also passed.
- Authenticated, read-only dev-browser checks: People profile has Joined on with
  an unknown date left blank; Pay settings has only Apply this pay from and
  retains the recorded daily rate and commission. Both sheets were inspected at
  desktop/mobile sizes; 390px had no horizontal overflow, and cancelling returned
  focus to the employee trigger. No live business records were saved.
- The running Next.js diagnostics reported no compilation or runtime errors.

## Verification isolation

Production checks use the existing isolated source snapshot at
`C:/Programming/sfclone/pay-settings-verify-20261019-6f65fe`, with shared installed
dependencies and a test-only Turbopack root adjustment. No `.env` files were read
or copied. This checks this task's source, not every unrelated dirty-worktree
change. The normal dev server and its build output remain untouched.

Database and browser writes use only the explicit loopback disposable PostgreSQL
database `payroll_simple_test` on port 6543. Namespaced fixtures clean themselves
up. No migration or application-data backfill is needed.

The owned disposable PostgreSQL cluster was stopped after verification. Browser
checks closed their owned sessions; the user's normal dev server was left running.
Release validation and unrelated E2E suites were not run: this is a bounded change,
not a release certification.

## Remaining limitation

Correcting a joining date already linked to saved payroll requires a separately
reviewed correction. This task intentionally does not add a correction wizard or
rewrite historical payslips. Unknown joining dates remain unknown; existing
payroll readiness checks can require confirmation in People.
