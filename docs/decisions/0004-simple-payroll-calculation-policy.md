# Simple and government payroll calculations share one ledger

Status: Accepted
Date: 2026-10-17

## Context

Small businesses need earnings, deductions, payslips, and payment tracking without
first configuring government identifiers and independently reviewed statutory
rules. Disabling employee eligibility flags would incorrectly describe missing
calculations as exemptions. Extending the legacy paid-on-release writer would
lose independent publication/payment tracking.

## Decision

Use one financial ledger with `SIMPLE` and `GOVERNMENT` calculation policies,
separate from the `LEGACY`, `SHADOW`, and `ACTIVE` cutover states. Snapshot the
policy on each run and prevent changing it in PostgreSQL. Existing settings and
historical runs retain government policy; newly created settings default simple.

Simple policy uses effective pay agreements, confirmed work, captured commission
sources, and authorized named adjustments. It does not fabricate statutory
profiles or exemption evidence. Monthly simple pay accrues over calendar days;
explicit reviewed absences remove the applicable day share. Hourly simple pay
uses confirmed actual time at the recorded hourly rate. Statutory premiums and
benefits are entered manually when calculated elsewhere.

One owner review can approve and publish a simple statement. An optional actual
payment is part of that same serializable, idempotent command. Independent
payments retain immutable allocations and remaining-balance checks. A pending UI
submission is never displayed as a completed publication or payment.

Simple setup is explicit for existing businesses, reconciles legacy source
allocations, and disables the legacy writer at activation. Government upgrades
require an effective date and reviewed opening information accounting for earlier
simple receipts. Existing runs keep their calculation and payment rules.

Agency exports reject reporting periods containing simple records without
assessments. Review registers identify missing calculations explicitly; ordinary
payroll exports identify their calculation policy. Employee payslips identify
manual lines and explain that contributions and tax were not auto-calculated.

## Consequences

The everyday interface becomes substantially smaller without weakening the
existing government engine. Both policies share authorization, decimal amounts,
source consumption, history, and payment invariants. Mixed-policy history requires
explicit reporting coverage checks and transition tests. Neither policy selection
nor UI labels establish a legal exemption or remittance confirmation.
