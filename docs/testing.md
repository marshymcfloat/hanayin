# Test Structure

Last revised: 2026-09-18

## Test Layers

| Layer | Location | Command | Dependencies |
| --- | --- | --- | --- |
| Unit and component | Colocated `*.test.ts` and `*.test.tsx` files | `npm run test:unit` | No live database or third-party services; external boundaries must be mocked. |
| PostgreSQL integration | `test/integration/**/*.integration.test.ts` | `npm run test:integration` | Explicit disposable `TEST_DATABASE_URL`; committed migrations must already be applied. |
| Core browser smoke | Selected files under `test/e2e/` | `npm run test:e2e:core` | Chromium and the local Next.js server. The owner-growth flow additionally needs a direct database URL when `E2E_OWNER_FLOW=1`. |
| Public booking browser smoke | `test/e2e/public-booking-smoke.spec.ts` | `npm run test:e2e:db` | Chromium, fresh local Next.js server, and explicit disposable migrated `TEST_DATABASE_URL`. |
| Opt-in feature browser tests | `test/e2e/booking-editor.spec.ts`, `test/e2e/social-post-request.spec.ts` | Run the relevant Playwright file directly | Staging-style role credentials and feature-specific enable variables documented in each test file. |

Unit tests and PostgreSQL integration tests use separate Vitest configurations.
Vitest and `@vitest/coverage-v8` use matching patched 4.1.11 releases. Review
mock, timer, pool, and coverage behavior when upgrading the harness; never lower
coverage floors to accommodate an upgrade. Neither the Vitest API/UI server nor
the development server should be exposed to untrusted networks.
Vite is pinned to the patched 7.3.6 line for this harness. Use Node 22.12 or newer on the
supported Node 22/24 lines; CI installs Node 22. Keep Vitest and coverage versions
aligned and review a fresh audit after regenerating the lockfile. Do not blindly
apply `npm audit fix --force`: suggested downgrades and incompatible transitive
major versions require separate compatibility review.
Unit tests default to at most two workers to bound the fork-based runner's local
memory use. Override worker counts explicitly only on a suitably sized runner.
Vitest 4 removes `minWorkers`; use `maxWorkers` without disabling isolation.
Mocks invoked with `new` must use constructible functions or classes. Pass a
constructor implementation directly to `vi.fn` when `resetAllMocks` must restore
it. Coverage uses AST-aware V8 remapping; compare the reported file set after
upgrades, retaining explicit includes and existing thresholds.
Lint excludes generated Prisma output; typecheck still verifies its types. Keep
hand-maintained feature, infrastructure, schema, and test code in lint scope.

Prisma's CLI, client and PostgreSQL adapter are pinned together to 7.10.0.
Two narrowly scoped overrides patch CLI/config dependencies: `deepmerge-ts`
8.0.2 beneath `@prisma/config@7.10.0`, and `mysql2` 3.24.4 beneath
`prisma@7.10.0`. These differ from upstream's pinned dependency graph and
require compatibility review; a clean audit alone is insufficient.
`scripts/prisma-config-compatibility.test.ts` checks config discovery, merging,
safe load failures, recursive containers and the patched MySQL security
boundaries without a database connection or secret-file reads. It does not
certify MySQL application workloads; this application uses PostgreSQL.
Remove each override only when a supported upstream release supplies the patch
and compatibility, SQL, browser, type and build checks pass without it. Keep
Prisma packages aligned, regenerate from the current schema and preserve
unrelated schema changes. Never adopt an unqualified prerelease or force an
audit downgrade.

Report exports use SheetJS CE 0.20.3 from its versioned official CDN tarball,
not the outdated npm registry release. Keep the tarball URL and integrity in
the lockfile; review [official installation guidance](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
before changing the distribution. Serializer tests inspect ZIP/OOXML structure
independently of SheetJS and retain workbook round-trip, numeric/string and
download contract checks. Do not suppress audit findings or remove export
formats as a dependency workaround.

The Sentry error-demo GET endpoint intentionally throws only at request time.
Await `connection()` before its logger/error side effects so Cache Components
cannot execute the demonstration during production prerendering. Keep Sentry's
build configuration imported from `@sentry/nextjs/config`.

The default `npm test` and `npm run test:unit` commands exclude
`test/integration/`, so a missing database cannot silently turn an intended
integration run into a passing skipped test.

## Quality Commands

- `npm run check`: strict lint, typecheck, isolated unit/component tests with
  coverage, and the production application build. This is the standard local
  and CI quality gate.
- `npm run test:integration`: database integration tests only. It fails before
  Vitest starts without explicit disposable test configuration.
- `npm run test:e2e`: core and database-backed browser smoke suites. It requires
  direct database configuration.
- `npm run verify:release`: the standard quality gate, database integration,
  browser smoke suites, migration deployment, and release build.

CI provisions PostgreSQL, applies committed migrations, then executes the same
`npm run check` and `npm run test:integration` commands used locally. The
separate `e2e_smoke` job runs the full guarded `npm run test:e2e` suite with
one worker against its job-local disposable database.

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

- `test:integration`, `test:e2e:db`, and `test:e2e` require
  `TEST_DATABASE_URL` and `TEST_DATABASE_DISPOSABLE=1` in the process environment.
  There is no fallback to `DATABASE_URL`, `DIRECT_DATABASE_URL`, or
  `E2E_DATABASE_URL`, and the test runner does not load secret files.
- Database test URLs must begin with `postgresql://` or `postgres://`; Prisma
  Accelerate URLs are rejected because these suites use a direct `pg` client.
- Never point database integration or database-backed E2E commands at the
  persistent `service-flow-dev` database. It is shared by local development and
  staging. Keep these suites skipped until a dedicated, disposable
  `service-flow-test` database is configured and migrated.

Configure the dedicated test connection through a secure environment or CI
secret manager. Set the disposable acknowledgement only after verifying the
database resource's identity and isolation in the provider console. A cloud URL
whose database name is `postgres` does not prove which project it belongs to.
Known development/staging/production database names are rejected, but this check
cannot replace provider-side identity verification.

`scripts/run-database-tests.mjs` passes the verified test URL to the runner as
the application, direct, and E2E database URLs. The integration configuration
also enforces this target. Playwright starts a fresh server with the test URL
and refuses to reuse an existing development server for disposable DB runs.
Directly invoking an opted-in owner-growth or public-booking spec still requires
the same test guard. CI acknowledges its job-local PostgreSQL service as
disposable; persistent development/staging resources must never be acknowledged.

In disposable mode, the Playwright server uses local auth/app URLs, synthetic
auth signing and explicit empty provider credentials, including both Upstash
settings. This prevents Next.js environment-file loading from restoring live
provider access; secret files are not inspected or modified. Keep the server in
development mode, where the existing Sentry initialization guards apply.
Explicitly disposable production verification also skips server/edge Sentry
initialization and its build wrapper, preventing the plugin from reloading
credentials or uploading source maps/releases. Normal production monitoring
is unchanged. Set `NEXT_TELEMETRY_DISABLED=1` independently. Such builds verify
the production application without certifying Sentry's release instrumentation;
Google font resource downloads may still occur. Never use the disposable marker
for a production deployment or launch this verification bundle with live providers.
The guarded smoke and feature specs share an automatic browser fixture that blocks external
HTTP requests, monitoring/analytics endpoints and remote image proxy requests;
service workers are disabled. Browser routing does not block server-side
requests, so review each seeded flow and retain server provider isolation.
The owner-growth fixture supplies an active Pro subscription, reuses any
existing catalog plan without changing it and removes only its fixture-owned
plan ID. Its media is local and its social targets are not publishable jobs.
The flow verifies login and navigation, not AI, publishing or billing mutations.

The guarded `test:e2e` command also enables internal booking and payroll feature
fixtures explicitly. These use synthetic logins, local provider isolation and
owned tenant records; the customer manage flow uses the isolated signing secret.
Direct feature-spec execution requires the relevant `E2E_BOOKING_FLOW=1` or
`E2E_PAYROLL_FLOW=1` acknowledgement. Simple payroll's separate
`test/e2e/payroll-simple-flow.spec.ts` requires `E2E_SIMPLE_PAYROLL=1` and the same
disposable database guard; see [payroll operations](payroll-operations.md#verification-and-monitoring).
Browser fixtures send ISO UTC timestamps
and use a client-local parser for PostgreSQL timestamp-without-time-zone values,
matching Prisma without changing global `pg` parsing. Calendar selections must
also work across month boundaries.

Apply committed migrations to the verified test resource before running suites.
Do not replace persistent development configuration or run the application seed
against it. Agent operations must never read, expose, or modify secret files.

Cloud integration fixtures use a 30-second test deadline and 60-second setup/
cleanup deadline. These allow multi-query assertions and fixture materialization
to finish without shortening the application's bounded transaction lifetime;
they do not change application transaction limits. Forced billing races require
at least two transaction connections, a bounded first-arrival barrier, exactly
two arrivals and a serialization-conflict loser rather than an arbitrary
timeout. Do not retry away failed assertions or weaken concurrency barriers.
Run integration files serially: independent tenant namespaces still share tables
and PostgreSQL serializable predicate locks can interfere with another suite's
writes. Keep `PRISMA_POOL_MAX=3` for verification. Serial files do not serialize
the deliberately simultaneous transactions inside race cases; those still
require exactly two arrivals and one verified winner.
Vitest timeouts do not cancel database work, so an early timeout can contaminate
later fixture assertions. Rerun affected suites to completion after fixing the
harness deadline; never report a timed-out or skipped case as passing.

Record current provisioning identity and executed suite evidence in Linear/CI,
not a duplicate status checklist here. Preparation notes below describe required
coverage, not proof of its execution.

`test/integration/booking-core-workflows.integration.test.ts` exercises original
booking persistence with real pricing, availability, OTP claims, tenant customer
identity, deposits, vouchers and outbox writes. Staff-supplied customer IDs must
resolve inside the booking tenant before either profile or booking writes;
missing and foreign IDs share a safe rejection. Modify and manage adapters use
real stored actor/tenant predicates and signed manage tokens; framework/auth
transport and delivery boundaries are mocked. Injected post-outbox failures must
roll back the actual preceding graph writes. These fixtures do not establish
all-writer or simultaneous modify-race safety.

`test/integration/payslip-administration.integration.test.ts` checks actual
eligibility, release, forensic audit, attendance/service stamps, duplicate-period
constraints and post-write rollback. It also checks tenant/self/history/audit
adapter rules with mocked auth transport. Actor authorization and employee rates
are currently checked before the transaction; these tests do not establish
concurrent actor revocation or rate-selection safety. The payroll browser flow
must assert the visible payout and persisted stamps/audit, not just navigation.
There is no employee payslip-history UI consumer; its action boundary remains
unit/SQL coverage, not browser evidence. The public browser smoke does not
complete OTP delivery or a public booking; do not label it a full provider flow.

`test/integration/booking-otp.integration.test.ts` covers real concurrent
verification/consumption, replay, tenant/phone mismatches, expiry, and transaction
rollback. It never sends SMS. Verification requires the provisioned, migrated
`service-flow-test` target and an executed guarded suite.

`test/integration/password-change.integration.test.ts` uses real bcrypt and
PostgreSQL writes, with a test-only post-hash barrier forcing two requests to
check the same credential version before either updates. Exactly one may replace
the hash and clear temporary flags. Incorrect old passwords leave those fields
unchanged. Verification requires an executed suite on the isolated test target.

`test/integration/business-settings.integration.test.ts` prepares real-PostgreSQL
checks for policy-plus-audit commit/rollback, all-or-nothing hours updates with
more than 25 entries, duplicate/unspecified-hour semantics, foreign tenant
denial, and permissions/role removed after actor resolution. Conflict scanning
is mocked, so the suite never delivers external notifications. These seven
tests require executed evidence from `service-flow-test`.
Mocked unit tests alone do not prove PostgreSQL rollback or concurrent
permission-revocation ordering.

`test/integration/owner-administration.integration.test.ts` prepares twelve
real-PostgreSQL checks for audited permission/primary changes, no-ops, audit-failure
rollback, revoked actor capability/role, foreign or stale-role targets, and
primary-owner settings requirements. A test-only post-read barrier forces two
transactions to observe old state before permission replacement, primary
switching, or promotion racing settings removal. The concurrent tests require
at least two transaction connections. Database operations are real; only audit
failure injection and scheduling are controlled. Execution requires the
dedicated migrated disposable target.

`test/integration/catalog-administration.integration.test.ts` prepares twelve
PostgreSQL cases for service/flow and package/item commit, replacement rollback,
foreign references/targets, current actor role/capability revocation, scoped
deletion/cascades and legacy cross-tenant flow filtering. Failure injection wraps
only replacement insertion; the preceding database writes and rollback are real
when executed. It does not yet force concurrent reference relocation/replacement.

`test/integration/expense-administration.integration.test.ts` prepares ten
PostgreSQL cases for audited financial transitions, audit-failure rollback for
create/update/delete, foreign targets, revoked current owner role, full-day totals
with more than five rows and exact inclusive day edges, and forced concurrent revision/revision or
revision/deletion from the same stored snapshot. Date-only fake timers keep
local-day assertions deterministic without replacing PostgreSQL/network timers.
Concurrent cases require at least two transaction connections.

Run both suites only against the verified migrated disposable test target.
Unit authorization/DTO/transaction mocks do not prove
PostgreSQL constraints, rollback, cascades or concurrency. Booking-detail browser
panel and authenticated catalog/expense flows also require separate E2E proof.

`test/integration/customer-administration.integration.test.ts` prepares twelve
PostgreSQL cases for owner/staff creation, supported scalar DTOs, omitted/empty
contact updates, post-write reload rollback, foreign targets, revoked current
roles or transferred memberships, scoped deletion and legacy foreign booking
metadata/history exclusion. Date-only fake timers preserve deterministic
appointment comparisons without replacing network/transaction timers.

`test/integration/sale-event-administration.integration.test.ts` prepares eleven
PostgreSQL cases for core graph commit, social post/target/audit commit and
post-write rollback, relation replacement rollback, foreign targets/references,
revoked owner role or social connection, inclusive public date boundaries and
foreign nested-reference/booking-count exclusion. Explicit query clocks avoid
wall-clock dependence. These commit tests do not call AI, Blob or publishers.

`test/integration/brand-asset-lifecycle.integration.test.ts` prepares ten
PostgreSQL cases with Blob APIs mocked throughout. Cases cover safe display
DTOs, owner role/settings/membership or service references changed during mocked
upload, foreign service/employee denial, real insert then injected failure with
compensation, committed deletion with provider failure and foreign deletion
denial. A post-insert flag proves the rollback injection was reached. Upload-time
mutations occur before database transactions; they are not forced SQL races.

These suites require the verified dedicated migrated disposable database.
They do not prove concurrent membership or
cross-tenant reference ordering, all-writer safety, real Blob cleanup or E2E flows.

The owner-growth browser spec now seeds `User.contact_number` through
`test/factories/owner-growth-workflow.ts` and uses current accessible login
labels. Its synthetic credentials are fixture-owned, not real owner environment
credentials. Scoped best-effort cleanup attempts both business and user removal
before disconnecting. Factory tests prove normalization and clock/namespace
behavior only; the guarded browser/database flow still needs isolated execution.

`features/bookings/services/booking-persistence.test.ts` and the colocated OTP
tests exercise canonical pricing inputs, customer linkage, public OTP/GCash
denials, payment and service-line snapshots, conditional voucher reservation,
bounded serialization retries and overlap-error mapping using isolated database
delegates. Internal hook tests assert pre-write checks, post-write failure and
whole-transaction retry ordering. Mocked transaction callbacks do not prove SQL
rollback, concurrency ordering or real scheduling/provider behavior; use the
guarded PostgreSQL suites for persistence-boundary proof.

`test/integration/voucher-administration.integration.test.ts` prepares fifteen
PostgreSQL cases for current owner/staff creation, global code uniqueness,
tenant-conditional deletion, revoked roles/transferred memberships, advisory
public expiry/minimum/used/discount behavior and legacy foreign used-booking
metadata exclusion. Verification never reserves or redeems a voucher. These
cases do not force concurrent uniqueness or reservation races.

`test/integration/business-profile-settings.integration.test.ts` prepares ten
PostgreSQL cases for atomic business-plus-growth create/update, unrelated/foreign
field retention, current role/settings/membership revocation and foreign context
denial. A test-only proxy performs the real growth upsert before throwing, and
a reached flag proves both write rollback paths were exercised when executed.
Blob calls are mocked; upload-time settings revocation and persistence failure
assert compensation of newly uploaded URLs, not previous stored images.

`test/integration/booking-addons.integration.test.ts` prepares seventeen
PostgreSQL cases for appended graph/totals/audit/outbox commit and rollback,
follow-up booking/lines/outbox plus both linked audits committing together,
current role/membership/permission revocation, foreign references/customers,
anonymous follow-up denial and stale initiator role. Failure injection performs
the actual audit insert before throwing; reached and pre-failure outbox flags
distinguish real staged writes from an early denial. Date-only fake timers keep
fixture clocks fixed without replacing transaction/network timers. Pricing and
availability are deterministic stubs, so this suite isolates persistence and
does not verify real pricing, scheduling, slot constraints or forced SQL races.

These suites require the verified migrated disposable database and do not prove
SQL-race ordering, real provider
cleanup or authenticated/public browser flows. Do not use persistent shared
development/staging storage for any of these suites.

`test/integration/owner-queue-claims.integration.test.ts` prepares thirty-seven
guarded PostgreSQL cases for claim/serving-unclaim commit, real audit-insert
rollback, current role/transferred membership, foreign parent/customer/service/
package denial, unsupported unclaim states, anonymous walk-in commands/queues,
transactional sale pricing and forced competing claim/unclaim snapshots. Serve/
undo cases add unpaid completion/customer-trust promotion, parent reopen without
payment/trust reversal, remaining-line no-promotion, anonymous walk-ins, real
post-parent-write/post-audit-insert rollback, current membership/role and foreign
reference denials, unsupported assignment/cancellation states, duplicate requests,
competing serve/undo snapshots and serve-versus-unclaim ordering. The race cases need
two transaction connections. Scoped fixed namespaces are cleaned before setup
and after teardown, including partial failures. Record executed suite evidence
against the work item rather than treating fixture preparation as verification.
They do not establish concurrent permission-revocation ordering, all-writer
invariants, payroll integration or authenticated owner browser behavior.

Owner claim/unclaim unit tests characterize the original valid action contracts
before extraction, then cover invalid/coerced IDs, auth/current-role denials,
exact tenant/reference/snapshot predicates, active/terminal/payroll state edges,
current pricing and sale policies, conditional failure, safe errors, audit
failure escaping the transaction, overlap recovery and post-commit cache failure.
Shared sale and overlap helper tests cover transaction injection and default
caller behavior. The extracted service/schema and shared overlap module are
explicitly instrumented; the remaining owner monolith is not newly instrumented
as a whole, because its unrelated permanent-deletion path is a separate
unmigrated slices. Do not interpret focused coverage as proof of those commands
or real SQL rollback/concurrency. No optimization-hook/performance checks apply
to this server-only command extraction.

Owner serve/undo unit tests first characterize the original valid DTO, PH date,
parent reopen/no-op and auth contracts before extraction. They then cover bounded/
coerced IDs, current actor/membership/role, exact reference/parent/assignment/date
snapshots, active/terminal/payroll edges, duplicate denial, missing reloads,
conditional losses, audit/second-write/infrastructure failure and post-commit
cache failure. Shared completion tests preserve payment independence, remaining-
line and trust policy, anonymous support and the default employee caller while
covering new scoped lookup/count/conditional-parent/customer predicates. The
extracted service, explicit DTO selector, shared owner-queue predicates and
completion helper are instrumented explicitly. Mock coverage is not evidence of
real SQL rollback/races, payroll integration or authenticated owner browser flows.

Booking no-show tests first characterize the original counter/date/trust,
anonymous HOLD and permitted-manager contracts. Unit cases then cover bounded
IDs, current role/membership/profile/default or explicit capabilities, exact
tenant/reference/state predicates, counter limits, stale writes, duplicate
denial, audit/infrastructure failures and post-commit cache failure. The actual
shared resolver runs through injected transaction delegates; separate resolver
tests preserve the default caller contract. The new schema, access predicates
and command are explicitly instrumented. Run focused unit verification with:

```bash
npx vitest run features/dashboard/actions/owner-no-show.test.ts lib/auth/staff-access.test.ts --maxWorkers=1
```

`test/integration/booking-no-show.integration.test.ts` prepares 29 guarded SQL
cases, including real post-write/post-audit rollback, stored actor revocation,
foreign references, accounted-work denial, duplicate requests and forced
same-booking/different-booking customer-counter races. Scoped factory fixtures
are cleaned before setup and after teardown, including partial failures. These
cases require execution against the dedicated disposable database
and two transaction connections. Mock coverage is not real SQL rollback/race
or authenticated browser evidence. No optimization-hook checks apply to this
server-only extraction.

Cancellation routing tests cover generic CANCELLED denial before auth/persistence,
list capability and active-state gating, both responsive action triggers,
reason-required canonical submission, permission-denied feedback, close/reopen
reset and focus restoration. Rerender cases change viewer permissions to prove
the existing `[viewer]` memo cannot retain stale cancellation visibility; revoking
an open dialog cannot reopen it merely by restoring a grant. Separate dialog
tests preserve the default trigger and controlled mode, input bounds and
pending-submit behavior. These are deterministic component/unit tests, not
authenticated browser, responsive-layout or real SQL evidence.

Manual completion tests retain the paid result, missing-booking, subscription,
numeric-coercion and invalidation contracts, then cover the approved restricted
transition policy: active PAID ACCEPTED with no unfinished lines. They exercise
the actual shared resolver and audit helper, current role/membership/profile/
capability, default and explicit grants, anonymous bookings, terminal/cancellation
denials, exact tenant/reference/payment/work predicates, conditional loss,
duplicate requests, safe infrastructure/audit failures and post-commit cache
failure. The new status schema, shared booking-command access predicates and
completion service are explicitly instrumented without reducing coverage floors.
Mock rollback checks are not proof of PostgreSQL rollback.

`test/integration/booking-status.integration.test.ts` prepares 34 guarded SQL cases
for verified audits, unchanged financial/trust/work records, mixed cancelled/
finished payroll lines, actor revocation, foreign references, denied state,
payment and unfinished/payroll edges, real post-write/post-audit rollback,
duplicates, forced same-parent snapshots and payment/status changes committed
between read and conditional write. Shared factory fixtures are scoped and
cleaned after partial setup and teardown. Execution requires
the dedicated migrated disposable database and two transaction connections.
They do not prove all-writer invariants, concurrent grant-revocation ordering or
authenticated browser behavior. No optimization-hook checks apply to this
server-only command extraction.

## Attendance and Owner Subscription Verification

Attendance characterization and regression tests cover Philippine day/month
boundaries, current-owner/self access, bounded input and GPS, duplicate-day
and conditional clock-out decisions, transaction failures and post-commit
notification/cache/logging failures. The existing attendance-count action
remains a separate regression surface. Guarded
`test/integration/attendance-self-service.integration.test.ts` cases cover SQL
duplicates, conditional writes, forced rollback and actor/tenant changes.

Owner subscription tests characterize invoice delegation, upgrade and manual
reference contracts, current-owner access, expired-tenant renewal access,
metadata omission/replacement, conditional invoice state and atomic outbox
failure. Guarded `test/integration/owner-subscription.integration.test.ts` cases
exercise real persistence and concurrency. The legacy invoice financial helper
is not newly concurrency-verified by this extraction.

Prepared SQL cases are not executed evidence. Run them only with the isolated
database runner and validated disposable target; mocks and coverage do not
prove PostgreSQL isolation, all-writer invariants or authenticated browser
behavior. Optimization-hook checks do not apply to these server-only commands.

## Permanent Booking Deletion Verification

`features/dashboard/actions/owner-booking-deletion.test.ts` characterizes the
legacy deletion contract and covers bounded input, current stored role and
membership, transaction-scoped authorization, tenant/backlink predicates, safe
errors, commit failure and post-commit cache failure. Transaction mocks are not
proof of PostgreSQL rollback or cascades.

`test/integration/booking-deletion.integration.test.ts` prepares guarded SQL
cases for valid cascades, retained customer/catalog/actor and foreign-tenant
records, denied or revoked actors, missing/duplicate deletion, status/payment
combinations, malformed foreign-tenant voucher/adjustment backlinks and forced
post-delete rollback. Execute only through the isolated database runner with a
validated disposable target. These prepared cases do not establish all-writer
integrity, concurrent revocation ordering or authenticated browser behavior.

## Employee and Reference-Candidate Verification

Employee characterization preserves known-password reset flags, authorized
invite fallback, colleague schedule views, split ranges, empty replacement and
existing overlap/overnight semantics. Focused administration tests must cover
current role/membership, tenant targets, account snapshot claims, atomic schedule
replacement, malformed foreign backlinks, safe failures and independent
post-commit provider/cache failures. List/create DTOs must not expose credential
fields; invite resend intentionally returns the authorized one-time password.
`test/integration/employee-administration.integration.test.ts` prepares isolated
account/schedule rollback, credential snapshots, current-owner denial and
foreign-backlink/query cases with mocked hashing, SMS and conflict scans.

Reference-candidate tests cover the four legacy contracts, malformed URL input,
actual owner/pilot access, provider response validation, trusted HTTPS image
hosts, redirect denial, streamed size limits, MIME and timeout failures, tenant
deduplication, conditional approval and narrowly owned Blob compensation.
`test/integration/reference-candidates.integration.test.ts` prepares SQL cases
using mocked providers and a fixture-owned pilot tenant; it must not reuse or
delete a pre-existing Beautyfeel tenant.

Prepared SQL fixtures are not executed evidence. Use only the guarded isolated
database runner. Unit mocks cannot prove rollback, simultaneous approval,
credential/schedule races or authenticated browser behavior. Keep new
risk-bearing schemas, access, query, service and action modules instrumented.

## Growth Orchestration Verification

Preserve the five action exports, current-member reads, owner writes, Plus/Pro
and Pro-AI gates, creative defaults, schedule/discount rules, image failure
fallback and event value/JSON contract. Focused tests must assert boundary input
denial, actual role/membership, tenant references, final opportunity snapshot
claims, rollback propagation and independent post-commit cache/telemetry errors.
Reference-image cases use mocked fetch, trusted namespace/final URL checks,
redirect denial, MIME, timeout and streamed size limits; no live AI/Blob calls.

`test/integration/growth-campaign.integration.test.ts` prepares real graph/event
rollback, tenant/reference denial and forced original-snapshot concurrency cases
without AI or Blob calls. Guarded SQL fixtures are prepared evidence only until
run against the dedicated disposable target. Transaction mocks do not prove SQL rollback/concurrent
campaign winners. Delegated legacy refresh helpers retain separate transaction,
revocation and recovery debt. Keep all new growth-owned risk-bearing schemas,
access, query and workflow modules explicitly instrumented.

## Coverage Expectations by Risk

`test/integration/owner-specialties.integration.test.ts` prepares ten guarded
PostgreSQL cases: raw/empty replacement, no-op, real post-audit-insert rollback,
revoked actor capability/role/membership, foreign/stale-role targets and one
winner from forced concurrent target snapshots. The concurrent case requires
two transaction connections. Fixed factory namespaces are cleaned before setup
and after teardown, including partial failures. Prepared fixtures are not
executed evidence and do not prove queue DTO/reference filtering, concurrent
capability-revocation ordering or authenticated browser behavior.

Dashboard queue/specialty tests preserve the valid array/result contracts and
directory protections, retain nullable anonymous walk-in DTOs for owner/employee
pending and self-owner claimed reads, assert narrow tenant/reference/current-
membership query predicates and existing staff specialty matching. Specialty tests cover input
bounds, exact owner capability/target/snapshot predicates, no-op, incomplete
conditional update, safe transaction conflicts, audit rejection escaping the
transaction callback and independent post-commit scan/cache failures.
Transaction/query mocks do not prove SQL rollback, permission-revocation races,
foreign-reference filtering in PostgreSQL or authenticated browser behavior;
those require separate isolated database/E2E evidence before completion.

Public availability tests characterize all six action contracts, validation
before infrastructure access, anonymous endpoint buckets, the legacy authenticated
bypass, narrow query projections, safe errors and best-effort slot telemetry.
Service tests exercise provider qualification, busy/cancelled assignments and
existing hours/category rules. A large stored horizon case asserts the hard
90-day capacity cap and peak concurrency of four. Keep the action, schemas,
service and query modules explicitly included in coverage.

Alternative-search tests assert the shared 90-day sequential work budget for
empty large horizons and far-future starting dates, shorter stored horizons,
strictly-later filtering, early termination, partial results and failure
propagation. Real-engine tests with isolated query delegates verify the helper
is wired into both booking-rejection suggestion paths without changing their
error codes. The budget is a day-computation cap, not a time/SQL-row limit or a
claim that the whole remaining horizon was searched.

These isolated tests mock database and rate-store boundaries. They do not prove
real PostgreSQL projections, provider concurrency, distributed limiting or the
public booking browser flow. Database-backed verification requires the
dedicated migrated disposable test target and executed suite evidence.

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
