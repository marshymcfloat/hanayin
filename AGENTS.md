# ServiceFlow Agent Instructions

These instructions apply to the entire repository. More specific `AGENTS.md`
files may override them within their directories.

## Project

ServiceFlow is a multi-tenant SaaS application built with Next.js 16, React 19,
TypeScript, PostgreSQL, Prisma 7, Vitest, and Playwright.

Install dependencies with `npm ci` and start local development with
`npm run dev`.

## Working Rules

- Inspect the relevant implementation, tests, and configuration before editing.
- Preserve unrelated user changes. Never discard or rewrite work outside the
  requested scope.
- Never read, expose, overwrite, or commit `.env` files or secret values.
- Use the `@/` import alias for repository modules.
- Reuse existing shared utilities and domain logic instead of duplicating them.
- Keep changes scoped. Do not combine feature work with unrelated cleanup.
- Add or update focused tests whenever behavior changes or a defect is fixed.
- Do not hand-edit generated files, build output, coverage output, or test
  artifacts.

## Work Tracking

- Use Linear as the source of truth for active work status, priority, owner,
  dependencies, and target cycle when the integration is available.
- Keep repository Markdown as the source of truth for architecture, engineering
  rules, invariants, runbooks, decisions, and durable implementation guidance.
- Link substantial Linear issues to the relevant repository documentation and
  link pull requests or completion evidence back to the issue.
- Do not mirror changing Linear status in Markdown checklists. Update repository
  documents only when durable guidance or the implemented architecture changes.
- Delegate an issue to Codex only after its scope, acceptance criteria, affected
  repository, and required verification are explicit. Prefer one bounded feature
  slice per issue and avoid parallel tasks that modify the same modules.
- If Linear is unavailable, continue safe in-scope work and reconcile its issue
  status when access returns. See `docs/work-tracking.md` for the full workflow.

## Target Architecture

New and modified code must follow a feature-first structure:

- `features/<domain>/` owns domain services, validation schemas, domain types,
  and colocated tests.
- `app/` owns routes, layouts, pages, and thin Route Handler or Server Action
  adapters. Business logic does not belong here.
- `components/ui/` owns reusable presentation primitives. Components must not
  access Prisma directly.
- `lib/` is reserved for infrastructure and utilities shared across multiple
  features. Do not place feature-specific business logic here.
- `prisma/` owns the schema, migrations, generated client, and database helpers.

Do not create directories whose names contain spaces. Removed legacy paths such
as `lib/server actions/`, `lib/zod schemas/`, `lib/zod-schemas/`, and
`lib/next auth/` must not be recreated.

When a task modifies a legacy module, migrate the touched unit to the target
structure if the move remains within task scope and all imports and tests can be
updated safely. Do not expand a small task into a broad repository migration.

## Server and Data Boundaries

- Keep database access and secrets in server-only code.
- Validate untrusted input with Zod at Server Action, Route Handler, webhook,
  cron, and other external boundaries.
- Authenticate requests before protected database work.
- Enforce tenant access and required permissions before reads or writes.
- Derive tenant identity from verified authentication context. Never trust a
  client-provided business identifier without checking it against that context.
- Scope tenant-owned queries and mutations by the verified business identity.
- Use a database transaction when multiple writes must succeed or fail together.
- Return safe errors to clients; do not expose secrets, SQL, or internal stack
  traces.
- Create a new Prisma migration for schema changes. Never edit an already
  committed migration.

## Verification

Use risk-based verification. For application-code changes, run before handoff:

```bash
npm run lint -- --max-warnings=0
npm run typecheck
```

Also run the focused Vitest tests covering the changed behavior.

For documentation-only changes, inspect the rendered content where practical
and run `git diff --check`; lint, typecheck, build, and tests are not required.

Run additional checks when relevant:

- `npm run build:app` for changes to routes, configuration, dependencies,
  rendering boundaries, or production behavior.
- `npm run test:e2e:core` for affected authenticated or platform user flows.
- `npm run test:e2e:db` for the public booking database flow.
- Database integration tests for Prisma schema, migrations, constraints,
  transactions, or database-dependent behavior.
- `npm run verify:release` only for release validation with the required
  database and E2E environment configured.

Do not claim a check passed unless it was run successfully. At handoff, report
the commands run, their results, any skipped checks, and remaining risks.
