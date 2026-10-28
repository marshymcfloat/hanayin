# ServiceFlow Backend Engineering

Status: normative guide for new and modified server-side code

Last reviewed: 2026-09-23

## Scope

This guide covers Server Actions, Route Handlers, feature services, persistence,
authentication, authorization, tenancy, transactions, caching, integrations,
background work, and backend verification. Detailed invariants remain in
`docs/application-boundaries.md`, `docs/tenant-isolation.md`,
`docs/authorization.md`, and `docs/transaction-boundaries.md`.

## Required Boundary Flow

Protected work follows this order:

1. Parse and validate untrusted input with Zod.
2. Authenticate the actor.
3. Resolve tenant identity from verified server context.
4. Authorize role, capability, target resource, and subscription write access.
5. Invoke a named feature use case.
6. Persist with explicit tenant predicates and a transaction when the outcome
   spans multiple writes.
7. Map the result to a safe serializable response.
8. Revalidate affected paths or tags only after a successful commit.

Public flows replace session authentication with reviewed proof such as a
signed token, OTP, ownership check, expiry, idempotency key, and rate limit.
Public identifiers select a candidate tenant; they never replace tenant checks.

## Module Responsibilities

| Module | Allowed responsibilities |
| --- | --- |
| `app/**/route.ts` and feature actions | Transport parsing, validation, authentication, authorization, response mapping, invalidation |
| `features/<domain>/services/` | Use-case orchestration and domain decisions |
| `features/<domain>/queries/` | Narrow tenant-scoped read models |
| Feature repositories or persistence helpers | Prisma operations and transaction-aware writes |
| `lib/` | Infrastructure shared by multiple features |
| `prisma/` | Schema, immutable migrations, client setup, generated code, and reviewed database helpers |

Do not import route modules from features, import another feature's internals,
or place feature-specific business rules in `lib/`. Cross-feature work uses the
owning feature's public API.

## Persistence and Concurrency

- Scope tenant-owned reads and writes by verified business identity in the
  query itself.
- Select only fields required by the caller. Do not return Prisma records as a
  convenient public DTO.
- Put atomic multi-write outcomes, audit entries, and transactional outbox rows
  in the same transaction.
- Use conditional updates, unique constraints, isolation, or explicit locks for
  contested state. A read followed by an unconditional write is not a
  concurrency strategy.
- Make retries bounded and safe. External effects require idempotency or a
  persisted delivery state.
- Compensation commands write dated pay agreements only. Never derive or update
  employment dates from a pay effective date, including legacy client payloads.
  Workforce profile writes own Joined on, with payroll permission, financial
  revision checks, history validation, and an audit entry in the same transaction.
  Unknown joining dates remain null; existing payroll readiness gates still apply.
- Cache only data with an explicit ownership and invalidation strategy.
- Create a new Prisma migration for schema changes. Never rewrite an applied or
  committed migration and never run destructive commands against an unverified
  database target.

## Errors, Logging, and Integrations

- Return stable, user-safe errors. Log internal context separately without
  secrets, credentials, raw provider tokens, or unnecessary personal data.
- Give outbound requests an explicit timeout, response validation, bounded
  payload handling, and a retry policy appropriate to idempotency.
- Keep provider SDKs behind feature or infrastructure adapters so tests can use
  deterministic fakes.
- Cron and webhook handlers authenticate before work, process bounded batches,
  and remain safe when retried.
- Compensating cleanup must only delete resources created by the failed attempt.

## Backend Definition of Done

- Boundary validation, authentication, tenant scope, authorization, and safe
  response mapping are visible and tested.
- Domain logic lives in the owning feature and transaction boundaries match the
  business outcome.
- Focused unit tests cover decisions, denials, stale state, and failure paths.
- Real database tests cover constraints, rollback, and concurrency when those
  properties matter; mocks are not reported as database proof.
- `npm run lint -- --max-warnings=0`, `npm run typecheck`, and focused Vitest
  tests pass.
- Route/configuration/runtime changes also pass `npm run build:app`; relevant
  database and E2E suites run only through their guarded disposable harness.
- Durable boundary or architecture changes update documentation and require an
  ADR when they meet `docs/decisions/INDEX.md` criteria.
