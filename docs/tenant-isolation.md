# Tenant Isolation Invariants

Last inventoried: 2026-09-07

ServiceFlow enforces tenant isolation in application code. PostgreSQL foreign
keys preserve relationships, but row-level security is not currently enabled.
Every server boundary must therefore derive tenant identity from authenticated
membership and visibly scope all tenant reads and writes.

## Universal Invariants

1. Never trust a client-provided `businessId` or slug as authorization.
2. Resolve the actor with `requireTenantAccess`, `requireStaffPermission`, or an
   owner/platform-specific guard before protected persistence.
3. Query direct-owned rows with verified `business_id` in `where`.
4. Query indirect-owned rows through a relation constrained to verified
   `business_id`; checking the child ID alone is forbidden.
5. When two tenant-owned records are linked, verify both resolve to the same
   business inside the write transaction.
6. Public access requires validated business slug plus the workflow proof
   appropriate to the data: signed token, OTP, ownership token, expiry, or an
   explicitly public projection.
7. Cache keys/tags include tenant identity. Logs and errors do not reveal the
   existence of another tenant's records.

## Model Ownership

### Tenant root and direct-owned models

`Business` is the tenant root. These models contain `business_id` and every
protected query must constrain it directly:

`LeaveRequest`, `BusinessHours`, `SaleEvent`, `SocialConnection`, `SocialPost`,
`Employee`, `SpecialDate`, `BrandAsset`, `ReferenceCandidate`, `Owner`,
`BusinessSubscription`, `SubscriptionPlanUpgradeRequest`,
`SubscriptionInvoice`, `ReferralCode`, `Service`, `ServicePackage`, `Customer`,
`BookingOtpCode`, `Booking`, `Voucher`, `GiftCard`, `ServiceFlow`,
`BusinessGrowthSettings`, `GrowthContextSnapshot`, `Opportunity`, `Campaign`,
`OutboxMessage`, `SocialPostRequest`, `AuditLog`, and `Expense`.

`PlatformActionLog.business_id` is optional because the log can describe a
platform-wide action. Tenant-facing access must still filter it; only verified
platform administrators may query it without a business constraint.

### Indirect-owned models

These models inherit tenant ownership through a required parent relation:

| Models | Required ownership path |
| --- | --- |
| `SocialPostTarget` | `social_post.business_id` and `social_connection.business_id`; both must match |
| `EmployeeSchedule`, `EmployeeAttendance`, `Payslip` | `employee.business_id` |
| `SubscriptionCreditLedger` | `business_subscription.business_id` |
| `ReferralLead` | `referral_code.business_id`; converted business is a separate target |
| `PackageItem` | `package.business_id` and `service.business_id`; both must match |
| `BookingPayment`, `BookingNote`, `BookingPriceAdjustment` | `booking.business_id` |
| `GiftCardService` | `gift_card.business_id` and `service.business_id`; both must match |
| `GiftCardPackage` | `gift_card.business_id` and `package.business_id`; both must match |
| `AvailedService` | `booking.business_id` plus service/provider ownership |
| `CampaignAsset`, `CampaignEvent` | `campaign.business_id` |

### Cross-tenant, global, and pre-tenant models

| Model | Invariant |
| --- | --- |
| `User` | Global identity; tenant capability comes only from its `Owner` or `Employee` membership, never role alone |
| `SubscriptionPlan` | Global catalog readable by tenants; mutation is platform-admin only |
| `SeasonalCalendar` | Global reference data; mutation is platform-controlled |
| `OnboardingApplication` | Pre-tenant/platform data; access requires status token for the applicant or platform-admin authorization |
| `ReferralAttribution` | Intentionally joins referrer and referred businesses; tenant views select only their authorized side and platform mutation owns lifecycle changes |

## Test Requirements

For every protected query or mutation, test an allowed tenant and a different
tenant using the same record ID shape. Critical indirect relations require a
database integration test proving cross-tenant linking is rejected by the use
case. Public projections must test invalid, expired, and cross-business proofs.
