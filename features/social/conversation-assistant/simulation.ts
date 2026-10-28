import {
  assistantDateSchema, assistantDecisionSchema, assistantSimulationInputSchema, MAX_ASSISTANT_DATES,
} from "@/features/social/conversation-assistant/schemas";
import { applyAssistantConversationEvent, initialAssistantConversationState } from "@/features/social/conversation-assistant/event-state";
import { ASSISTANT_FACTS_MAX_AGE_MS, evaluateAssistantEligibility } from "@/features/social/conversation-assistant/policy";
import { inspectAssistantMessage } from "@/features/social/conversation-assistant/privacy";
import { assistantPHDate, buildAssistantReply } from "@/features/social/conversation-assistant/reply-builder";
import type {
  AssistantDecision, AssistantSimulationInput, AssistantSimulationResult, AssistantTriageInput,
} from "@/features/social/conversation-assistant/types";

/** Only dates found in the message enter the closed set; missing dates stay missing. */
export function assistantDateCandidates(message: string, now: string): string[] {
  const today = assistantPHDate(now);
  const start = Date.parse(`${today}T00:00:00+08:00`);
  const dates = new Set<string>();
  const add = (date: string) => {
    if (!assistantDateSchema.safeParse(date).success) return;
    const diff = Date.parse(`${date}T00:00:00+08:00`) - start;
    if (diff >= 0 && diff < MAX_ASSISTANT_DATES * 86_400_000) dates.add(date);
  };
  for (const match of message.matchAll(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g)) add(match[0]);
  if (/\b(?:today|tonight|ngayon)\b/i.test(message)) add(today);
  const tomorrow = /\btomorrow\b/i.test(message)
    || /\b(?:sa|for|on)\s+bukas\b|\b(?:available|availability|slot|schedule|appointment)\b.{0,40}\bbukas\b|\bbukas\b.{0,40}\b(?:slot|schedule|appointment)\b/i.test(message);
  if (tomorrow) add(assistantPHDate(new Date(start + 86_400_000).toISOString()));
  return [...dates].sort().slice(0, MAX_ASSISTANT_DATES);
}

/** No persistence, external delivery, booking mutation or reservation exists in this prototype. */
export async function simulateAssistantReply(
  input: AssistantSimulationInput,
  dependencies: { triage?: (input: AssistantTriageInput) => Promise<AssistantDecision> } = {},
): Promise<AssistantSimulationResult> {
  const base = { mode: "DRY_RUN" as const, sent: false as const, reply: null, eligibleAt: null };
  const parsed = assistantSimulationInputSchema.safeParse(input);
  if (!parsed.success) return { ...base, status: "HANDOFF", reason: "INVALID_SIMULATION_INPUT" };
  const value = parsed.data;
  if (value.tenant.businessId !== value.facts.businessId || value.tenant.businessSlug !== value.facts.businessSlug) {
    return { ...base, status: "SUPPRESSED", reason: "TENANT_MISMATCH" };
  }
  const state = value.state ?? applyAssistantConversationEvent(initialAssistantConversationState(value.tenant), {
    eventId: "synthetic-inbound", businessId: value.tenant.businessId, externalAccountId: "dry-run",
    at: value.receivedAt, kind: "inbound", text: value.message,
  });
  if (state.businessId !== value.tenant.businessId || state.latestInbound?.text !== value.message
    || Date.parse(state.latestInbound.at) !== Date.parse(value.receivedAt)) {
    return { ...base, status: "SUPPRESSED", reason: "CONVERSATION_CONTEXT_MISMATCH" };
  }
  const eligibility = evaluateAssistantEligibility(value.settings, state, value.now);
  if (!eligibility.eligible) return { ...base, status: eligibility.status as "WAITING" | "SUPPRESSED" | "HANDOFF", reason: eligibility.reason, eligibleAt: eligibility.eligibleAt };
  const screened = inspectAssistantMessage(value.message);
  if (!screened.safe) return { ...base, status: "HANDOFF", reason: screened.reason };
  const factAge = Date.parse(value.now) - Date.parse(value.facts.generatedAt);
  if (factAge < 0 || factAge > ASSISTANT_FACTS_MAX_AGE_MS) return { ...base, status: "HANDOFF", reason: "FACTS_STALE" };
  const dates = assistantDateCandidates(screened.redacted, value.now);
  let decision: AssistantDecision;
  try {
    if (value.decision) decision = value.decision;
    else if (dependencies.triage) decision = await dependencies.triage({
      message: screened.redacted,
      services: value.facts.services.map(service => ({ id: service.id, name: service.name, category: service.category })),
      dates,
    });
    else return { ...base, status: "HANDOFF", reason: "MODEL_UNAVAILABLE" };
    decision = assistantDecisionSchema.parse(decision);
  } catch {
    return { ...base, status: "HANDOFF", reason: "MODEL_UNAVAILABLE" };
  }
  if (decision.intent === "availability" && decision.date !== null && !dates.includes(decision.date)) {
    return { ...base, status: "HANDOFF", reason: "DATE_NOT_STATED" };
  }
  const proposal = buildAssistantReply({ facts: value.facts, decision, now: value.now, availability: value.availability });
  return { ...base, ...proposal, eligibleAt: eligibility.eligibleAt, decision };
}
