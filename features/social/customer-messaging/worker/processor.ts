import "server-only";

import { ASSISTANT_DELAY_MS, ASSISTANT_WINDOW_MS } from "@/features/social/conversation-assistant/policy";
import { inspectAssistantMessage } from "@/features/social/conversation-assistant/privacy";
import type { AssistantLanguage } from "@/features/social/conversation-assistant/types";
import type { ClaimedMessagingJob, MessagingContext, MessagingJobStore, MessagingLanguage, MessagingReplyLanguage } from "@/features/social/customer-messaging/contracts";
import type { MessagingReplyPlan } from "@/features/social/customer-messaging/worker/planner";
import type { MessengerSendOutcome } from "@/features/social/customer-messaging/worker/meta-send";

export const MESSAGING_BATCH_LIMIT = 10;
export const MESSAGING_LEASE_MS = 60_000;
export const MESSAGING_RETENTION_LIMIT = 500;

export type MessagingWorkerDependencies = {
  store: MessagingJobStore;
  now(): Date;
  workerEnabled(): boolean;
  deliveryEnabled(): boolean;
  killSwitch(): boolean;
  hasEntitlements(context: MessagingContext): Promise<boolean>;
  takeModelBudget(businessId: string): Promise<boolean>;
  modelAvailable(): boolean;
  plan(context: MessagingContext, language: AssistantLanguage, now: Date): Promise<MessagingReplyPlan>;
  send(context: MessagingContext, text: string, deliveryKey: string): Promise<MessengerSendOutcome>;
};

function languageFromStorage(language: MessagingLanguage | null | undefined): AssistantLanguage {
  return language === "EN" ? "ENGLISH" : language === "FIL" ? "FILIPINO" : language === "TAGLISH" ? "TAGLISH" : "UNKNOWN";
}
function languageToStorage(language: AssistantLanguage): MessagingReplyLanguage {
  return language === "ENGLISH" ? "EN" : language === "FILIPINO" ? "FIL" : language === "TAGLISH" ? "TAGLISH" : "UNKNOWN";
}

function denyContextReason(context: MessagingContext, deps: MessagingWorkerDependencies, now: Date, sending: boolean): string | null {
  if (!deps.workerEnabled() || deps.killSwitch()) return "WORKER_DISABLED";
  if (sending && (!deps.deliveryEnabled() || context.settings.mode !== "AUTO")) return "DELIVERY_DISABLED";
  if (!deps.modelAvailable()) return "MODEL_UNAVAILABLE";
  if (context.settings.mode === "OFF" || !context.settings.consent || !context.settings.aiConsent) return "CONSENT_REQUIRED";
  if (context.settings.paused || context.conversation.takeover || context.conversation.optedOut) return "HUMAN_CONTROL";
  if (context.job.revision !== context.conversation.revision || context.job.businessId !== context.businessId) return "STALE_CONVERSATION";
  const inboundAt = context.conversation.latestInboundAt.getTime();
  const age = now.getTime() - inboundAt;
  if (!Number.isFinite(age) || age < ASSISTANT_DELAY_MS || age >= ASSISTANT_WINDOW_MS) return "OUTSIDE_RESPONSE_WINDOW";
  if (context.conversation.lastHumanReplyAt && context.conversation.lastHumanReplyAt.getTime() >= inboundAt) return "HUMAN_REPLIED";
  if (!context.channel.verifiedAt || !context.channel.permissionsVerifiedAt
    || !context.channel.tokenExpiresAt || context.channel.tokenExpiresAt.getTime() <= now.getTime() + 8_000) return "CHANNEL_UNAVAILABLE";
  return null;
}

async function denyReason(context: MessagingContext, deps: MessagingWorkerDependencies, now: Date, sending: boolean): Promise<string | null> {
  const reason = denyContextReason(context, deps, now, sending);
  if (reason) return reason;
  return await deps.hasEntitlements(context) ? null : "ENTITLEMENT_REQUIRED";
}

async function currentModelContext(context: MessagingContext, deps: MessagingWorkerDependencies): Promise<MessagingContext | null> {
  // Slow entitlement work precedes the last lease/owner/consent/conversation snapshot.
  if (await denyReason(context, deps, deps.now(), false)) return null;
  const fresh = await deps.store.loadContext(context.job, deps.now());
  if (!fresh || fresh.settings.revision !== context.settings.revision || fresh.channel.revision !== context.channel.revision
    || fresh.conversation.latestInboundMessageId !== context.conversation.latestInboundMessageId
    || denyContextReason(fresh, deps, deps.now(), false)) return null;
  return fresh;
}

/** Invoked after public facts/client setup, immediately before external model submission. */
export async function recheckMessagingModelSubmit(context: MessagingContext, deps: MessagingWorkerDependencies): Promise<boolean> {
  return Boolean(await currentModelContext(context, deps));
}

export type MessagingWorkerSummary = {
  processed: number; suggested: number; sent: number; suppressed: number; handoff: number; unknown: number;
  textPurged: number; metadataPurged: number; enabled: boolean;
};

/** Persistence must lease with CAS, encrypt proposals, and quarantine expired SENDING jobs. */
export async function processMessagingBatch(deps: MessagingWorkerDependencies): Promise<MessagingWorkerSummary> {
  // Cleanup failure aborts the batch. Retention is required even while delivery is disabled.
  const cleanup = await deps.store.cleanupRetention(deps.now(), MESSAGING_RETENTION_LIMIT);
  const summary: MessagingWorkerSummary = { processed: 0, suggested: 0, sent: 0, suppressed: 0, handoff: 0, unknown: 0,
    ...cleanup, enabled: deps.workerEnabled() && !deps.killSwitch() };
  if (!summary.enabled) return summary;
  for (let processed = 0; processed < MESSAGING_BATCH_LIMIT; processed++) {
    if (!deps.workerEnabled() || deps.killSwitch()) break;
    // Acquire each lease only when capacity is available to process its job.
    const [job] = await deps.store.claimDue({ limit: 1, now: deps.now(), leaseMs: MESSAGING_LEASE_MS });
    if (!job) break;
    summary.processed++;
    let sending = false;
    try {
      const context = await deps.store.loadContext(job, deps.now());
      if (!context) { await cancel(job, "CONTEXT_UNAVAILABLE", deps); summary.suppressed++; continue; }
      const denied = await denyReason(context, deps, deps.now(), false);
      if (denied) { await cancel(job, denied, deps); summary.suppressed++; continue; }
      const latest = context.messages.find(message => message.id === context.conversation.latestInboundMessageId && message.direction === "INBOUND");
      if (!latest || latest.occurredAt.getTime() !== context.conversation.latestInboundAt.getTime()) {
        await cancel(job, "MESSAGE_CONTEXT_MISMATCH", deps); summary.suppressed++; continue;
      }
      const screen = inspectAssistantMessage(latest.text);
      if (!screen.safe) {
        if (screen.reason === "OPT_OUT") await deps.store.recordOptOut(job, deps.now());
        else await cancel(job, screen.reason, deps);
        summary.handoff++; continue;
      }
      if (!deps.modelAvailable() || !(await deps.takeModelBudget(context.businessId))) {
        await cancel(job, "MODEL_OR_BUDGET_UNAVAILABLE", deps); summary.handoff++; continue;
      }
      // Budget/fact/model work can take time. Recheck the lease and all mutable gates first.
      const beforeModel = await currentModelContext(context, deps);
      if (!beforeModel) {
        await cancel(job, "STALE_BEFORE_MODEL", deps); summary.suppressed++; continue;
      }
      const plan = await deps.plan(beforeModel, languageFromStorage(beforeModel.conversation.languagePreference), deps.now());
      if (plan.status !== "PROPOSED") {
        if (plan.status === "OPT_OUT") await deps.store.recordOptOut(job, deps.now());
        else await cancel(job, plan.reason, deps);
        summary.handoff++; continue;
      }
      const expected = { settingsRevision: context.settings.revision, channelRevision: context.channel.revision };
      const proposalSaved = await deps.store.saveProposal(job, { text: plan.text, language: languageToStorage(plan.language) }, deps.now(), expected);
      if (!proposalSaved) { summary.suppressed++; continue; }
      if (context.settings.mode === "SUGGEST") { summary.suggested++; continue; }
      if (!deps.deliveryEnabled() || deps.killSwitch()) { await cancel(job, "DELIVERY_DISABLED", deps); summary.suppressed++; continue; }
      // Complete slow entitlement work before the locked final conversation snapshot.
      const sendDenied = await denyReason(beforeModel, deps, deps.now(), true);
      if (sendDenied) { await cancel(job, sendDenied, deps); summary.suppressed++; continue; }
      const final = await deps.store.markSending(job, deps.now(), expected);
      if (!final) { summary.suppressed++; continue; }
      sending = true;
      if (final.settings.revision !== context.settings.revision || final.channel.revision !== context.channel.revision
        || final.conversation.latestInboundMessageId !== context.conversation.latestInboundMessageId
        || !final.draft || final.draft.text !== plan.text || denyContextReason(final, deps, deps.now(), true)) {
        await deps.store.markOutcome(job, { status: "FAILED", retryable: false }, deps.now()); summary.suppressed++; continue;
      }
      // DB and remote HTTP cannot form one transaction. A human can still race this last boundary.
      const outcome = await deps.send(final, plan.text, job.deliveryKey);
      const recorded = await deps.store.markOutcome(job, outcome, deps.now());
      if (!recorded || outcome.status === "UNKNOWN") summary.unknown++;
      else if (outcome.status === "CONFIRMED") summary.sent++;
      else summary.handoff++;
    } catch {
      if (sending) {
        // An uncertain external effect is never returned to a normal retry queue.
        await deps.store.markOutcome(job, { status: "UNKNOWN" }, deps.now()).catch(() => false);
        summary.unknown++;
      } else {
        await cancel(job, "INFRASTRUCTURE_UNAVAILABLE", deps).catch(() => false);
        summary.handoff++;
      }
    }
  }
  return summary;
}

function cancel(job: ClaimedMessagingJob, reason: string, deps: MessagingWorkerDependencies) {
  return deps.store.cancel(job, reason, deps.now());
}
