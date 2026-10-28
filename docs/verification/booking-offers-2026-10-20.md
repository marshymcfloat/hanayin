# Conditional sales and package choices

## Contract

Extend existing sale/package editors and public/staff booking without changing
historical financial records. Conditional sales match two distinct standalone
units once per booking; fixed-price packages may contain required choose-one
slots. Live category/regular-price eligibility is verified at quote and commit.
Compare conditional offers against ordinary discounts plus vouchers, never stack
them, and preserve unused vouchers. Financial totals are server-confirmed.

## Invariants and scope

- Use integer cents and deterministic proportional allocation.
- Store chosen package instances and immutable pricing/offer evidence.
- Recheck quotes, permissions, tenant references and capacity inside a serializable
  transaction; repeated request keys cannot create duplicate bookings.
- Existing fixed packages, gift cards, ordinary sales, payments and payroll remain
  compatible. Gift cards cannot include new flexible packages in this release.
- No dependency changes, new navigation, general rules engine, premium upgrades,
  nested packages or automatic substitution.
- Apply additive schema changes only to an explicit disposable database during
  verification; never read secret files or mutate the user's working business.

## Verification

Record focused unit/component and disposable PostgreSQL tests, lint, typecheck,
boundaries, production build and public/staff browser outcomes here. A prepared
test is not executed integration proof. Check disk space before build/E2E; retain
unrelated work and artifacts.
