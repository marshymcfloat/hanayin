# Application Boundary Contract

Last verified: 2026-09-07

This is the required implementation flow for Server Actions, Route Handlers,
webhooks, cron endpoints, and other entry points. Pages and React components
compose UI and call feature APIs; they do not own persistence or business rules.

## Architecture Decisions

| Decision | Required approach | Rejected approach | Reason |
| --- | --- | --- | --- |
| Transport ownership | `app/` parses requests and maps responses | Business workflows implemented in pages or Route Handlers | Keeps Next.js details outside domain rules |
| Validation | Zod at every untrusted boundary | Passing raw `FormData`, JSON, params, or headers inward | Produces typed input before protected work |
| Identity | Authentication and tenant identity are resolved server-side | Trusting user, role, or `businessId` supplied by a client | Prevents tenant and privilege escalation |
| Authorization | Permission and subscription-write checks precede protected data access | UI-only gates or post-query checks | Server boundaries are callable endpoints |
| Domain ownership | Feature use cases own policies and state transitions | Decisions embedded in UI conditionals | Enables isolated tests and reuse |
| Persistence | Feature queries/repositories own Prisma access | Prisma calls in pages and React components | Centralizes tenant scoping and transactions |
| Client responses | Explicit serializable success/error unions | Returning Prisma objects, exceptions, or stack traces | Stabilizes contracts and avoids data leakage |

## Required Flow

```text
Untrusted request
  -> parse and validate boundary input
  -> authenticate actor or verify public-flow proof
  -> derive and authorize tenant
  -> enforce permission and subscription write access
  -> invoke feature use case with verified context
  -> enforce domain invariants
  -> execute tenant-scoped persistence/transaction
  -> commit audit/outbox records atomically where required
  -> invalidate affected cache paths/tags
  -> map to a safe serializable response
```

### 1. Boundary validation

- Validate route params, query values, headers, JSON, and `FormData` with Zod.
- Normalize identifiers, dates, phone numbers, enum values, and optional fields
  once at the boundary.
- Reject invalid input before authentication-dependent database work where doing
  so does not reveal protected resource existence.
- Do not pass transport objects (`Request`, `FormData`, `URLSearchParams`) into
  domain services.

### 2. Authentication and public proof

- Protected boundaries resolve the current session inside the server function.
- Public booking-management operations verify the required signed token, OTP,
  expiry, rate limit, or ownership proof.
- Proxy and client-side visibility checks are defense-in-depth only; they do not
  replace authentication at the operation boundary.

### 3. Tenant and capability authorization

- Derive `businessId` and business slug from verified actor membership.
- Compare requested route slugs to verified membership before tenant reads.
- Enforce role/permission and subscription read-only policy before writes.
- Platform operations require the platform-admin role and must not reuse tenant
  membership as authorization.

The only context accepted by a protected use case is a verified context, for
example:

```ts
type VerifiedTenantActor = {
  userId: string;
  businessId: string;
  businessSlug: string;
  role: "OWNER" | "EMPLOYEE";
};
```

### 4. Domain logic

Feature use cases under `features/<domain>/` own:

- state transitions and invariants;
- pricing, eligibility, capacity, and permission-independent policies;
- orchestration across repositories and provider adapters;
- typed domain outcomes and error codes.

Use cases must not import React, route modules, or browser APIs. Pure policies
should be separated from persistence so they can be tested without Prisma.

### 5. Persistence

- Prisma access belongs in feature query/repository modules or shared
  infrastructure when genuinely cross-feature.
- Every tenant-owned query includes the verified `businessId`, either directly
  in `where` or through a relation constrained by it.
- Use `$transaction` when multiple writes form one outcome.
- Write required audit and outbox records in the same transaction as the state
  change. External delivery occurs after commit and must be retry-safe.
- Select only fields required by the domain result or response mapper.

### 6. Response mapping and invalidation

- Convert domain results into explicit serializable DTOs.
- Return stable unions such as
  `{ success: true, data } | { success: false, error: { code, message } }`.
- Log internal diagnostics server-side, but return safe messages without SQL,
  provider payloads, secrets, stack traces, or cross-tenant existence details.
- Revalidate affected tenant paths or tags only after persistence succeeds.
- Pages may format dates and compose presentational view models; reusable
  business-derived mapping belongs to the owning feature.

## File Placement

```text
app/**/page.tsx or route.ts       Route composition and transport mapping
features/<domain>/schemas.ts      Boundary-compatible Zod schemas
features/<domain>/use-cases/*.ts  Business workflows and invariants
features/<domain>/queries/*.ts    Read persistence and DTO selection
features/<domain>/repositories/*  Write persistence and transactions
features/<domain>/*.test.ts       Isolated feature behavior
test/integration/                 Real PostgreSQL boundary behavior
```

Existing feature layouts may be flatter. Do not add directory depth unless the
feature needs it; ownership and dependency direction matter more than naming.

## Review Checklist

- [ ] All untrusted input is parsed before use.
- [ ] Authentication/public proof is repeated inside the boundary.
- [ ] Tenant identity is derived, not trusted from the client.
- [ ] Permission and subscription checks happen before protected persistence.
- [ ] Domain decisions live in a feature module.
- [ ] Tenant-owned queries are visibly tenant-scoped.
- [ ] Atomic writes, audit, and outbox use one transaction where required.
- [ ] Errors and returned fields are safe and serializable.
- [ ] Successful writes invalidate the correct tenant cache.
- [ ] Unit tests cover domain outcomes; integration tests cover critical storage
  behavior; E2E covers critical user-visible flows.

## Common Failure Signals

| Signal | Impact | Required fix |
| --- | --- | --- |
| `@/prisma/prisma` imported by a page/component | UI owns persistence and tenant scope | Extract a feature query returning the minimal DTO |
| Server Action accepts `businessId` and queries it directly | Cross-tenant access risk | Resolve membership and use verified context |
| Route catches every error and returns its message | Internal information leak | Map known domain codes; log unknown errors safely |
| Audit/outbox write occurs after the main transaction | Missing compliance/event history | Include it in the transaction |
| Mutation succeeds but UI stays stale | Incorrect cache contract | Revalidate the owning path/tag after commit |

The rules are enforced by `npm run check:boundaries`. Existing direct-Prisma UI
debt is eliminated. Reviewed direct-Prisma feature actions and Route Handlers
are explicit shrinking allowlists in `scripts/architecture-boundaries.json`;
new violations and stale entries fail.
