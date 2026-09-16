# External Integration Inventory

Last inventoried: 2026-09-07

No integration may receive production credentials from tests. Provider calls
must occur outside database transactions, use bounded timeouts where supported,
return safe errors, and persist retry/idempotency state for externally visible
effects.

| Area | Provider/boundary | Main implementation | Failure behavior | Retry/idempotency |
| --- | --- | --- | --- | --- |
| Payments | Manual GCash verification; external PayMongo flow decommissioned | `features/payments/actions/manual-gcash.ts`, `features/payments/services/manual-gcash.ts` | Conditional transitions prevent stale verification; rejection/escalation/void reasons persist | Idempotency keys and conditional updates; notification uses transactional outbox plus best-effort immediate delivery |
| Email | Resend | `lib/services/outbox-delivery.ts`, `gift-cards.ts`, `flow-reminders.ts`, `re-engagement.ts`, `onboarding-applications.ts` | Provider errors are returned or stored; core business commit must not be rolled back after post-commit delivery failure | Outbox processor retries queued events; direct legacy senders use workflow-specific dedupe checks and remain migration debt |
| SMS/OTP | Semaphore | `lib/services/sms.ts`, `sms-otp.ts`, booking/invite services | Missing configuration or provider errors produce safe failures; message IDs/errors persist where modeled | Outbox retries notification events; OTP/confirmation fields and dedupe keys prevent duplicate workflow effects |
| Storage | Vercel Blob | `app/api/upload/route.ts`, `features/assets/actions/`, business/social asset actions | Upload/delete errors return safe action failures; database records should only reference successful uploads | No general automatic retry; orphan cleanup is operational debt; deletes must be idempotent |
| Social | Meta Graph API and OAuth | `lib/services/social/meta-client.ts`, `deliver-social-target.ts`, `app/api/social/meta/*` | OAuth/publish errors persist on connection/post target without exposing tokens | Target attempts/status plus outbox claim semantics; remote post IDs/permalinks provide idempotency evidence |
| AI content/images | Gemini and OpenAI Images | `lib/services/social/gemini-client.ts`, `openai-image-client.ts`, caption/promo-image services | Explicit timeout/configuration errors; caption/image workflows may use deterministic rescue/fallback behavior | User-initiated retry; no blind background retry for costly generation; generated assets persist only after success |
| Reference discovery | Pexels | `features/social/actions/reference-candidates.ts` | Fetch failure returns safe action error | Manual retry; provider/source uniqueness prevents duplicate candidates |
| Rate limiting | Upstash REST with in-memory fallback | `lib/rate-limit.ts` | Route-specific fail-open/fail-closed policy must be explicit; network error logged safely | Request can retry after window; pipeline request has no business side effect |
| Scheduling | External HTTP scheduler | `app/api/cron/**/route.ts` | Cron auth failure rejects; handlers return bounded counts/errors | Jobs query eligible state and use claims/dedupe/outbox state; overlapping invocation must be safe |
| Monitoring | Sentry plus structured logger and Vercel Analytics | `sentry.*.config.ts`, `instrumentation*.ts`, `lib/telemetry/` | Monitoring failure must not fail business operations | Telemetry is best effort; scrub secrets/PII and use stable event names |

## Cron Inventory

Authenticated cron routes cover booking conflicts, hold expiry, flow reminders,
growth-daily work, outbox processing, re-engagement, booking reminders,
subscription dunning, referral rewards, and renewals. Authentication uses
`CRON_SECRET` bearer or configured Basic credentials. The external scheduler
owns cadence; handlers must be re-entrant and batch-bounded.

## Outbox Delivery Contract

1. The business transaction writes an `OutboxMessage` with a stable dedupe key.
2. Commit completes before any provider call.
3. Immediate delivery may claim and attempt the row after commit.
4. The cron processor conditionally claims unprocessed rows, increments attempts,
   delivers, then records success or a safe error.
5. Terminal failures remain visible in platform operations; replay is an
   explicit audited action.

## Highest-Priority Debt

- Consolidate direct Resend/Semaphore callers behind the outbox delivery layer.
- Move Meta callback orchestration and cron persistence out of Route Handlers.
- Add explicit timeout/abort handling to every provider request.
- Define orphaned Blob cleanup and retention.
- Document each external scheduler cadence and alert threshold in operations.
