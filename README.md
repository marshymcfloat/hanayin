# ServiceFlow

ServiceFlow is a multi-tenant operations platform for service businesses. It
combines public booking, customer and catalog management, staffing, attendance,
payroll, billing, growth workflows, social publishing, and platform
administration in one Next.js application.

![ServiceFlow logo](public/serviceFlow_logo_no_bg.png)

## Capabilities

- Public storefronts and booking flows by business slug.
- Booking management, services, packages, vouchers, gift cards, and sale events.
- Customer records, attendance, leave, payroll, payslips, and staff permissions.
- Owner, employee, cashier-aware, and platform-administrator experiences.
- Subscription billing, referrals, onboarding applications, and audit history.
- Growth campaigns, social-post requests, AI-assisted creative generation, and
  Meta publishing.
- Email and SMS workflows, reminders, re-engagement, transactional outbox, and
  authenticated cron jobs.
- Manual GCash verification and public business QR delivery.

## Technology

- Next.js 16 App Router and React 19.
- TypeScript and Tailwind CSS 4.
- PostgreSQL and Prisma 7 using `@prisma/adapter-pg`.
- NextAuth credentials and onboarding magic-link authentication.
- TanStack Query, Radix UI primitives, and React Hook Form with Zod.
- Vitest, Testing Library, and Playwright.
- Sentry and Vercel Analytics.
- Vercel Blob, Resend, SMS, Meta, Gemini, and OpenAI integrations when
  configured.

See [ARCHITECTURE.md](ARCHITECTURE.md) for current boundaries and the target
feature-first modular-monolith structure. Repository contribution rules are in
[AGENTS.md](AGENTS.md). Frontend, backend, and verification work must also follow
[FRONTEND.md](FRONTEND.md), [BACKEND.md](BACKEND.md), and the
[harness-engineering workflow](docs/harness-engineering.md).

## Local Setup

### Prerequisites

- Node.js 22, matching CI.
- npm and the committed `package-lock.json`.
- PostgreSQL 16 recommended, matching CI.

### 1. Install dependencies

```bash
npm ci
```

### 2. Configure the environment

Create a local `.env`. Environment files are ignored and must never be
committed. Do not copy production secrets into local development.

Minimum application setup:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
DIRECT_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
NEXTAUTH_SECRET="generate-a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

In local development, the application and Prisma CLI use
`DIRECT_DATABASE_URL`, which must target the dedicated development database.
Production application traffic uses `DATABASE_URL`. Production migration jobs
must provide a production-scoped `DIRECT_DATABASE_URL` explicitly.

Prisma CLI commands fail closed when `DIRECT_DATABASE_URL` is missing; they
never fall back to `DATABASE_URL`. Confirm the target before running destructive
commands such as `prisma migrate reset`.

Optional features require additional variables:

| Feature | Variables |
| --- | --- |
| Cron authentication | `CRON_SECRET`, or `CRON_USER` and `CRON_PASSWORD` |
| Email | `RESEND_API_KEY` |
| SMS | `SEMAPHORE_API`, `SEMAPHORE_SENDER_NAME` |
| Uploads and generated assets | `BLOB_READ_WRITE_TOKEN` |
| Meta publishing | `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_GRAPH_API_VERSION`, `SOCIAL_TOKEN_ENCRYPTION_KEY`, `SOCIAL_OAUTH_STATE_SECRET` |
| Gemini generation | `GEMINI_API_KEY` or `GEMINI_KEY`, `GEMINI_CAPTION_MODEL`, `GEMINI_IMAGE_MODEL`, `GEMINI_REQUEST_TIMEOUT_MS` |
| OpenAI image generation | `OPENAI_API_KEY` or `OPENAI_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_SIZE`, `OPENAI_IMAGE_QUALITY`, `OPENAI_IMAGE_OUTPUT_FORMAT`, `OPENAI_IMAGE_TIMEOUT_MS` |
| Reference-image discovery | `PEXELS_API_KEY` |
| Rate limiting | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Signed public flows | `BOOKING_SUCCESS_TOKEN_SECRET`, `ONBOARDING_LOGIN_TOKEN_SECRET`, `ONBOARDING_STATUS_TOKEN_SECRET` |
| Feature rollout | `BOOKING_EDITOR_ENABLED`, `BOOKING_EDITOR_PILOT_SLUGS`, `SOCIAL_POST_REQUESTS_ENABLED`, `SOCIAL_POST_REQUESTS_PILOT_SLUGS`, `SOCIAL_PUBLISHING_ENABLED`, `SOCIAL_PUBLISHING_PILOT_SLUGS` |
| Billing and trials | `PLATFORM_BILLING_EMAILS`, `DEFAULT_TRIAL_MONTHS`, `SUBSCRIPTION_ENFORCEMENT_MODE` |
| Runtime tuning | `APP_URL`, `PRISMA_POOL_MAX`, `QR_HOLD_EXPIRY_SECONDS`, `NEXT_PUBLIC_CSP_CONNECT_SRC`, `NEXT_PUBLIC_CSP_FRAME_SRC` |
| Repository monitoring | `GITHUB_MONITOR_REPO`, `GITHUB_MONITOR_TOKEN` or `GITHUB_TOKEN` |

Copy [`.env.example`](.env.example) for the complete placeholder-only template.
Token-specific secrets fall back to `NEXTAUTH_SECRET`, but separate production
secrets are preferred.

### 3. Apply migrations

For an existing checkout or fresh local database, apply committed migrations:

```bash
npx prisma migrate deploy
```

Use the following only when intentionally creating a schema migration against a
disposable development database:

```bash
npx prisma migrate dev --name <description>
```

Optional development seed:

```bash
npx prisma db seed
```

Never seed or reset an unknown or shared database.

### 4. Start development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run start` | Start an existing production build. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm run check:boundaries` | Reject new UI-to-Prisma and feature-to-route dependency violations. |
| `npm run test` | Run Vitest in watch mode. |
| `npm run test:unit` | Run isolated unit and component tests with coverage. |
| `npm run test:ci` | CI-compatible alias for `npm run test:unit`. |
| `npm run test:integration` | Run real-PostgreSQL integration tests; requires `DIRECT_DATABASE_URL`. |
| `npm run test:e2e:core` | Run platform, private-route, and owner-growth Playwright smoke tests. |
| `npm run test:e2e:db` | Run the database-backed public-booking smoke test; requires direct `E2E_DATABASE_URL` or `DIRECT_DATABASE_URL`. |
| `npm run test:e2e` | Run core and database E2E suites with the same database guard. |
| `npm run build:app` | Build the Next.js application without applying migrations. |
| `npm run build` | Require `DATABASE_URL` and a direct `DIRECT_DATABASE_URL`, safely deploy migrations, then build the application. |
| `npm run check` | Run strict lint, typecheck, isolated tests, and the application build. |
| `npm run check:push` | Compatibility alias for `npm run check`. |
| `npm run verify:release` | Run lint, typecheck, coverage, all E2E suites, migrations, and the release build. |

Playwright uses `http://127.0.0.1:3100` and starts the development server
automatically. Install Chromium before the first local E2E run:

```bash
npx playwright install chromium
```

See [Test structure and dependencies](docs/testing.md) for suite boundaries,
database requirements, and external-service policy.

## API and Operational Routes

### Application routes

- `GET /api/health` — application and database health.
- `POST /api/upload` — authenticated upload-token creation.
- `GET /api/public/gcash-qr` — public business QR lookup.
- `GET /api/reports/export` — authenticated report export.
- `GET /api/social/meta/connect` — begin an authenticated Meta connection.
- `GET /api/social/meta/callback` — complete the Meta OAuth callback.
- `/api/auth/[...nextauth]` — NextAuth handlers.

The Sentry example route and page are diagnostics and must not be treated as
product APIs.

### Authenticated cron routes

- `GET /api/cron/booking-conflicts`
- `GET /api/cron/expire-holds`
- `GET /api/cron/flow-reminders`
- `GET /api/cron/growth-daily`
- `GET /api/cron/process-outbox`
- `GET /api/cron/re-engagement`
- `GET /api/cron/reminders`
- `GET /api/cron/subscription-dunning`
- `GET /api/cron/subscription-referral-rewards`
- `GET /api/cron/subscription-renewals`

Cron authentication accepts either `Authorization: Bearer <CRON_SECRET>` or
HTTP Basic credentials using `CRON_USER` and `CRON_PASSWORD`. An external
scheduler owns invocation frequency; `vercel.json` currently defines no Vercel
cron schedule.

## Security and Tenancy

- `proxy.ts` protects tenant and platform routes and rate-limits API traffic.
- Server Actions and Route Handlers must repeat authentication and authorization
  at the server boundary.
- Tenant-owned operations derive business identity from verified session context
  and scope persistence by that identity.
- Staff permissions and subscription read-only state gate protected mutations.
- API rate limiting uses the configured remote REST store when available and
  route-specific fallback behavior otherwise.
- Private dashboard and platform pages are not intended for search indexing.
- Security headers are configured in `next.config.ts`.

## Deployment

### Vercel

1. Configure the required application and integration variables.
2. Apply production migrations through the release build or a controlled
   migration step.
3. Configure an external scheduler for the authenticated cron routes.
4. Configure Meta callback URLs and other provider callbacks for the production
   origin.

### Docker

The repository includes a multi-stage Dockerfile. It currently uses Node 18,
while CI uses Node 22 and the application depends on Next.js 16. Upgrade the
Docker base image to Node 22 before treating Docker as a supported production
path. The image build runs the release build, so database configuration and
migration connectivity are required during the builder stage.

## Repository Structure

```text
app/                    Next.js routes, layouts, pages, and Route Handlers
components/             Shared and feature-specific React components
features/               Target location for feature-owned domain modules
hooks/                  Shared React hooks
lib/                    Shared and transitional services and infrastructure
prisma/                 Schema, migrations, shared client, generated code, seed
public/                 Static assets
scripts/                Environment and migration utility scripts
test/e2e/               Playwright user-flow tests
test/integration/       Real-PostgreSQL integration tests
test/setup.ts           Shared Vitest setup
docs/                   Plans, runbooks, help content, and ADRs
design-system/          Brand and social-post visual profiles
types/                  Cross-cutting TypeScript declarations
```

The repository is migrating toward the feature-first structure defined in
`ARCHITECTURE.md`. Feature-owned action boundaries, validation schemas, rollout
rules, and tests now live under `features/<domain>/`. Large migrated action
modules remain candidates for incremental domain-service extraction.

## Documentation

- [Repository and agent rules](AGENTS.md)
- [Architecture](ARCHITECTURE.md)
- [Frontend engineering](FRONTEND.md)
- [Backend engineering](BACKEND.md)
- [Harness engineering workflow](docs/harness-engineering.md)
- [Test structure and evidence](docs/testing.md)
- [Ideas backlog](IDEAS.md)
- [Architecture decisions](docs/decisions/INDEX.md)
- [Harness-engineering history](docs/harness-engineering-todo.md)
- [Engineering work tracking](docs/work-tracking.md)
- [Repository structure and ownership](docs/repository-structure.md)
- [Production hardening checklist](docs/production-hardening-checklist.md)
- [Verification plan](docs/verification-plan.md)
