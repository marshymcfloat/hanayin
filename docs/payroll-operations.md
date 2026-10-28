# Payroll operation, certification, and cutover

The accepted ownership and retention decision is [ADR 0003](decisions/0003-immutable-payroll-and-workforce-ledger.md). Payroll commands live in `features/payroll/v2`; workforce facts live in `features/workforce`. Routes and actions adapt those commands. PostgreSQL migrations enforce the financial invariants even when a legacy writer changes a source.

## Financial invariants

### Simple pay tracking

The default calculation policy for new settings is `SIMPLE`. Existing settings
and historical runs retain `GOVERNMENT`; applying the migration does not activate
or change a business. The policy is frozen on each run. See [ADR 0004](decisions/0004-simple-payroll-calculation-policy.md).

Simple setup needs a pay schedule, tracking start date, and effective employee
pay terms. Save setup, reconcile prior payslips, configure missing pay terms, and
explicitly start tracking. Government IDs, statutory openings, and rule packages
are not prerequisites. Government setup remains under Payroll settings.

Legacy reconciliation preserves the historical display name separately from a
versioned financial fingerprint. Renaming employees or reordering linked sources
does not invalidate new checkpoints; changing amounts, paid status, dates, or
source allocations blocks cutover. Older checkpoints keep their original evidence
format and compare using the preserved name, without rewriting their history.

Daily and hourly pay use verified work; monthly simple pay accrues over calendar
days, with reviewed absence shares removed. Additions/deductions require a label,
signed amount, reason, and recorded author. Automatic statutory premiums,
contributions, benefits, and tax are not calculated; record externally calculated
amounts manually where needed. Missing calculations are never treated as exemptions.

Saving a reviewed payslip creates a balance due. Record actual payments
independently, or use the atomic save-and-record-payment command. A zero-balance
simple statement says No payment due without inventing a payment. Corrections
create linked additions/deductions in a later or extra-pay run.

Government upgrades require an effective date, reviewed opening information
including earlier simple payments, complete profiles and certified rules. Existing
simple runs retain their policy. Agency files fail explicitly when the selected
month contains simple records; review registers show that coverage gap.

- A completed service captures its commission agreement, percentage, and price basis. Zero is a valid basis. Full customer payment establishes its payable date; payment status alone is insufficient.
- Confirmed daily work receives full daily pay, including late arrival. Incomplete clocks need reviewed evidence. Hourly work and premiums require actual intervals and reviewed breaks. Leave approval allocates eligible dates; it does not create future attendance.
- Amounts use decimal arithmetic and decimal-string transport. Stored money uses two decimal places; captured rates and bases retain six. Calculation uses half-up rounding. Allocation carries residual cents to the final eligible allocation so statements and settlements reconcile exactly.
- Draft review binds source revisions, compensation, opening/monthly context, and rules. Changed facts require recalculation and fresh approval. An earning can belong to only one statement.
- Publication fixes the statement, lines, and assessments and creates its employee notification transactionally. Publication establishes a balance due. External payments independently settle it as `UNPAID`, `PARTIAL`, or `PAID`.
- A published source correction creates a proposed adjustment. Reduce, defer, approve, or waive it explicitly. A later source revision supersedes older unresolved proposals; it does not rewrite published amounts or silently recover money.
- Financial evidence restricts destructive cascades. Archive employees rather than deleting their history. Payroll access requires current `PAYROLL_MANAGE`; workforce administration requires current `WORKFORCE_MANAGE`. Employee reads are self-only. Manager status is not salary authorization.

## Statutory certification

No synthetic fixture is a production rule package. The calculation engine and automated fixtures do not establish Philippine legal certification.

Cross-month installments carrying SSS, PhilHealth, or Pag-IBIG assessments are blocked until contribution-period reassessment has an independently verified rule and adjustment path. Withholding-only reconciliation cannot approve these cases. Transferred maternity days and unrepresented service-charge workers also require separate reviewed cases. Keep affected employees blocked; do not waive statutory amounts or reopen the legacy payout writer.

A platform administrator registers a versioned package with effective dates, supported-through date, official issuance references, rule values, export layouts, and an independent expected-result fixture manifest. Required agency references cover BIR, SSS, PhilHealth, Pag-IBIG, and DOLE. Registration verifies the fixtures and returns package and manifest hashes.

Before certification, an independent Philippine payroll reviewer must inspect the exact rule and fixture versions, applicability evidence, regional wage categories, withholding and annual reconciliation, contribution bases and caps, work premiums, leave/benefit cases, and all four agency export layouts. Record the reviewer, qualifications, review evidence, and exact manifest hash through the platform payroll-rules screen. Record changes as a new package version. Do not mark an unreviewed version certified to unblock business activation.

The package's supported-through date is a coverage boundary, not evidence that no later issuance exists. Check current official issuances before extending it. Unsupported cases or missing eligibility evidence block affected employees. Agency exports are files for external filing/remittance; a review register is explicitly not an agency upload file.

Agency filing files require a completed calendar month. Contribution exports check the historical employee roster, including archived and no-pay employees, against effective eligibility and published assessments. Missing evidence, missing assessments, or unpublished statements block filing. Review registers remain available during preparation. Benefit eligibility uses completed calendar years; service-pay rounding uses the verified six-month anniversary. Ambiguous leap-day boundaries require independent review.

Government identifiers require `PAYROLL_IDENTIFIER_ENCRYPTION_KEY`, a separately provisioned 32-byte base64 key. Do not put its value in documentation, logs, fixtures, or tickets. Keep the key recoverable through the approved secret store; losing it makes historical identifiers unreadable. Ordinary views receive no plaintext identifiers.

## Government-calculation cutover

1. Apply additive Prisma migrations using the deployment's verified database target. Never execute the reference SQL files separately or edit an already deployed migration. Back up and test restoration before the production schema change.
2. Configure wage-payment cadence, cutoffs, optional SMS, certified rules, and encrypted employer identifiers. Monthly salary rates still require a valid payment interval.
3. Record employment dates, effective compensation, schedules, effective statutory location/classification and monthly basic salary. Confirm employee identifiers and agency applicability. Preserve historical rates only when supported by evidence.
4. Enter verified year-to-date and previous-employer inputs, explicitly confirming zero/none where applicable. Confirm opening monthly assessments, tax-period context, already paid benefits, deductions, and leave balances. Do not include amounts the new ledger already records.
5. Run **Reconcile next historical batch** repeatedly. Each command processes at most 25 unimported legacy payslips. Import preserves recorded net pay and paid status, explicitly marks missing itemization, and preserves existing source links. Reruns checkpoint through unique legacy identifiers; they do not invent rate history or republish employee notifications.
6. Resolve invalid legacy dates/amounts and uncertain unallocated commissions with owner-reviewed evidence. Compare legacy counts and net totals against imported statements, paid amounts against imported payments, and source/payment links against original records. Reconcile opening balances and explain policy differences in the shadow comparison.
7. Enable `SHADOW`, prepare representative periods, resolve issues, and compare statements. Shadow calculation may project source earnings but cannot publish or record payments. The legacy writer remains available until controlled activation, so repeat reconciliation after any legacy release.
8. Confirm reconciled opening records only when unresolved imports are zero. Activate one business after the final comparison and source-allocation review. Activation requires certified rules, agency layouts, employer identifiers, complete active-employee setup, current legacy count reconciliation, and confirmed historical commission evidence. The same business mode prevents its legacy release writer from resuming.

The activation checks are necessary safeguards; they do not replace the manual counts, totals, allocations, balances, and legal review above. Retain the owner's reconciliation evidence in the business operational record. If a source cannot be reconciled, keep that business in shadow mode.

## Interrupted operations and corrections

Run preparation persists selected employees and resumes one employee at a time. Bulk approval/publication reports each employee independently; inspect failures and resume unfinished records. A partial bulk result does not mean the run is complete. Reuse the same command key after a lost response; use the current expected revision after an intentional change. Never infer success from a notification provider response.

If an installment's actual date changes tax treatment, preview its reconciliation, review the resulting adjustment, and record the reconciliation reference with payment. Aggregate legacy statements lack an original withholding breakdown and require explicit independent reconciliation evidence. Payments cannot exceed the remaining balance or use a future actual date.

SMS delivery is separate from publication. SMS contains an authenticated link and no salary amount. Accepted delivery is not delivered confirmation. Failed attempts may retry; an uncertain acceptance must be resolved before another send. Notification retries never create another statement.

After new financial transactions exist, rollback may stop publication or hide the new interface. It must preserve new statements, payments, and allocations and must not restore `LEGACY` or a writer capable of consuming those sources again. Deploy a forward fix or reviewed adjustment. Do not remove retention constraints as a rollback shortcut.

## Verification and monitoring

Run lint, typecheck, boundary checks, focused payroll/workforce tests, guarded PostgreSQL integration suites, the application build, and the authenticated lifecycle browser flow before release. Database tests require an explicit verified disposable target and `TEST_DATABASE_DISPOSABLE=1`; they never fall back to application credentials. Browser tests block external provider requests. Run database suites and shared builds sequentially.

```text
npm run lint -- --max-warnings=0
npm run typecheck
npm run check:boundaries
npx vitest run features/payroll features/workforce
npm run test:integration -- test/integration/payroll-lifecycle.integration.test.ts test/integration/payroll-benefit-sources.integration.test.ts test/integration/payroll-salary-bases.integration.test.ts
node scripts/run-database-tests.mjs payroll --workers=1
npm run build:app
```

After building the isolated application, set `E2E_USE_PRODUCTION=1` to exercise the payroll flow against `next start`. The default browser mode uses development compilation. Both modes still require the disposable database guard.

For the simple-policy paths, run these focused suites with the same verified
disposable database settings. The browser flow uses only its synthetic tenant
and needs the separate `E2E_SIMPLE_PAYROLL=1` acknowledgment:

```text
npx vitest run components/payroll/SimplePayrollWorkspace.test.tsx components/dashboard/design-study/OwnerPayrollLoading.test.tsx features/payroll/v2/simple-calculation.test.ts features/payroll/v2/simple-lifecycle.test.ts features/payroll/v2/simple-exports.test.ts features/payroll/v2/legacy-reconciliation.test.ts
node scripts/run-database-tests.mjs integration test/integration/payroll-simple.integration.test.ts test/integration/payroll-simple-setup.integration.test.ts --maxWorkers=1
npx playwright test test/e2e/payroll-simple-flow.spec.ts --workers=1
```

The simple browser flow checks immediate sheet dismissal, reviewed manual
amounts, unpaid publication, an actual partial payment, focus return, immutable
source lines, mobile/reduced-motion behavior, and the employee's identical payslip.
It captures desktop and mobile screenshots for visual review. It neither sends
money nor configures a real business.

Check `package.json` for command names after changes. The dedicated browser flow covers an owner resolving incomplete clocks and paid leave, checking commission sources, approving/publishing, recording two installments, exporting the register, and an employee opening the identical statement on mobile through its deep link. Its synthetic exclusion profile is for flow verification only. It does not certify statutory calculations.

In environments where real `.env` files must remain unread, run Next.js from an isolated source copy excluding every `.env*` file and inject only synthetic authentication and verified disposable-database settings. Disabling dotenv parsing alone does not prevent Next.js from reading environment files.

Monitor stale-review/conflict errors, unresolved source/eligibility issues, incomplete preparation/publication, migration discrepancies, ledger/payment balance mismatches, and failed or uncertain notification delivery. Investigate a mismatch before further publication. Never log identifiers, salary values, authentication tokens, or database connection strings in operational alerts.

Prepared tests and documentation are not execution evidence. Record exact commands and successful/failed/skipped outcomes in release evidence, including browser console/runtime observations and independent certification evidence.
