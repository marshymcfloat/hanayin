// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAssistantConversationEvent, initialAssistantConversationState, resolveAssistantConnection } from "@/features/social/conversation-assistant/event-state";
import { evaluateAssistantEligibility } from "@/features/social/conversation-assistant/policy";
import { MAX_ASSISTANT_EVENTS } from "@/features/social/conversation-assistant/schemas";
import type { AssistantConversationEvent, AssistantSettings } from "@/features/social/conversation-assistant/types";

const tenant = { businessId: "tenant-a", businessSlug: "studio-a" };
const identity = { businessId: tenant.businessId, externalAccountId: "page-a", at: "2026-10-05T09:00:00+08:00" };
const inbound: AssistantConversationEvent = { ...identity, eventId: "in-1", kind: "inbound", text: "What services do you offer?" };
const settings: AssistantSettings = {
  enabled: true, ownerOptIn: true, externalProcessingConsent: true, connectionVerified: true,
  messagingPermissionVerified: true, connectionStatus: "CONNECTED", paused: false,
};
const initial = () => initialAssistantConversationState(tenant, identity.externalAccountId);
const withInbound = () => applyAssistantConversationEvent(initial(), inbound);

describe("assistant event state", () => {
  it("deduplicates immutable event IDs and never mutates the previous state", () => {
    const first = initial();
    const next = applyAssistantConversationEvent(first, inbound);
    expect(first.eventIds).toEqual([]);
    expect(applyAssistantConversationEvent(next, inbound)).toEqual(next);
  });
  it("ignores older inbound messages and resets the deadline for newer messages", () => {
    const state = applyAssistantConversationEvent(withInbound(), { ...inbound, eventId: "in-2", at: "2026-10-05T09:01:00+08:00", text: "And opening hours?" });
    const older = applyAssistantConversationEvent(state, { ...inbound, eventId: "in-old", at: "2026-10-05T08:59:00+08:00" });
    expect(older.latestInbound?.eventId).toBe("in-2");
    expect(evaluateAssistantEligibility(settings, older, "2026-10-05T09:02:00+08:00")).toMatchObject({ status: "WAITING", eligibleAt: "2026-10-05T01:03:00.000Z" });
  });
  it("hands off different same-timestamp messages regardless of delivery order", () => {
    const other: AssistantConversationEvent = { ...inbound, eventId: "in-2", text: "Please tell me your hours." };
    for (const events of [[inbound, other], [other, inbound]]) {
      const state = events.reduce(applyAssistantConversationEvent, initial());
      expect(evaluateAssistantEligibility(settings, state, "2026-10-05T09:03:00+08:00").reason).toBe("AMBIGUOUS_EVENT_STATE");
    }
  });
  it("does not misinterpret a read receipt as the owner seeing an inbound DM", () => {
    const state = applyAssistantConversationEvent(withInbound(), { ...identity, eventId: "read-1", kind: "read_receipt" });
    expect(evaluateAssistantEligibility(settings, state, "2026-10-05T09:02:00+08:00").eligible).toBe(true);
  });
  it.each(["HUMAN", "UNKNOWN"] as const)("suppresses after %s outbound echo including equal-timestamp reply", author => {
    const echo: AssistantConversationEvent = { ...identity, eventId: "echo-1", kind: "outbound_echo", author };
    for (const events of [[inbound, echo], [echo, inbound]]) {
      const state = events.reduce(applyAssistantConversationEvent, initial());
      expect(evaluateAssistantEligibility(settings, state, "2026-10-05T09:02:00+08:00").reason).toBe("HUMAN_ALREADY_REPLIED");
    }
  });
  it("ignores older human replies for a later inbound message", () => {
    const state = applyAssistantConversationEvent(withInbound(), { ...identity, eventId: "old-reply", kind: "outbound_echo", author: "HUMAN", at: "2026-10-05T08:59:00+08:00" });
    expect(evaluateAssistantEligibility(settings, state, "2026-10-05T09:02:00+08:00").eligible).toBe(true);
  });
  it("suppresses an answered message and applies cooldown to a new one", () => {
    const answered = applyAssistantConversationEvent(withInbound(), { ...identity, eventId: "bot-reply", kind: "outbound_echo", author: "ASSISTANT", at: "2026-10-05T09:02:00+08:00" });
    expect(evaluateAssistantEligibility(settings, answered, "2026-10-05T09:02:00+08:00").reason).toBe("ALREADY_ANSWERED");
    const next = applyAssistantConversationEvent(answered, { ...inbound, eventId: "in-2", at: "2026-10-05T09:03:00+08:00" });
    expect(evaluateAssistantEligibility(settings, next, "2026-10-05T09:05:00+08:00")).toMatchObject({ status: "WAITING", reason: "REPLY_COOLDOWN" });
    expect(evaluateAssistantEligibility(settings, next, "2026-10-05T09:07:00+08:00").eligible).toBe(true);
  });
  it.each(["takeover", "opt_out"] as const)("keeps %s sticky despite resume", kind => {
    let state = applyAssistantConversationEvent(withInbound(), { ...identity, eventId: "control-1", kind });
    state = applyAssistantConversationEvent(state, { ...identity, eventId: "resume", kind: "resume", at: "2026-10-05T09:01:00+08:00" });
    expect(evaluateAssistantEligibility(settings, state, "2026-10-05T09:02:00+08:00").status).toBe("SUPPRESSED");
  });
  it("lets pause win equal-timestamp control events, ignoring stale resume", () => {
    const pause: AssistantConversationEvent = { ...identity, eventId: "pause", kind: "pause" };
    const resume: AssistantConversationEvent = { ...identity, eventId: "resume", kind: "resume" };
    for (const events of [[pause, resume], [resume, pause]]) expect(events.reduce(applyAssistantConversationEvent, withInbound()).paused).toBe(true);
  });
  it("rejects cross-tenant, cross-account and malformed events", () => {
    expect(() => applyAssistantConversationEvent(withInbound(), { ...inbound, businessId: "other" })).toThrow("identity mismatch");
    expect(() => applyAssistantConversationEvent(withInbound(), { ...inbound, externalAccountId: "other" })).toThrow("identity mismatch");
    expect(() => applyAssistantConversationEvent(withInbound(), { ...inbound, at: "not-a-date" })).toThrow();
  });
  it("fails closed for malformed direct policy inputs without throwing", () => {
    const state = withInbound();
    expect(evaluateAssistantEligibility(settings, state, "not-a-date").reason).toBe("INVALID_POLICY_CONTEXT");
    expect(evaluateAssistantEligibility(settings, { ...state, latestInbound: { ...state.latestInbound!, at: "not-a-date" } }, "2026-10-05T09:02:00+08:00").reason).toBe("INVALID_POLICY_CONTEXT");
  });
  it("fails closed when the bounded dedupe history is full", () => {
    const state = { ...withInbound(), eventIds: Array.from({ length: MAX_ASSISTANT_EVENTS }, (_, i) => `event-${i}`) };
    const next = applyAssistantConversationEvent(state, { ...inbound, eventId: "new" });
    expect(next.eventIds).toHaveLength(MAX_ASSISTANT_EVENTS);
    expect(evaluateAssistantEligibility(settings, next, "2026-10-05T09:02:00+08:00").reason).toBe("AMBIGUOUS_EVENT_STATE");
  });
  it("rejects ambiguous external-account mapping even across different tenants", () => {
    const row = { businessId: tenant.businessId, externalAccountId: "page-a", status: "CONNECTED" as const };
    expect(resolveAssistantConnection(tenant, "page-a", [row])).toEqual(row);
    expect(resolveAssistantConnection(tenant, "page-a", [row, { ...row, businessId: "tenant-b" }])).toBeNull();
    expect(resolveAssistantConnection(tenant, "page-a", [{ ...row, businessId: "tenant-b" }])).toBeNull();
    expect(resolveAssistantConnection(tenant, "page-a", [{ ...row, status: "REVOKED" }])).toBeNull();
    expect(resolveAssistantConnection(tenant, "page-a", [])).toBeNull();
  });
});
