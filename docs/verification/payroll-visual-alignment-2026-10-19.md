# Redesign payroll visual alignment

## Scope

Align simple, government, and legacy redesign payroll presentation with the
existing catalog/Team pages. Reuse content geometry and heading styles, present
pay-term setup as searchable employee rows, and match loading geometry. Preserve
all calculations, authorization, financial commands, confirmation, cache retention,
and failed-draft recovery. No dependencies, schema, or routes changed.

## Executed checks

```powershell
npm run lint -- --max-warnings=0
npm run typecheck
npx vitest run components/payroll/SimplePayrollWorkspace.test.tsx components/payroll/PayrollWorkspace.test.tsx components/dashboard/design-study/OwnerPayrollHeader.test.tsx components/dashboard/design-study/OwnerPayrollLoading.test.tsx components/dashboard/design-study/OwnerPayrollStudy.test.tsx components/dashboard/owner-preview/OwnerPayrollPreviewQuery.test.tsx --maxWorkers=1 --pool=forks --testTimeout=15000 --reporter=verbose
```

All passed: six test files, 49 tests. An earlier threads run encountered four
five-second test timeouts and a worker startup timeout while other verification
was running. The final isolated forks run passed; its affected tests completed
within approximately one second. No repository timeout configuration was changed.

Authenticated browser checks against the existing local development server:

- Checked 320, 390, 639, 768, and 1440px widths; no document horizontal overflow.
- Inspected desktop/mobile payroll and the government-settings return control.
- Opened pay terms and cancelled without edits; focus returned to the employee
  trigger, with no editor remaining mounted.
- Checked reduced-motion rendering and the React component tree.
- Next.js reported no compilation issues, configuration errors, or session errors.
- No settings were saved and no payroll, reconciliation, or payment was submitted.

Production build, database suites, and write-based E2E were not run for this
presentation-only change. Active payroll mutation behavior is covered by the
mocked component suites, not by new live financial-write evidence.
