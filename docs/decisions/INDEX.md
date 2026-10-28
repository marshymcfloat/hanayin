# Architecture Decision Records

Architecture Decision Records (ADRs) capture significant technical decisions,
their context, alternatives, and consequences. They complement
`ARCHITECTURE.md`; they do not replace implementation plans.

## When an ADR Is Required

Create an ADR before changing:

- Deployment topology or runtime ownership.
- Authentication, authorization, or tenant-isolation strategy.
- Database ownership, data model conventions, or migration strategy.
- Cross-feature dependency rules or module boundaries.
- Asynchronous processing, delivery guarantees, or retry semantics.
- A major external provider or infrastructure dependency.
- A security, privacy, availability, or cost tradeoff that will be difficult to
  reverse.

Routine implementation details, small refactors, and reversible experiments do
not need an ADR unless they establish a repository-wide precedent.

## Naming and Lifecycle

1. Copy `0000-template.md`.
2. Use the next four-digit sequence and a short kebab-case title, for example
   `0001-feature-first-modular-monolith.md`.
3. Start with status **Proposed**.
4. Review the decision with affected owners before implementation.
5. Change the status to **Accepted**, **Rejected**, or **Superseded** and record
   the decision date.
6. Add accepted ADRs to the index below and update `ARCHITECTURE.md` when its
   current or target architecture changes.

Accepted ADRs are historical records. Do not rewrite their decision or
consequences after implementation. Add a new ADR that supersedes the old one and
link both records.

## Status Definitions

- **Proposed** — under review; implementation must not depend on it yet.
- **Accepted** — approved and authoritative.
- **Rejected** — considered but not selected.
- **Superseded** — replaced by a newer ADR.

## Decision Index

| ADR | Decision | Status | Date |
| --- | --- | --- | --- |
| [0004](0004-simple-payroll-calculation-policy.md) | Simple and government payroll share an immutable ledger | Accepted | 2026-10-17 |
| [0001](0001-feature-first-modular-monolith.md) | Feature-first modular monolith | Accepted | 2026-09-16 |
| [0002](0002-guarded-social-conversation-assistant.md) | Guarded customer inbox and Meta conversation delivery | Accepted; live activation gated | 2026-10-04 |
| [0003](0003-immutable-payroll-and-workforce-ledger.md) | Immutable payroll, workforce evidence, and separate settlement | Accepted; statutory certification and business activation gated | 2026-10-11 |

The numbered template is excluded from the index because it is not a decision.
