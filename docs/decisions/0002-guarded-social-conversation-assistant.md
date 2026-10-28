# ADR-0002: Guarded social customer-conversation delivery

- Status: Accepted (local implementation; live activation gated)
- Date: 2026-10-04
- Deciders: Product owner, security/privacy reviewer, backend maintainer
- Supersedes: None
- Superseded by: None

## Context

[IDEA-004](../../IDEAS.md) proposes an optional Meta customer-conversation
assistant. Existing social OAuth/publishing and the generic outbox do not
establish messaging permissions, webhook receipt ownership, durable conversation
state, or reliable human takeover. The reversible owner lab can test pure rules
and read-only facts without any persistent settings or customer delivery. It
does not depend on acceptance of this ADR.

This decision applies to the customer inbox implementation, not the publishing lab.
An unanswered message after two minutes is useful for routine public questions;
“owner has not seen it” is not an authoritative trigger from a read receipt.

## Decision drivers

- No cross-tenant or private-data disclosure.
- Explicit owner opt-in, privacy consent, channel-specific permission checks,
  human takeover, opt-out, and a global kill switch.
- Ground replies in current approved facts; no booking or financial mutations.
- Durable duplicate/order/race handling, bounded latency/cost, safe recovery.
- No unsupported exactly-once guarantee across database and Meta HTTP delivery.

## Options considered

### A: Reuse generic outbox retries with a two-minute timer

Small initial implementation, but insufficient conversation revision checks,
lease ownership, human-reply suppression, and unknown-send reconciliation.
Retried external sends can duplicate replies after an unobserved success.

### B: Dedicated guarded conversation state and delivery jobs

Tenant-owned opt-in settings, unique inbound receipt IDs, conversation revisions,
bounded retained message data, and delayed jobs with conditional lease claims.
Fresh facts and the final conversation/permission/window version are checked
before sending. Unknown external outcomes are quarantined for reconciliation,
not treated as definitely failed. More schema, operations, and testing work.

### C: Human-reviewed suggested replies only

Lowest automation risk and an appropriate staged rollout; slower response and
requires active staff review. Can precede automatic delivery after evaluation.

## Decision

On 2026-10-04 the product owner approved Messenger-first implementation and the
proposed retention policy, following confirmation of a separate customer inbox
with Filipino, English, and Taglish language matching. Use option B, default off,
with suggestions-only and explicitly opted-in automatic modes. Instagram remains
a separate later channel contract. Preserve publishing behavior; its connection
status is not messaging capability.

Store message text encrypted for at most seven days from its event time. Keep
minimal delivery/deduplication metadata for at most thirty days; remove message
text from previews, jobs, and other retained copies on expiry. No raw-message
logging or persistent browser storage. Only owners with SETTINGS_MANAGE and
current social entitlement may access this initial inbox; AI additionally needs
its entitlement and explicit external-processing consent. A destination may
belong to only one active tenant mapping; ambiguous mappings fail closed.

Also approved on 2026-10-04: retain only a keyed opt-out fingerprint with its
tenant/channel scope while that channel exists, including beyond thirty days,
so expired chat history cannot silently undo a stop preference. This exception
does not retain message text, raw recipient identifiers, or opt-out timestamps.
Disclose it separately from the seven-/thirty-day chat retention policy.

Approval permits local source code, additive migration preparation, and safe
tests. It does not authorize Meta account changes, reconnect/subscription,
public deployment, scheduler activation, migration application to shared data,
or customer delivery. Verify provider prerequisites, a disposable database,
privacy notices, explicit owner opt-in, and synthetic-channel pilot evidence
before live activation. Retention cleanup is mandatory, not best-effort.

Future delivery must preserve:

- Raw-body webhook signature verification before parsing protected events;
  finite body/event bounds; verification challenge secrets kept server-only.
- Exactly one unambiguous active tenant connection per external destination;
  duplicate mappings fail closed. Never trust a webhook/client business ID.
- Database uniqueness for inbound event/message IDs and tenant-scoped identity
  relationships. Repeated events do not create repeated reply jobs.
- Revision/debounce on latest inbound; monotonic human reply, takeover, pause,
  and opt-out facts. Unknown outbound authors suppress conservatively.
- Conditional due-job leases, bounded retries, recovery of expired leases,
  a stable delivery identity, and a final revision/human-reply/consent/token/
  window recheck. Database work cannot be atomic with Meta's remote send; record
  the remaining race honestly and minimize it.
- Distinguish confirmed failure, confirmed success, and unknown delivery.
  Quarantine unknown sends, reconcile through provider evidence where available,
  and require human review rather than blind resend.
- Typed closed-set Jev decisions, conservative quality thresholds and cost
  budgets. Application code alone supplies facts and enforces allowed replies.
- Public read-only prices/hours/services/provisional availability only; no
  private records, bookings/reservations, payments, or medical judgments.
- Minimal retention, deletion/opt-out handling, redacted telemetry, observable
  owner handoff, and a fail-closed kill switch. Do not log raw customer messages,
  provider tokens, or full provider results.

## Consequences

Improves isolation and recovery over a timer-only implementation, but requires
additive migrations, dedicated worker contracts, retention operations, provider
review, non-production channel testing, and monitored pilot rollout. Snapshot
availability is never a reserved slot. Delay jobs and webhook timestamps do not
prove owner “seen” state or guarantee that a human cannot reply during the final
remote-send race.

## Implementation and rollout

Keep the existing simulation default-off for provider access and incapable of
delivery. Its test UI belongs in the inbox, not the publishing workspace.
Review model/privacy consent and Messenger scopes; reconnect/subscription work
must have explicit authority. Add immutable migrations and guarded database
tests against a disposable target, then signed webhook/dedup/lease/kill-switch
tests. Deploy only with a public HTTPS callback and protected scheduler.
Start human-review-only, evaluate quality/cost, then obtain approval for an
explicitly opted-in small non-production pilot. Disabling automation must stop
new deliveries without deleting unrelated publishing jobs or business data.

## Validation

Use real disposable PostgreSQL tests for uniqueness, tenant predicates,
conditional lease concurrency, rollback, revision races, and cleanup. Verify
duplicate/out-of-order inbound and human echoes, delay boundaries, token
revocation, messaging-window expiry, ambiguous mappings, unknown send outcomes,
and fail-closed provider/rate-store outages. Use a synthetic non-production Meta
Page for end-to-end verification; mocked payloads alone are not provider proof.

Evaluate English, Filipino, and Taglish requests, explicit language changes,
short ambiguous greetings, and local-language opt-out/handoff/safety variants
against the [customer inbox language requirements](../social-conversation-assistant.md#language-and-grounding).
Include ordinary catalog requests plus adversarial, private, medical, financial,
unsupported, and ambiguous requests. Track grounded-answer
accuracy, unsafe containment, human handoff, duplicate reply rate, latency,
provider cost, opt-out compliance, and retention deletion. Review or stop the
pilot on any cross-tenant/private disclosure, duplicate-send regression, policy
change, or inability to suppress on human takeover.

## References

- [Guarded lab runbook](../social-conversation-assistant.md)
- [Meta Messenger Send API](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api)
- [Meta sample webhook connectivity](https://github.com/fbsamples/messenger-platform-samples/blob/main/node/README.md)
- [TypeSafe closed-set function calling](https://docs.typesafe.ai/cookbooks/function_calling)
- [TypeSafe confidence](https://docs.typesafe.ai/confidence)
- [Tenant isolation](../tenant-isolation.md), [authorization](../authorization.md), [testing](../testing.md)
