# Hanayin production application build

Date: 2026-10-28

## Source and result

Verified application source: `0ac98d9a409533d521fcf48a5fe6b077365b515f`
on Hanayin's `staging` branch.

`npm run build:app` completed successfully with Next.js 16.3.5 and Turbopack:

- Optimized production compilation passed.
- The Sentry production compile hook completed.
- TypeScript passed.
- Page-data collection passed.
- All 126 static-page generation tasks passed.
- Page optimization and the complete route table were emitted.

The build included the public booking routes, private workspace routes,
owner-preview routes, platform routes, and redesign dashboard routes.
No additional source correction was required after the booking test-fixture
fix in `0ac98d9`.

## Isolation and reproducibility

The build ran on Windows from a fresh `git archive` of the verified commit in
a separate verification directory. It reused the installed dependencies through
a `node_modules` junction. No environment files or active development build
output were copied, opened, or reset.

The verification process used an allowlisted operating-system environment,
non-secret authentication/cron placeholders, a loopback application origin,
and offline PostgreSQL URLs pointing to `127.0.0.1:1`.

Verification-only changes in the copied Next.js configuration:

- Set `turbopack.root` to the common parent of the copied source and linked
  dependencies, as required for linked dependencies outside the project root.
- Disable build-plugin telemetry while retaining the Sentry production wrapper.
- Retain that wrapper with `TEST_DATABASE_DISPOSABLE=1`, which disables the
  existing server/edge Sentry runtime integrations during isolated checks.

These configuration adjustments were not applied to application source.
No migrations or other database writes were performed. The command deliberately
used `build:app`, not `build:release`, because the latter applies migrations.

## Related checks

The preceding fixture-fix verification passed:

- `npx vitest run features/bookings/actions/booking.test.ts --maxWorkers=1 --reporter=dot`
  — 11 tests passed.
- `npm run lint -- --max-warnings=0` — passed.
- `npm run typecheck` — passed.
- `git diff --check` for the fixture correction — passed.

## Limits

This is production application-build evidence, not a release certification.
It does not verify Vercel environment-variable values, Linux-specific runtime
dependencies, live database access, integration credentials, migrations, or
authenticated browser workflows. The Vercel deployment must still complete its
own release build with the intended environment and database configuration.
