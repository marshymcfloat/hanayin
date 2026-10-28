# Harness Engineering

Status: normative workflow

Last reviewed: 2026-09-25

## Purpose

Harness engineering makes correct repository work repeatable for humans and
agents. The harness is the combination of scoped instructions, architecture
rules, executable checks, deterministic fixtures, guarded environments, runtime
inspection, and evidence. A checklist alone is not a harness; the repository
must make the safe path easy to discover and failures actionable.

This document defines the workflow. Historical progress remains in
`docs/harness-engineering-todo.md`; bounded cleanup history remains in
`docs/harness-engineering-cleanup-backlog.md`; suite-specific evidence remains
in `docs/testing.md`.

## Sources of Truth

| Concern | Source |
| --- | --- |
| Repository-wide agent rules | `AGENTS.md` and the nearest nested `AGENTS.md` |
| Current and target system structure | `ARCHITECTURE.md` |
| Frontend implementation rules | `FRONTEND.md` |
| Backend implementation rules | `BACKEND.md` |
| Test layers, environments, and known proof | `docs/testing.md` |
| Active priority, status, owner, and dependencies | Linear when available |
| Significant irreversible decisions | `docs/decisions/` |
| Unapproved opportunities | `IDEAS.md` |

When sources disagree, stop and reconcile the durable rule before expanding the
change. Do not hide a contradiction with task-local instructions.

## Task Contract

For standard and high-risk work, write or confirm a task contract containing:

```markdown
## Goal

## In scope

## Out of scope

## Existing behavior and invariants to preserve

## Acceptance criteria

## Required verification

## Documentation or ADR impact
```

Small tasks may use the concise contract defined below. Otherwise, the contract
must name affected modules and runtime routes when known. A task is not ready
for delegation when success depends on an unstated product decision, unknown
database ownership, unavailable credentials, or overlapping edit scope.

## Task Sizing and Fast Path

Classify work before discovery expands:

| Size | Typical scope | Discovery depth |
| --- | --- | --- |
| Small | One localized UI, copy, style, accessibility, or interaction fix | Affected file, nearest test, nearest instructions, and the directly relevant guide section |
| Standard | Several modules inside one feature or route | Owning feature, callers, focused tests, configuration, and applicable durable guides |
| High risk | Shared architecture, auth, tenancy, database, dependencies, build, or multiple routes | Full affected boundary and all evidence needed to protect its invariants |

For a small task:

- Do not scan the repository documentation tree or reread unrelated guides.
- Use a short task contract rather than producing a full design exercise.
- Avoid broad design audits, architecture reviews, refactors, and cleanup that
  are not required by the observed defect.
- Inspect shared primitives or sibling routes only when the affected code or
  failed check shows that the behavior crosses those boundaries.
- Run the focused regression check first. Add broader verification only when a
  repository rule requires it or the change's actual risk justifies it.
- If no concrete edit plan exists after 10 minutes of discovery, report the
  specific blocker, ambiguity, or evidence requiring broader scope before
  continuing.

Task size may increase when evidence requires it. The reason and added scope
must be explicit; task size must not increase merely because additional
documentation or optional analysis is available.

## Work Loop

### 1. Discover

- Read the applicable instructions and version-matched framework docs.
- Inspect the current `git status` and the implementation, tests, callers,
  configuration, and durable decisions required by the assigned task size.
- Record the observable failure or baseline before changing code.
- Identify secrets, databases, providers, generated outputs, and shared runtime
  state that the task must not touch.

### 2. Design the smallest change

- Choose the owning feature and the narrowest boundary that fixes the behavior.
- Preserve public contracts unless caller migration is explicitly in scope.
- Name any adjacent refactor and obtain scope approval before including it.
- Select the cheapest verification layer that can catch the regression, then add
  higher layers only for properties they uniquely prove.

### 3. Implement

- Keep adapters thin, dependencies one-directional, and state transitions
  explicit.
- Add tests with the behavior change, not after a broad refactor.
- Fail closed for authorization, database selection, migrations, destructive
  operations, and unavailable security-critical infrastructure.
- Do not weaken assertions, coverage floors, lint rules, or environment guards
  to make a change pass.

### 4. Verify

Use risk-based layers:

| Change | Required evidence |
| --- | --- |
| Documentation only | Render/read affected Markdown and run `git diff --check` |
| Pure domain logic | Focused Vitest, strict lint, typecheck |
| React behavior | Focused component test plus browser inspection when visual or interactive |
| Route/rendering/configuration | Focused tests, strict lint, typecheck, `npm run build:app`, browser reload/navigation |
| Prisma/transaction/concurrency | Focused unit tests plus guarded disposable PostgreSQL integration tests |
| Critical user journey | Relevant Playwright flow with screenshots, trace, or explicit observations on failure |
| Release | `npm run verify:release` with all required isolated infrastructure configured |

Prepared fixtures, skipped suites, mocked delegates, a successful build, and a
dev overlay each prove different things. Report only the evidence actually run.

For UI and Next.js runtime fixes, browser inspection is mandatory. Reload the
route, exercise client navigation, observe loading and resolved states, check
the console and overlay, and inspect sibling routes when shared shell code
changed. A build-only result does not prove what users see.

### 5. Review and hand off

- Review `git diff --check`, the scoped diff, new files, and generated artifacts.
- Confirm no secrets, debug endpoints, temporary flags, screenshots, reports,
  or unrelated cleanup entered the change.
- Report changed behavior and why, exact successful and failed commands, runtime
  observations, skipped checks and reasons, remaining risks, and follow-up work
  that is explicitly out of scope.

## Harness Quality Rules

A reliable harness is:

- **Deterministic:** fixed inputs, controlled time/randomness, isolated storage,
  and no accidental live-provider calls.
- **Fail-closed:** missing or ambiguous security and database configuration
  stops execution.
- **Representative:** each layer exercises the real boundary it claims to prove.
- **Observable:** failures identify the violated invariant and retain useful
  artifacts without leaking secrets.
- **Bounded:** commands have finite work, timeouts, controlled concurrency, and
  cleanup scoped to fixture-owned resources.
- **Portable:** documented commands work locally and in CI with the same
  assumptions.
- **Maintainable:** one authoritative rule, narrow allowlists, version-matched
  docs, and no duplicated changing status across Markdown files.

## Parallel Task Rules

- One coordinator owns task decomposition, documentation, integration order,
  final verification, and status reconciliation.
- Editing tasks use separate worktrees and non-overlapping module scopes.
- Read-only audits may share a checkout but must not mutate generated outputs or
  run competing builds and test runners.
- Databases, provider accounts, ports, `.next`, coverage, and test artifacts are
  shared unless explicitly isolated. Worktrees do not make them safe.
- Merge or apply one slice at a time, inspect the combined diff, then run final
  checks sequentially from the integration checkout.

## Documentation Maintenance

- Update a durable document only when architecture, rules, invariants, runbooks,
  or implemented behavior changes.
- Keep active status and priority in Linear; do not mirror a live backlog in
  multiple files.
- Add an ADR before a difficult-to-reverse architectural decision.
- Date a document only after checking the sections claimed as current.
- Prefer links to one authoritative explanation over duplicated instructions.
- During the monthly harness review, check command accuracy, dependency and
  framework versions, boundary allowlists, test isolation, stale evidence, and
  contradictions between agent rules and implementation.
