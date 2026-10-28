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
- Read the nearest `AGENTS.md` plus the durable guide for the area being changed:
  `FRONTEND.md`, `BACKEND.md`, `docs/testing.md`, or
  `docs/harness-engineering.md`.
- For Next.js changes, read the relevant version-matched guides in
  `node_modules/next/dist/docs/`. Verify this documentation pointer after upgrades.
- Preserve unrelated user changes. Never discard or rewrite work outside the
  requested scope.
- Never read, expose, overwrite, or commit `.env` files or secret values.
- Use the `@/` import alias for repository modules.
- Reuse existing shared utilities and domain logic instead of duplicating them.
- Keep changes scoped. Do not combine feature work with unrelated cleanup.
- Add or update focused tests whenever behavior changes or a defect is fixed.
- Do not hand-edit generated files, build output, coverage output, or test
  artifacts.

## Internal App Scrollbars

- Use discreet, auto-hiding scrollbars throughout non-public app surfaces,
  including dashboards, sidebars, sheets, dialogs, lists, and tables.
- Show the thumb while its container scrolls. After about 800ms of inactivity,
  fade it out smoothly over 180–220ms instead of hiding it instantly.
- Keep tracks unobtrusive and remove scrollbar arrow buttons where supported.
  Reserve consistent space or use an overlay so visibility never shifts content.
- Preserve native wheel, touch, keyboard, and scrollbar-drag interactions. Keep
  scrollable regions keyboard-accessible; clean up listeners and idle timers.
- Respect reduced-motion preferences by skipping the fade. Preserve usable
  native fallbacks and accessibility/forced-color settings.
- Scope styling to internal app surfaces, not global `html`, `body`, or `*`.
  Public pages (including marketing, public booking, and customer-facing public
  routes) are excluded unless explicitly requested.
- Apply this standard when creating or modifying internal scrolling surfaces;
  do not turn a localized task into an unrelated app-wide migration.

## Tab and Segmented-Control Motion

- Tabs, segmented controls, and single-selection category filters should use a
  shared selected-state indicator that slides between options, matching the
  booking design study's Services/Packages and category controls. Do not simply
  swap independent button backgrounds or move the tab labels themselves.
- Reuse the existing sliding-indicator pattern in
  `components/bookings/design-study/AnimatedFilterGroup.tsx` where appropriate.
  Keep motion smooth and brief (roughly 200–350ms), and retarget from the current
  visual position when users switch rapidly rather than restarting or queuing.
- Keep selection and content updates immediate; animation must not block input.
  Account for variable-width labels, wrapping, resizing, and responsive layouts
  without shifting surrounding content.
- Preserve keyboard navigation, visible focus, and correct tab/button semantics.
  The indicator is decorative and must not intercept pointer events. Respect
  reduced-motion preferences by moving it immediately, and clean up animations
  and observers on unmount.
- Apply this when creating or modifying these controls; do not expand a focused
  task into an unrelated app-wide migration.

## Styled Dropdown Inputs

- Selects and other dropdown inputs must use accessible, custom-styled menus
  that match the surrounding page's fonts, colors, spacing, rounding, and motion.
  Do not rely on browser/OS-native dropdown visuals for designed app controls.
- Reuse existing primitives such as `components/ui/select.tsx`, dropdown menus,
  or comboboxes rather than building ad hoc replacements. Styling only a native
  `<select>` trigger is insufficient: its opened options must also match.
- Theme portaled menus explicitly; they do not inherit styles from the trigger's
  container. Preserve keyboard navigation, typeahead, focus return, Escape/outside
  dismissal, labels, disabled states, and selected-item indicators.
- Menus must fit the viewport, remain usable on mobile, and respect reduced
  motion. Apply the standard to new or touched controls without unrelated bulk
  migrations.

## Small Change Fast Path

Use this path for a localized markup, styling, copy, accessibility, or component
interaction fix that does not change shared architecture, routing, data access,
authentication, dependencies, or configuration.

- Inspect only `git status`, the nearest `AGENTS.md`, the affected
  implementation, the nearest relevant test, and the directly applicable
  section of one durable guide. Do not inventory or reread unrelated
  documentation.
- Keep the task contract concise: intended behavior, files in scope, behavior
  to preserve, and focused verification.
- Do not add redesign work, architectural review, broad refactoring, or
  unrelated cleanup unless the discovered cause requires it.
- Start with the cheapest focused check that can catch the regression. Run
  broader checks only when required by the Verification section or when the
  change crosses a listed boundary.
- If discovery has not produced a concrete edit plan within 10 minutes, report
  the exact blocker or scope expansion before continuing. Do not silently turn
  a small fix into a broad audit.

Escalate from this fast path only when evidence shows the change affects a
shared primitive, multiple routes, server or tenant boundaries, framework
configuration, dependencies, or an unclear product decision.

## Harness Engineering Workflow

Every implementation task must be reproducible from the repository, not from
unstated agent context. Follow this loop:

1. Establish the baseline with `git status`, the affected implementation,
   nearby tests, configuration, and applicable documentation. Do not overwrite
   unrelated work in a dirty tree.
2. State a bounded task contract: goal, in-scope modules, exclusions, behavior
   to preserve, acceptance criteria, and required verification.
3. Make the smallest coherent change. Keep route/UI adapters thin and domain
   decisions in the owning feature.
4. Add or update the lowest-cost test that can fail for the changed behavior.
   Escalate to database, browser, build, or release checks according to risk.
5. Inspect the final diff for scope, generated artifacts, secrets, debug code,
   stale documentation, and accidental dependency changes.
6. Report exact commands and outcomes, runtime evidence when required, skipped
   checks with reasons, and remaining risks. Never convert prepared or mocked
   coverage into a claim of executed integration proof.

For concurrent Codex tasks, use non-overlapping scopes and separate worktrees
for edits. One coordinator owns integration and final verification. Do not run
builds, typechecks, migrations, or database suites concurrently against shared
outputs or shared databases. See `docs/harness-engineering.md`.

## Next.js Rendering Rules

- Treat `params`, `searchParams`, `cookies()`, `headers()`, and uncached reads as
  request-time data under Cache Components.
- Put the request-time read inside the component covered by the nearest useful
  `<Suspense>` boundary. Wrapping only the component rendered after an outer
  `await` does not cover that read.
- Keep a meaningful static shell outside the boundary and use a visible,
  layout-stable fallback. Do not wrap the whole page or use `fallback={null}`
  unless an empty shell is intentional and reviewed.
- For a rendering-boundary change, run the focused checks and `npm run
  build:app`, then reload the affected route in a browser. Confirm the shell,
  fallback, resolved content, console, and Next.js overlay. Recheck sibling
  routes when shared layouts or wrappers changed.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
