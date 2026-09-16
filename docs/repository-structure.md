# Repository Structure and Ownership

Last verified: 2026-09-16

"Owner" means the engineering role responsible for keeping a directory coherent.
It does not grant exclusive code ownership. Generated and local-only directories
must not be edited or committed as source.

## Source and Configuration Directories

| Directory | Owner | Purpose |
| --- | --- | --- |
| `.agent/` | Repository maintainers | Legacy repository-local agent skills and workflows; consolidate deliberately rather than adding duplicate guidance. |
| `.agents/` | Repository maintainers | Repository-local agent skills used for specialized work. |
| `.claude/` | Repository maintainers | Claude-specific commands and skills; local worktrees and settings remain untracked. |
| `.github/` | Platform/QA | GitHub Actions CI and repository automation. |
| `.idea/` | Repository maintainers | Shared JetBrains project configuration; machine-specific state does not belong here. |
| `.vscode/` | Repository maintainers | Shared VS Code workspace settings. |
| `app/` | Application/frontend | Next.js routes, layouts, pages, metadata, and thin Server Action or Route Handler adapters. |
| `components/` | Frontend/UI | Shared primitives and composed React interfaces; shared UI must not access Prisma. |
| `design-system/` | Design/frontend | Machine-readable brand and social-post visual direction. |
| `docs/` | Repository maintainers | Architecture, decisions, plans, runbooks, help content, and progress tracking. |
| `features/` | Domain feature owners | Canonical home for domain services, validation, queries, types, rollout rules, and colocated tests. |
| `hooks/` | Frontend/UI | React hooks that are genuinely shared across feature surfaces. |
| `lib/` | Platform/application | Cross-feature infrastructure plus transitional services, security, integrations, and utilities. New feature logic belongs in `features/`. |
| `prisma/` | Data/platform | Prisma schema, immutable migrations, shared client, generated client, seed, and reviewed SQL. |
| `public/` | Frontend/design | Static assets served directly by Next.js. |
| `scripts/` | Platform/QA | Checked-in operational, migration, environment, and development utilities. |
| `test/` | QA | Canonical shared-test location for Vitest setup, real-database integration tests, and Playwright E2E tests. Unit tests remain colocated with source. |
| `types/` | Application/platform | Cross-cutting TypeScript declarations and third-party type augmentation. |

## Local, Generated, or Tool-Owned Directories

| Directory | Owner | Purpose |
| --- | --- | --- |
| `.git/` | Git | Version-control metadata. Never edit manually. |
| `.next/` | Next.js | Generated development and build output. |
| `.playwright-cli/` | Browser tooling | Ignored local browser-automation logs and page snapshots. |
| `.playwright-mcp/` | Browser tooling | Local browser automation state. |
| `.vercel/` | Vercel CLI | Local project-link and deployment metadata. |
| `coverage/` | Vitest | Generated coverage reports. |
| `node_modules/` | npm | Installed dependencies from the lockfile. |
| `playwright-report/` | Playwright | Generated browser-test report. |
| `qa-screenshots/` | QA | Local visual-verification captures unless explicitly promoted to a reviewed fixture. |
| `test-results/` | Playwright | Generated traces, screenshots, videos, and failure artifacts. |

## Ownership Rules

- A feature owner controls business rules and the feature's public API.
- Application/frontend owns route composition and presentation, not domain
  persistence rules.
- Platform owns shared authentication, authorization, environment, logging,
  caching, provider, and database infrastructure.
- QA owns test-harness conventions; feature owners remain responsible for tests
  covering their behavior.
- Repository maintainers own cross-cutting documentation and structural policy.
- When a directory changes purpose, update this inventory, `ARCHITECTURE.md`,
  and relevant `AGENTS.md` instructions in the same change.
