# Shared People pay settings

## Contract

Make People → Pay settings the main compensation entry point. Reuse one editor,
dated CompensationAgreement records, and the existing compensation command from
redesign simple, government, and legacy Payroll. Employee profile edits must not
overwrite legacy daily rates or commission percentages. Preserve saved payslips,
captured earnings, payments, permissions, and explicit payroll activation/cutover.
No migration, dependency change, or automatic conversion is included.

## Implemented safeguards

- Read one verified tenant employee's compensation only after opening the sheet.
  Require current PAYROLL_MANAGE permission; do not add wages to directory data.
  Use zero-retention private query caching and recheck authorization.
- Use legacy values only as unsaved draft starting values, never as an
  automatically migrated agreement. Preserve legacy rate fields and the existing
  payroll route.
- Append effective-dated agreements, close only the prior covering date range,
  reject scheduled overlaps and changes over published work, and retain revision,
  transaction, audit, and retry-key protection.
- Dismiss valid submissions immediately. Keep the old confirmed rate until the
  server succeeds; retain uncertain/failed drafts in the mounted editor with a
  safe retry key, review action, and explicit reload/discard option.
- Profile creation can hand off to Pay settings only after confirmed account
  creation. Skipping setup does not create a zero-rate agreement.

## Executed verification

Full lint passed with `npm run lint -- --max-warnings=0`. The standalone
`node node_modules/typescript/bin/tsc --noEmit` check passed. Architecture checks
passed with `node scripts/check-boundaries.mjs`.
The final `npm run typecheck` and final targeted ESLint rerun also passed after
the dismissal-test correction.

After the final font-portal and legacy-payroll link changes, targeted ESLint
passed for the shared editor, legacy payroll view/test, People view test, and
browser-flow test. The final isolated `npm run build:app` passed, including
TypeScript and all 127 prerendered pages.

The focused payroll, People, private-read, and compensation-history component/unit
suites were executed. Initial runs encountered a worker startup timeout and two
test-harness issues (a missing QueryClientProvider and an exact label matcher);
the harness issues were fixed and affected tests rerun. A later combined threads
run passed 29 of 31 tests, with two People checks failing during concurrent build
load (one async-read assertion and one 15-second timeout). People was then rerun
alone using forks. No global timeout or dependency configuration was changed.
That rerun passed the new pay-setting checks but exposed an existing availability
test race: an aria-hidden exiting dialog was mistaken for an unmounted dialog.
The test now waits for the overlay DOM to unmount before resuming its draft.
The final isolated People run passed all 11 tests in 20 seconds. Across successful
focused runs, all 81 relevant unit/component tests passed: People (11), shared
editor (6), pay selection/private reads/history guards (8), simple Payroll (19),
government Payroll (11), legacy redesign Payroll (6), payroll preview queries
(11), private employee editor (2), and directory queries (7).

The combined run used:

```powershell
node node_modules/vitest/vitest.mjs run components/payroll/EmployeePaySettings.test.tsx components/dashboard/design-study/OwnerEmployeesStudy.test.tsx components/dashboard/design-study/OwnerPayrollStudy.test.tsx features/payroll/pay-settings.test.ts features/payroll/queries/employee-pay-settings.test.ts features/payroll/v2/pay-settings-save.test.ts --maxWorkers=1 --pool=threads --testTimeout=15000 --reporter=dot
```

The isolated People rerun used:

```powershell
node node_modules/vitest/vitest.mjs run components/dashboard/design-study/OwnerEmployeesStudy.test.tsx --maxWorkers=1 --pool=forks --testTimeout=15000 --reporter=verbose
```

The disposable PostgreSQL simple-payroll integration suite passed all eight
tests, including a dated rate change, idempotent duplicate submission, unchanged
legacy fields, unchanged published statement lines/payments, and rejection of
backdated changes over published work. This uses the existing integration runner:

```powershell
$env:TEST_DATABASE_DISPOSABLE='1'
$env:TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:6543/payroll_simple_test'
$env:DOTENV_CONFIG_PATH='C:/Programming/sfclone/payroll-simple-pg/no-dotenv'
node scripts/run-database-tests.mjs integration test/integration/payroll-simple.integration.test.ts
```

Authenticated read-only checks on the existing development server confirmed the
People menu, shared People/Payroll sheet, separate legacy starting values,
initially disabled Save, mobile rendering, and focus return after Cancel. Checked
320, 390, 639, 768, and 1440px layouts without document horizontal overflow.
Next.js reported no compilation, configuration, or session errors. These checks
did not save rates or otherwise mutate the user's working database.

Production verification uses an isolated source copy at
`C:/Programming/sfclone/pay-settings-verify-20261019-6f65fe`, linked to the existing
dependencies. It contains no copied environment files. Only that copy's
Turbopack root is adjusted to support the dependency junction; the working
repository's configuration and running development build are untouched.

The updated production-browser flow passed: one Chromium test in 3.2 minutes.
It saved an unpaid payslip, recorded a partial payment, changed a rate from People,
read the new record through Payroll's same editor, and compared the unchanged
original statement lines, totals, payments, legacy rate field, and employee
payslip. It also checked mobile rendering, reduced motion, and focus return.

Run from the isolated source copy after its successful production build:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:6543/payroll_simple_test'
$env:TEST_DATABASE_DISPOSABLE='1'
$env:DOTENV_CONFIG_PATH='C:/Programming/sfclone/payroll-simple-pg/no-dotenv'
$env:E2E_SIMPLE_PAYROLL='1'
$env:E2E_USE_PRODUCTION='1'
node node_modules/@playwright/test/cli.js test test/e2e/payroll-simple-flow.spec.ts --workers=1 --reporter=line
```

Repository-wide `git diff --check` also found pre-existing whitespace in generated
Prisma output and `lib/services/outbox-delivery.ts`; these unrelated files were
not changed by this task. The scoped diff check passed. The temporary PostgreSQL
cluster was stopped after verification; the user's development server was left
running. The isolated build/test artifacts remain at the path above.

## Limits

Failed drafts survive dismissal while their employee editor remains mounted;
they are not persisted across route changes or switching to a different employee.
Legacy payroll remains a separate, unchanged payout flow until reviewed cutover.
Saving dated pay settings alone does not activate or migrate payroll.

## Follow-up: automatic prefill

The shared sheet now fills a positive legacy daily rate and its commission when
no dated agreements exist. Current or scheduled saved agreements take priority,
including intentionally saved zero rates. An ambiguous legacy zero default stays
blank. The separate legacy card and Use as starting values button are replaced by
a short source note. Untouched defaults can be saved explicitly or cancelled
without a discard prompt. Merely opening the sheet never saves or activates pay.

Focused verification for this follow-up:

```powershell
node node_modules/vitest/vitest.mjs run components/payroll/EmployeePaySettings.test.tsx components/dashboard/design-study/OwnerEmployeesStudy.test.tsx components/payroll/SimplePayrollWorkspace.test.tsx --maxWorkers=1 --pool=forks --testTimeout=15000 --reporter=verbose
node node_modules/vitest/vitest.mjs run components/payroll/SimplePayrollWorkspace.test.tsx --maxWorkers=1 --pool=forks --testTimeout=15000 --reporter=verbose
npm run typecheck
npm run lint -- --max-warnings=0
```

The first test run passed all 21 editor/People tests, but the Payroll worker failed
to start. Its isolated rerun passed all 19 tests, for 40 distinct passing tests.
After escaping the source note's apostrophe for JSX lint, the final full lint run
passed and all ten shared-editor tests passed again. Typecheck, scoped diff, and
architecture checks passed. Browser checks confirmed the same existing daily rate and
commission from both People and Payroll, no adoption button, desktop/mobile
rendering, no 390px horizontal overflow, and focus return after cancelling
untouched defaults without confirmation. The shared editor appeared in React
introspection; Next.js reported no compilation, configuration, or session errors.
The working database was not mutated.

No new database suite, write-based E2E, or production build was run for this
client-only default/copy change. The earlier production/database results above
belong to the original shared-editor implementation, not this follow-up.
