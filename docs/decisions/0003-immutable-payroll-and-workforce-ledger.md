# Immutable payroll and workforce ledger

Status: Accepted; business activation and statutory certification gated

Decision date: 2026-10-11

## Context

The owner approved the payroll/workforce replacement plan in this chat and explicitly requested implementation. Legacy release combines calculation, publication and payment, uses floating-point/current rates, and permits evidence to change after release.

## Decision

Keep the feature-first modular monolith. Workforce owns work and leave facts; payroll owns effective-dated compensation, earnings, versioned statutory rules, reviewed runs, immutable statements and external payment allocations. Cross-feature writers use a narrow payroll public contract. PostgreSQL constraints and transactions enforce tenant ownership, idempotency and exclusive earning allocation. Decimal strings are the transport contract.

Publication creates an obligation, not a funds transfer. Subsequent corrections use adjustments; published evidence cannot be deleted. Source changes invalidate review. Payroll profiles and government identifiers are restricted and encrypted. Rules require independent payroll certification before activation; owners cannot certify statutory rules.

Legacy history is preserved. Each business moves LEGACY → SHADOW → ACTIVE after opening balances, YTD inputs and reconciliation are confirmed. Once active, legacy release cannot resume. Shadow calculations do not issue financial documents or consume legacy earnings.

## Alternatives

Retaining mutable aggregate payslips cannot preserve rates and source evidence. A separate payroll service would add distributed consistency and operational costs without a current requirement.

## Consequences

The migration is additive and resumable. Independent statutory review and disposable database/browser verification are release gates. Unsupported or unverified cases block the affected employee rather than silently producing zero deductions. Managers do not receive salary access merely through their profile.

Operational certification, reconciliation, interrupted-operation recovery, and rollback guidance is maintained in [Payroll operations](../payroll-operations.md).
