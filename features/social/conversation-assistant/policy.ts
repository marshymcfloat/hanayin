import type { AssistantConversationState, AssistantSettings } from "@/features/social/conversation-assistant/types";
import { assistantConversationStateSchema, assistantSettingsSchema, assistantTimestampSchema } from "@/features/social/conversation-assistant/schemas";

export const ASSISTANT_DELAY_MS = 120_000;
export const ASSISTANT_WINDOW_MS = 24 * 60 * 60_000;
export const ASSISTANT_REPLY_COOLDOWN_MS = 5 * 60_000;
export const ASSISTANT_MIN_CONFIDENCE = 0.9;
export const ASSISTANT_FACTS_MAX_AGE_MS = 5 * 60_000;
export const ASSISTANT_AVAILABILITY_MAX_AGE_MS = 30_000;

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  enabled: false, ownerOptIn: false, externalProcessingConsent: false,
  connectionVerified: false, messagingPermissionVerified: false, connectionStatus: "ERROR", paused: true,
};

export function evaluateAssistantEligibility(settings: AssistantSettings, state: AssistantConversationState, now: string): {
  eligible: boolean; status: "WAITING" | "SUPPRESSED" | "HANDOFF" | "READY"; reason: string; eligibleAt: string | null;
} {
  const deny = (reason: string) => ({ eligible: false, status: "SUPPRESSED" as const, reason, eligibleAt: null });
  const parsedSettings = assistantSettingsSchema.safeParse(settings);
  const parsedState = assistantConversationStateSchema.safeParse(state);
  if (!parsedSettings.success || !parsedState.success || !assistantTimestampSchema.safeParse(now).success) return deny("INVALID_POLICY_CONTEXT");
  settings = parsedSettings.data;
  state = parsedState.data;
  if (!settings.enabled) return deny("DISABLED");
  if (!settings.ownerOptIn) return deny("OWNER_OPT_IN_REQUIRED");
  if (!settings.externalProcessingConsent) return deny("EXTERNAL_PROCESSING_CONSENT_REQUIRED");
  if (!settings.connectionVerified || !settings.messagingPermissionVerified) return deny("MESSAGING_CONNECTION_UNVERIFIED");
  if (settings.connectionStatus !== "CONNECTED") return deny("CONNECTION_UNAVAILABLE");
  if (settings.paused || state.paused) return deny("PAUSED");
  if (state.optedOut) return deny("OPTED_OUT");
  if (state.takenOver) return deny("HUMAN_TAKEOVER");
  if (state.overflowed || state.ambiguousInbound) {
    return { eligible: false, status: "HANDOFF", reason: "AMBIGUOUS_EVENT_STATE", eligibleAt: null };
  }
  if (!state.latestInbound) return deny("NO_CUSTOMER_MESSAGE");
  const current = Date.parse(now);
  const inboundAt = Date.parse(state.latestInbound.at);
  const humanAt = state.latestHumanReplyAt ? Date.parse(state.latestHumanReplyAt) : -Infinity;
  const assistantAt = state.latestAssistantReplyAt ? Date.parse(state.latestAssistantReplyAt) : -Infinity;
  const controlAt = state.controlAt ? Date.parse(state.controlAt) : -Infinity;
  if (!Number.isFinite(current) || [inboundAt, humanAt, assistantAt, controlAt].some(at => at > current)) return deny("FUTURE_EVENT");
  if (humanAt >= inboundAt) return deny("HUMAN_ALREADY_REPLIED");
  if (assistantAt >= inboundAt) return deny("ALREADY_ANSWERED");
  if (current - inboundAt >= ASSISTANT_WINDOW_MS) return deny("MESSAGING_WINDOW_EXPIRED");
  const dueAt = Math.max(inboundAt + ASSISTANT_DELAY_MS, assistantAt + ASSISTANT_REPLY_COOLDOWN_MS);
  const eligibleAt = new Date(dueAt).toISOString();
  if (current < dueAt) {
    return { eligible: false, status: "WAITING", reason: dueAt > inboundAt + ASSISTANT_DELAY_MS ? "REPLY_COOLDOWN" : "WAITING_FOR_HUMAN", eligibleAt };
  }
  return { eligible: true, status: "READY", reason: "DELAY_ELAPSED", eligibleAt };
}
