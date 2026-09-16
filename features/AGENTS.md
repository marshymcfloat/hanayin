# Feature Module Instructions

These instructions extend the repository root `AGENTS.md` for `features/`.

## Ownership and Layout

- Use `features/<domain>/` as the canonical home for domain-owned services,
  validation schemas, queries, types, rollout rules, and tests.
- Colocate unit tests as `*.test.ts` or `*.test.tsx` beside the owned module.
- Expose intentional cross-feature capabilities through clearly named public
  modules. Do not import another feature's tests or private implementation.
- Keep route handlers, pages, and reusable presentation primitives outside
  feature modules unless a component is private to that domain.

## Boundaries

- Accept verified actor and tenant context at protected feature boundaries.
- Keep untrusted transport shapes out of domain logic; validate them before
  invoking a use case.
- Feature modules may depend on shared infrastructure in `lib/` and persistence
  in `prisma/`. Shared infrastructure must not depend on feature internals.
- Avoid circular feature dependencies. If two domains require each other,
  extract a narrow shared contract or coordinate through an application-level
  use case.

## Migration

- Move the smallest coherent legacy unit and its tests when touching it.
- Update all imports and mocks in the same change; do not leave compatibility
  re-export files in legacy paths unless a public package boundary requires it.
- Preserve behavior during structural moves and prove it with focused tests.
- Treat files under `actions/` as server transport boundaries. Keep new actions
  thin and extract domain or persistence logic from migrated action modules when
  changing them.
