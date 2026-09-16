# Role and Permission Enforcement

Last verified: 2026-09-07

This document operationalizes the product matrix in
`docs/role-permissions-matrix.md`. That matrix remains the source of truth for
booking-editor and social-request decisions.

## Enforcement Order

```text
authenticate session
  -> verify requested tenant equals session tenant
  -> resolve Owner/Employee membership for that tenant
  -> enforce subscription write access
  -> enforce role, profile, and permission
  -> apply business-policy modifiers
  -> execute tenant-scoped use case
```

UI visibility is not authorization. Server Actions and Route Handlers repeat
the complete applicable chain.

## Roles and Guards

| Actor/capability | Server enforcement | Notes |
| --- | --- | --- |
| Authenticated tenant read | `requireTenantAccess(slug)` | Slug must equal verified session tenant |
| Authenticated tenant write | `requireTenantAccess(slug, { write: true })` or `requireTenantWriteAccess` | Also blocks subscription read-only state |
| Delegated staff operation | `requireStaffPermission(slug, permission, { write: true })` | Resolves membership, profile, stored permissions, and business policy |
| Owner-only destructive write | `requireOwnerTenantWriteAccess(slug)` | Role-lock permanent deletion, sensitive settings, and non-delegable operations |
| Platform operation | `requirePlatformAdmin()` | Tenant membership is irrelevant; platform role is mandatory |
| Public operation | Workflow-specific signed token/OTP/rate-limit guard | Never infer authority from a slug or record ID |

## Permission Sources

- `Role`: `OWNER`, `EMPLOYEE`, `PLATFORM_ADMIN`.
- `StaffProfile`: `STAFF`, `MANAGER`, `CASHIER`.
- `StaffPermission`: booking create/modify/cancel/no-show/price, payment collect
  and verify, queue self/override, catalog, social request/review/publish.
- `OwnerPermission`: billing, reports, employee/staff, settings, catalog, and
  payroll capabilities for co-owner delegation.
- Business policy: structure, employee self-booking, and manager serving flags.

Owners pass `hasStaffPermission` for tenant operational permissions, but
co-owner administration must still honor `OwnerPermission`. Platform admins do
not automatically become tenant actors; impersonation must produce an explicit,
auditable tenant context.

## Required Coding Rules

- Use `resolveTenantActorContext`; do not rebuild actor state from raw role and
  profile strings.
- Pass the narrow enum permission matching the operation.
- Keep client viewer-context helpers derived from server-provided capabilities.
- Denials return `Unauthorized` for no valid identity and `Forbidden` for an
  authenticated actor without access. Do not reveal whether a foreign record
  exists.
- Permission changes, impersonation, owner changes, financial actions, booking
  modifications, and social publication require audit records.
- Tests must table-drive owner, each staff profile, explicit grants/removals,
  business-policy modifiers, subscription read-only state, and cross-tenant
  denial.

## Known Enforcement Debt

`OwnerPermission` enforcement is currently concentrated in owner-management
actions and is not yet a single reusable guard comparable to
`requireStaffPermission`. Future co-owner-sensitive migrations should introduce
that guard before expanding delegated owner capabilities.
