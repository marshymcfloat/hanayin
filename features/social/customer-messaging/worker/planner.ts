import "server-only";

import { assistantDecisionSchema, assistantPublicFactsSchema } from "@/features/social/conversation-assistant/schemas";
import { classifyAssistantMessage } from "@/features/social/conversation-assistant/jev";
import { assistantExplicitLanguagePreference, inspectAssistantMessage, isAssistantSubstantiveMessage } from "@/features/social/conversation-assistant/privacy";
import { assistantDateCandidates } from "@/features/social/conversation-assistant/simulation";
import { buildAssistantReply } from "@/features/social/conversation-assistant/reply-builder";
import { ASSISTANT_MIN_CONFIDENCE } from "@/features/social/conversation-assistant/policy";
import { absoluteMessagingBookingLink, messagingPublicOrigin } from "@/features/social/customer-messaging/worker/booking-link";
import type { AssistantAvailability, AssistantDecision, AssistantLanguage, AssistantPublicFacts, AssistantTenant, AssistantTriageInput } from "@/features/social/conversation-assistant/types";

export type MessagingReplyPlan =
  | { status: "PROPOSED"; text: string; language: AssistantLanguage }
  | { status: "HANDOFF" | "OPT_OUT"; reason: string };

export type MessagingPlannerDependencies = {
  beforeModelSubmit: () => Promise<boolean>;
  trustedPublicBaseUrl?: string | null;
  now?: () => Date;
  getFacts(tenant: AssistantTenant, now: Date): Promise<AssistantPublicFacts>;
  getAvailability(tenant: AssistantTenant, serviceId: number, date: string, now: Date): Promise<AssistantAvailability>;
  classify?: (input: AssistantTriageInput) => Promise<AssistantDecision>;
};

/** Model output selects approved values. Application templates supply all wording and facts. */
export async function planMessagingReply(input: {
  tenant: AssistantTenant;
  message: string;
  establishedLanguage: AssistantLanguage;
  recentMessages: string[];
  now: Date;
  messageAt?: Date;
}, deps: MessagingPlannerDependencies): Promise<MessagingReplyPlan> {
  const screen = inspectAssistantMessage(input.message);
  if (!screen.safe) return { status: screen.reason === "OPT_OUT" ? "OPT_OUT" : "HANDOFF", reason: screen.reason };
  const publicOrigin = messagingPublicOrigin(deps.trustedPublicBaseUrl);
  if (!publicOrigin) return { status: "HANDOFF", reason: "PUBLIC_BOOKING_URL_UNAVAILABLE" };
  try {
    const facts = assistantPublicFactsSchema.parse(await deps.getFacts(input.tenant, input.now));
    if (facts.businessId !== input.tenant.businessId || facts.businessSlug !== input.tenant.businessSlug) return { status: "HANDOFF", reason: "TENANT_MISMATCH" };
    const preference = assistantExplicitLanguagePreference(screen.redacted);
    const substantive = isAssistantSubstantiveMessage(screen.redacted, facts.services.map(service => service.name));
    const dates = assistantDateCandidates(screen.redacted, (input.messageAt ?? input.now).toISOString());
    let decision: AssistantDecision;
    const onlyPreference = preference && /^(?:(?:please|pls)\s+)?(?:(?:reply|respond|speak|use|gamitin ang)\s+)?(?:(?:in|sa)\s+)?(?:english|tagalog|filipino|taglish)(?:\s+(?:please|pls|po|na lang|lang))?[.!?]*$/i.test(screen.redacted);
    if (!substantive || onlyPreference) {
      decision = { intent: "clarify", intentConfidence: 1, serviceId: null, serviceConfidence: 1, date: null, dateConfidence: 1,
        language: preference ?? input.establishedLanguage, languageConfidence: 1 };
    } else {
      if (!deps.beforeModelSubmit) return { status: "HANDOFF", reason: "MODEL_SUBMISSION_SUPPRESSED" };
      const triageInput: AssistantTriageInput = {
        message: screen.redacted, services: facts.services.map(({ id, name, category }) => ({ id, name, category })), dates,
        languageContext: { establishedLanguage: input.establishedLanguage, recentMessages: input.recentMessages.slice(-3).filter(text => inspectAssistantMessage(text).safe).map(text => inspectAssistantMessage(text).redacted) },
      };
      if (deps.classify && !(await deps.beforeModelSubmit())) return { status: "HANDOFF", reason: "MODEL_SUBMISSION_SUPPRESSED" };
      decision = assistantDecisionSchema.parse(await (deps.classify ? deps.classify(triageInput)
        : classifyAssistantMessage(triageInput, { beforeSubmit: deps.beforeModelSubmit })));
      if (preference) decision = { ...decision, language: preference, languageConfidence: 1 };
      else if (!decision.language || decision.languageConfidence === undefined || decision.languageConfidence < ASSISTANT_MIN_CONFIDENCE) {
        decision = { ...decision, language: "UNKNOWN" };
      }
    }
    if (decision.intentConfidence < ASSISTANT_MIN_CONFIDENCE || decision.intent === "handoff") return { status: "HANDOFF", reason: "HUMAN_REVIEW_REQUIRED" };
    if (decision.date && !dates.includes(decision.date)) return { status: "HANDOFF", reason: "DATE_NOT_STATED" };
    let availability: AssistantAvailability | undefined;
    if (decision.language !== "UNKNOWN" && decision.intent === "availability" && decision.serviceId && decision.date
      && decision.serviceConfidence >= ASSISTANT_MIN_CONFIDENCE && decision.dateConfidence >= ASSISTANT_MIN_CONFIDENCE) {
      availability = await deps.getAvailability(input.tenant, decision.serviceId, decision.date, deps.now?.() ?? input.now);
    }
    const proposal = buildAssistantReply({ facts, decision, now: (deps.now?.() ?? input.now).toISOString(), availability, language: decision.language ?? "UNKNOWN" });
    if (proposal.status !== "PROPOSED" || !proposal.reply) return { status: "HANDOFF", reason: proposal.reason };
    const text = absoluteMessagingBookingLink(proposal.reply, facts.businessSlug, publicOrigin);
    return text ? { status: "PROPOSED", text, language: decision.language ?? "UNKNOWN" }
      : { status: "HANDOFF", reason: "PUBLIC_BOOKING_URL_UNAVAILABLE" };
  } catch {
    return { status: "HANDOFF", reason: "MODEL_OR_FACTS_UNAVAILABLE" };
  }
}
