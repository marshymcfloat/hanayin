import "server-only";

import { z } from "zod";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { rateLimit } from "@/lib/rate-limit";
import {
  getAssistantAvailability, getAssistantPublicFacts, isAssistantAvailabilityDate,
} from "@/features/social/conversation-assistant/facts";
import { applyAssistantConversationEvent, initialAssistantConversationState } from "@/features/social/conversation-assistant/event-state";
import { classifyAssistantMessage, isAssistantJevConfigured } from "@/features/social/conversation-assistant/jev";
import { assistantDateSchema, assistantPublicFactsSchema } from "@/features/social/conversation-assistant/schemas";
import { simulateAssistantReply } from "@/features/social/conversation-assistant/simulation";
import { ASSISTANT_INTENTS } from "@/features/social/conversation-assistant/types";
import type {
  AssistantDecision, AssistantSimulationInput, AssistantSimulationResult, AssistantTenant,
} from "@/features/social/conversation-assistant/types";

const previewBase = z.object({
  businessSlug: businessSlugSchema,
  message: z.string().trim().min(1).max(1_000),
  elapsedSeconds: z.number().int().min(0).max(86_400),
  humanReplied: z.boolean(),
  paused: z.boolean(),
  optedOut: z.boolean(),
});

export const ownerAssistantContextSchema = z.object({ businessSlug: businessSlugSchema }).strict();
export const ownerAssistantPreviewSchema = z.discriminatedUnion("mode", [
  previewBase.extend({
    mode: z.literal("POLICY"),
    scenario: z.enum(ASSISTANT_INTENTS),
    serviceId: z.number().int().positive().max(2_147_483_647).nullable(),
    date: assistantDateSchema.nullable(),
  }).strict(),
  previewBase.extend({
    mode: z.literal("AI"),
    consentForExternalProcessing: z.boolean(),
  }).strict(),
]);

export type OwnerAssistantPreviewInput = z.infer<typeof ownerAssistantPreviewSchema>;
export type OwnerAssistantPreviewData = {
  result: AssistantSimulationResult;
  decisionSource: "OWNER_SELECTED_SCENARIO" | "JEV" | "MODEL_UNAVAILABLE";
  factsGeneratedAt: string;
};

export function isOwnerAssistantAiPreviewAvailable() {
  return process.env.SOCIAL_ASSISTANT_DRY_RUN_AI_ENABLED === "true" && isAssistantJevConfigured();
}

export async function previewOwnerAssistantReply(
  tenant: AssistantTenant,
  ownerUserId: string,
  input: OwnerAssistantPreviewInput,
  aiEntitled: boolean,
): Promise<OwnerAssistantPreviewData> {
  const now = new Date();
  const facts = assistantPublicFactsSchema.parse(await getAssistantPublicFacts(tenant, now));
  let message = input.message;
  let decision: AssistantDecision | undefined;
  if (input.mode === "POLICY") {
    const service = input.serviceId === null ? null : facts.services.find((item) => item.id === input.serviceId);
    if (input.serviceId !== null && !service) throw new Error("Invalid assistant service selection.");
    if (input.date && !isAssistantAvailabilityDate(input.date, now)) throw new Error("Invalid assistant date selection.");
    // These values describe an owner's canned scenario, not model inference.
    message += `${service ? `\nRequested service: ${service.name}.` : ""}${input.date ? `\nRequested date: ${input.date}.` : ""}`;
    if (message.length > 1_000) throw new Error("Synthetic message is too long.");
    decision = {
      intent: input.scenario, intentConfidence: 1,
      serviceId: service?.id ?? null, serviceConfidence: 1,
      date: input.date, dateConfidence: 1,
    };
  }
  const nowIso = now.toISOString();
  const receivedAt = new Date(now.getTime() - input.elapsedSeconds * 1_000).toISOString();
  let state = applyAssistantConversationEvent(initialAssistantConversationState(tenant, "synthetic-lab"), {
    eventId: "synthetic-inbound", businessId: tenant.businessId, externalAccountId: "synthetic-lab",
    at: receivedAt, kind: "inbound", text: message,
  });
  for (const [kind, present] of [["pause", input.paused], ["opt_out", input.optedOut]] as const) {
    if (present) state = applyAssistantConversationEvent(state, {
      eventId: `synthetic-${kind}`, businessId: tenant.businessId, externalAccountId: "synthetic-lab", at: nowIso, kind,
    });
  }
  if (input.humanReplied) state = applyAssistantConversationEvent(state, {
    eventId: "synthetic-human", businessId: tenant.businessId, externalAccountId: "synthetic-lab",
    at: nowIso, kind: "outbound_echo", author: "HUMAN",
  });
  const simulation: AssistantSimulationInput = {
    tenant, facts, message, receivedAt, now: nowIso, state, ...(decision ? { decision } : {}),
    // Assumed simulation prerequisites only. Nothing is persisted or enabled.
    settings: {
      enabled: true, ownerOptIn: true, connectionVerified: true,
      messagingPermissionVerified: true, connectionStatus: "CONNECTED", paused: input.paused,
      externalProcessingConsent: input.mode === "POLICY" || input.consentForExternalProcessing,
    },
  };
  const useJev = input.mode === "AI" && input.consentForExternalProcessing && aiEntitled && isOwnerAssistantAiPreviewAvailable();
  let providerCalled = false;
  const dependencies = useJev ? {
    triage: async (triageInput: Parameters<typeof classifyAssistantMessage>[0]) => {
      const limit = await rateLimit(`${tenant.businessId}:${ownerUserId}`, {
        namespace: "service-flow:assistant-dry-run", windowMs: 60_000, maxRequests: 5, onStoreError: "deny",
      });
      if (!limit.success) throw new Error("Assistant preview is rate limited.");
      providerCalled = true;
      return classifyAssistantMessage(triageInput);
    },
  } : {};
  let result = await simulateAssistantReply(simulation, dependencies);
  if (result.status === "HANDOFF" && result.reason === "AVAILABILITY_NOT_CHECKED" &&
      result.decision?.serviceId && result.decision.date) {
    try {
      const availability = await getAssistantAvailability(tenant, result.decision.serviceId, result.decision.date);
      result = await simulateAssistantReply({
        ...simulation, now: new Date().toISOString(), decision: result.decision, availability,
      });
    } catch {
      // A failed read must not become a made-up empty schedule or confirmation.
      result = { mode: "DRY_RUN", sent: false, status: "HANDOFF", reason: "AVAILABILITY_UNAVAILABLE", reply: null, eligibleAt: result.eligibleAt };
    }
  }
  return {
    result,
    decisionSource: input.mode === "POLICY" ? "OWNER_SELECTED_SCENARIO" : providerCalled && result.decision ? "JEV" : "MODEL_UNAVAILABLE",
    factsGeneratedAt: facts.generatedAt,
  };
}
