# ADR-0001: Feature-First Modular Monolith

- Status: Accepted
- Date: 2026-09-16
- Deciders: ServiceFlow maintainers
- Supersedes: None
- Superseded by: None

## Context

ServiceFlow had domain behavior and Prisma access spread across App Router
pages, shared components, legacy `app/actions/` modules, and large Server Action
files. That structure made tenant authorization, transaction ownership, and
focused testing difficult to review consistently.

The product currently benefits from one Next.js deployment and one PostgreSQL
database. Its operational scale does not justify independently deployed
services, but its billing, booking, workforce, platform, social, and catalog
domains require explicit ownership boundaries.

## Decision Drivers

- Make tenant scope and authorization visible at every protected boundary.
- Keep domain decisions and persistence independently testable from React and
  transport code.
- Preserve one deployable application and transactional database.
- Allow incremental migration without changing existing public action
  contracts unnecessarily.
- Prevent new direct Prisma access from UI and shared components.

## Options Considered

### Option A: Continue the layer-first monolith

- Benefits:
  - Minimal structural movement.
  - Familiar shared `lib/` locations.
- Costs and risks:
  - Domain ownership remains ambiguous.
  - Large action modules continue mixing transport, policy, and persistence.
  - Tenant and transaction rules are harder to audit.

### Option B: Feature-first modular monolith

- Benefits:
  - Each domain owns its actions, schemas, services, queries, and tests.
  - Existing deployment and database transactions remain intact.
  - Units can migrate incrementally with characterization coverage.
- Costs and risks:
  - Cross-feature contracts require discipline.
  - Transitional duplication may exist while legacy modules move.

### Option C: Split into independently deployed services

- Benefits:
  - Strong runtime isolation and independent scaling.
- Costs and risks:
  - Adds distributed transactions, service authentication, deployment, and
    observability complexity without a demonstrated need.

## Decision

ServiceFlow will remain a single Next.js and PostgreSQL deployment organized as
a feature-first modular monolith.

`features/<domain>/` owns domain actions, validation, use cases, persistence
queries or repositories, types, and colocated tests. `app/` owns routing,
rendering, and thin transport adapters. Shared UI does not access Prisma.
`lib/` is limited to infrastructure and utilities shared by multiple features.

Protected operations validate untrusted input, authenticate, authorize the
verified tenant and permission, invoke a named feature workflow, use explicit
transactions for atomic outcomes, and return safe serializable results.

## Consequences

### Positive

- Domain ownership and dependency direction are explicit.
- Tenant, permission, and transaction behavior can be tested without UI.
- Architecture-boundary checks can prevent regression.
- One database continues to support atomic cross-model workflows.

### Negative

- Some shared infrastructure and transitional services remain under `lib/`.
- Cross-feature workflows require narrow public contracts instead of importing
  another feature's internals.

### Neutral or Follow-up

- Eight Route Handlers still use Prisma directly and must remain thin or move
  workflow logic to their owning feature when changed.
- Unused-file and dependency review remains recurring work.

## Implementation and Rollout

- Migrate one bounded feature slice at a time.
- Add characterization tests before moving fragile behavior.
- Preserve action contracts while callers move to feature-owned modules.
- Enforce boundaries through `scripts/check-boundaries.mjs`.
- Update architecture inventories after each completed group.

## Validation

- `npm run check:boundaries` rejects direct Prisma use in React/UI modules and
  forbidden dependency directions.
- Focused tests cover boundary validation, authorization, tenant scope, state
  transitions, and transactions.
- Strict lint, typecheck, the complete unit suite, and production build form the
  repository verification gate.
- Review this decision if deployment topology, database ownership, or
  cross-feature communication requirements materially change.

## References

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/application-boundaries.md`
- `docs/harness-engineering-cleanup-backlog.md`
- `docs/prisma-ui-inventory.md`
