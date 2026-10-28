# HANAYIN pricing proposal

Research date: 2026-10-08. The user approved the recommended monthly and annual prices for `/redesign`. Plan-packaging suggestions remain proposals; subscription billing and entitlements are unchanged.

## Advertised market comparison

These are vendor-published prices, not independently tested feature parity or evidence of customer adoption.

| Vendor | Advertised pricing | Comparison notes |
| --- | --- | --- |
| [Appointly.ph](https://www.appointly.ph/) | Basic PHP 999/month, currently PHP 599 founding offer; Premium PHP 2,499/month, currently PHP 1,499 | Basic advertises up to 10 staff and 3 branches. Separate temporary offers from regular prices. |
| [SukiSuite](https://sukisuite.com/) | Starter PHP 3,600/year (PHP 300/month equivalent); Pro PHP 33,480/year (PHP 2,790/month equivalent) | Annual totals, not monthly payment amounts. Starter focuses on booking/client care; Pro advertises commissions, payroll support, POS and inventory. |
| [PwesTo](https://pwesto.space/pricing) | Manage PHP 999/month under a founding offer | Adjacent modular operations product; advertised transaction fees of 0–2% and paid modules can affect total cost. |
| [Fresha](https://www.fresha.com/pricing) | Team USD 14.95 per bookable team member/month | Five bookable staff cost USD 74.75/month before extras. Marketplace-acquired new clients carry a separate one-time 20% fee, minimum USD 6. USD display is not a verified Philippine checkout quote. |

## Recommendation to validate

PHP 1,299/month is a plausible starting price for a small business with several service staff. It is above local entry offers; compete on the connected booking-to-earnings workflow, ease of adoption, and reliable support. Competitor prices alone do not establish willingness to pay or sustainable margins.

| Plan | Approved monthly price | Approved annual upfront total | Proposed value |
| --- | ---: | ---: | --- |
| Starter | PHP 1,299 | PHP 12,990 | Bookings, customer records, staff, attendance, eligible commissions, payslips, core reports |
| Plus | PHP 1,999 | PHP 19,990 | Starter plus growth insights and advanced reports |
| Pro | PHP 2,999 | PHP 29,990 | Plus plus social tools and a defined AI allowance |

Annual totals charge ten monthly payments for twelve months, a 16.67% discount. Display the upfront annual charge clearly. Annual billing must be implemented and verified before it can be sold through the subscription flow.

Consider including basic public booking in Starter: local alternatives include booking at low entry prices. This is a proposed packaging change, not the current entitlement. Price per business/location with an explicit staff allowance; do not promise unimplemented multi-location features. Determine allowances using observed support and infrastructure costs.

Avoid unlimited generated images or SMS bundles without measured costs. Audit hosting, storage, messaging, AI, payment processing and support costs per active business. An illustrative 80% gross margin at PHP 1,299 requires direct monthly cost at or below PHP 259.80, assuming PHP 1,299 is net revenue; this is a target, not an estimate of current costs.

Validate with 5–10 paid pilot businesses over at least two pay cycles. Track paid conversion, onboarding time, weekly usage, successful commission/payslip reviews, support time and renewal. Do not lower prices solely in response to promotional competitor prices.

## Landing-page scope

The `/redesign` pricing selector offers Monthly and Annually with the existing shared sliding indicator. Monthly cards show PHP 1,299 / 1,999 / 2,999. Annual cards show upfront totals of PHP 12,990 / 19,990 / 29,990, labeled per year and billed annually, with respective savings of PHP 2,598 / 3,998 / 5,998. The annual note states “Pay yearly. Get 2 months free.” Switching back restores monthly amounts immediately. All application links still lead to `/apply`; billing period is reviewed during setup. Operational billing remains monthly-only; this change does not enable annual subscription transactions.

Focused verification: `npx.cmd vitest run components/landing/hanaylo/MobiloLanding.test.tsx` passed 8 tests, including all monthly amounts, annual totals, savings, application links and switching back. Desktop and 320px mobile browser checks confirmed annual prices fit without horizontal overflow. Earlier selector checks confirmed indicator alignment, keyboard activation and reduced-motion behavior.

`npm.cmd run lint -- --max-warnings=0`, `npm.cmd run typecheck`, and scoped whitespace checks passed after the price-card changes. Next.js reported no compilation or runtime errors. Database/authenticated E2E suites were not run: operational billing and data access are unchanged.

`npm.cmd run build:app` was attempted but stalled at “Creating an optimized production build” without a diagnostic. The verified build process was stopped after repeated checks showed negligible CPU progress. Production-build verification is incomplete; the development server was left running. The first sandboxed Vitest attempt also hit a temporary-file EPERM; the subsequent permitted rerun passed all eight tests.
