# Engineering Work Tracking

Last reviewed: 2026-09-16

ServiceFlow uses Linear for active execution and repository documentation for
durable engineering knowledge. The two systems have different responsibilities
and must not become competing backlogs.

## Sources of Truth

| Information | Source of truth |
| --- | --- |
| Work status, priority, owner, dependencies, and target cycle | Linear |
| Architecture, boundaries, invariants, and engineering rules | Repository Markdown |
| Significant architectural decisions | `docs/decisions/` |
| Implementation and regression evidence | Code, tests, CI, and pull requests |
| Unapproved ideas and experiments | `IDEAS.md` |

Linear issues should link to the relevant repository documents. Pull requests
and completion summaries should link back to the issue. Do not update Markdown
solely to mirror a Linear status change.

## Linear Structure

Use a project for a bounded outcome with a planned completion point. The current
harness project is
[Harness Engineering - Phase 2](https://linear.app/serviceflow/project/harness-engineering-phase-2-6975eeac0fea),
with these milestones:

1. Thin Server Actions
2. Thin Route Handlers
3. Database and E2E Verification
4. Operational Reliability and Security

The initial Thin Server Actions backlog is:

| Issue | Work item | Priority | Dependency |
| --- | --- | --- | --- |
| [SER-5](https://linear.app/serviceflow/issue/SER-5/add-a-boundary-regression-ratchet) | Add a boundary regression ratchet | High | None |
| [SER-6](https://linear.app/serviceflow/issue/SER-6/thin-booking-creation-server-action) | Thin booking creation Server Action | Urgent | None |
| [SER-8](https://linear.app/serviceflow/issue/SER-8/thin-booking-self-service-server-actions) | Thin booking self-service Server Actions | Urgent | Blocked by SER-6 |
| [SER-7](https://linear.app/serviceflow/issue/SER-7/thin-payroll-payslip-workflows) | Thin payroll payslip workflows | High | None |

Use the workflow `Backlog -> Ready -> In Progress -> In Review -> Done`.

An issue is **Ready** only when it defines:

- the goal and bounded scope;
- affected modules and behavior that must remain stable;
- explicit exclusions;
- acceptance criteria;
- required focused, database, browser, build, or release verification;
- documentation or ADR impact.

An issue is **Done** only when the implementation is reviewed, required checks
pass, evidence is linked, and durable documentation is updated where necessary.

## Agent Delegation

- Delegate to Codex only after an issue is Ready.
- State the repository explicitly when the issue could map to more than one
  environment.
- Keep one coherent feature slice per issue.
- Run independent slices in parallel only when they do not modify the same
  modules or shared migration surface.
- Review all generated diffs and verification evidence before closing the issue.
- Never auto-assign high-risk payment, authentication, authorization, tenant,
  migration, or destructive work without explicit acceptance criteria and
  required human review.

## Issue Template

```markdown
## Goal

## Scope

## Out of scope

## Existing behavior to preserve

## Acceptance criteria

- Validate untrusted input at the boundary.
- Authenticate and authorize before protected persistence.
- Derive tenant identity from verified server context.
- Keep business decisions in a named feature service.
- Use an explicit transaction for atomic multi-write outcomes.
- Invalidate caches only after successful writes.
- Preserve safe, serializable responses.
- Add or update focused tests.

## Required verification

- Focused Vitest tests
- `npm run lint -- --max-warnings=0`
- `npm run typecheck`
- Risk-appropriate database, E2E, build, or release checks

## Documentation impact

## Evidence
```

## Repository Documents

- `ARCHITECTURE.md` describes current and target architecture.
- `docs/harness-engineering-todo.md` records the harness baseline and history.
- `docs/harness-engineering-cleanup-backlog.md` defines thin-action completion.
- `docs/testing.md` defines verification suites and environment requirements.
- `docs/decisions/` records accepted architectural decisions.
