import { z } from "zod";
import {
  assistantConnectionCandidateSchema, assistantConversationEventSchema,
  assistantConversationStateSchema, assistantTenantSchema, MAX_ASSISTANT_EVENTS,
} from "@/features/social/conversation-assistant/schemas";
import type {
  AssistantConnectionCandidate, AssistantConversationEvent, AssistantConversationState, AssistantTenant,
} from "@/features/social/conversation-assistant/types";

export function initialAssistantConversationState(tenant: AssistantTenant, externalAccountId = "dry-run"): AssistantConversationState {
  return assistantConversationStateSchema.parse({
    businessId: assistantTenantSchema.parse(tenant).businessId, externalAccountId,
    eventIds: [], latestInbound: null, latestHumanReplyAt: null, latestAssistantReplyAt: null,
    controlAt: null, paused: false, takenOver: false, optedOut: false,
    ambiguousInbound: false, overflowed: false,
  });
}

/** Pure prototype state. This is not a durable webhook receipt or delivery claim. */
export function applyAssistantConversationEvent(
  previous: AssistantConversationState, input: AssistantConversationEvent,
): AssistantConversationState {
  const state = assistantConversationStateSchema.parse(previous);
  const event = assistantConversationEventSchema.parse(input);
  if (event.businessId !== state.businessId || event.externalAccountId !== state.externalAccountId) {
    throw new Error("Conversation identity mismatch.");
  }
  if (state.eventIds.includes(event.eventId)) return state;
  if (state.eventIds.length >= MAX_ASSISTANT_EVENTS) return { ...state, overflowed: true };
  const next = { ...state, eventIds: [...state.eventIds, event.eventId] };
  const at = Date.parse(event.at);

  if (event.kind === "inbound") {
    const latestAt = next.latestInbound ? Date.parse(next.latestInbound.at) : -Infinity;
    if (at > latestAt) {
      next.latestInbound = { eventId: event.eventId, at: event.at, text: event.text };
      next.ambiguousInbound = false;
    } else if (at === latestAt && next.latestInbound?.text !== event.text) {
      next.ambiguousInbound = true;
    }
  } else if (event.kind === "outbound_echo") {
    const field = event.author === "ASSISTANT" ? "latestAssistantReplyAt" : "latestHumanReplyAt";
    if (next[field] === null || at > Date.parse(next[field])) next[field] = event.at;
  } else if (event.kind === "takeover") {
    next.takenOver = true;
  } else if (event.kind === "opt_out") {
    next.optedOut = true;
  } else if (event.kind === "pause" || event.kind === "resume") {
    const controlAt = next.controlAt ? Date.parse(next.controlAt) : -Infinity;
    if (at > controlAt || (at === controlAt && event.kind === "pause")) {
      next.controlAt = event.at;
      next.paused = event.kind === "pause";
    }
  }
  // Read receipts describe neither an authoritative owner reply nor owner takeover.
  return next;
}

export function resolveAssistantConnection(
  tenant: AssistantTenant, externalAccountId: string, candidates: AssistantConnectionCandidate[],
): AssistantConnectionCandidate | null {
  const verified = assistantTenantSchema.parse(tenant);
  const rows = z.array(assistantConnectionCandidateSchema).max(100).parse(candidates);
  const matches = rows.filter(row => row.externalAccountId === externalAccountId);
  if (matches.length !== 1 || matches[0].businessId !== verified.businessId || matches[0].status !== "CONNECTED") return null;
  return matches[0];
}
