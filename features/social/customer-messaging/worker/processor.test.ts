// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processMessagingBatch, recheckMessagingModelSubmit, type MessagingWorkerDependencies } from "@/features/social/customer-messaging/worker/processor";
import type { ClaimedMessagingJob, MessagingContext, MessagingJobStore } from "@/features/social/customer-messaging/contracts";

const now = new Date("2026-10-05T01:02:00Z");
const inboundAt = new Date("2026-10-05T01:00:00Z");
const job: ClaimedMessagingJob = { id: "job-a", businessId: "a", conversationId: "conversation-a", revision: 1, leaseToken: "exclusive-lease", attempts: 1, deliveryKey: "stable-delivery-a" };
function context(): MessagingContext {
  return { job, businessId: "a", businessSlug: "studio-a",
    settings: { mode: "AUTO", consent: true, aiConsent: true, paused: false, defaultLanguage: "EN", revision: 1 },
    channel: { id: "channel-a", appId: "app-a", pageId: "123", revision: 1, verifiedAt: now, permissionsVerifiedAt: now,
      metadataEchoVerified: true, facebookLoginVerified: true, permissionsVerified: true, pilotVerified: true,
      tokenEncrypted: "ciphertext", tokenExpiresAt: new Date("2026-10-06T00:00:00Z") },
    conversation: { revision: 1, latestInboundAt: inboundAt, latestInboundMessageId: "mid-inbound", lastHumanReplyAt: null,
      takeover: false, optedOut: false, languagePreference: null },
    messages: [{ id: "mid-inbound", text: "Magkano ang manicure gel?", direction: "INBOUND", occurredAt: inboundAt }], recipientId: "456",
    draft: { text: "Reviewed proposal", language: "FIL" },
  };
}
let deps: MessagingWorkerDependencies;
let store: MessagingJobStore;
let pendingJobs: ClaimedMessagingJob[];
beforeEach(() => {
  pendingJobs = [job];
  store = { claimDue: vi.fn().mockImplementation(async () => pendingJobs.splice(0, 1)), loadContext: vi.fn().mockImplementation(async () => context()),
    saveProposal: vi.fn().mockResolvedValue(true), markSending: vi.fn().mockImplementation(async () => context()),
    markOutcome: vi.fn().mockResolvedValue(true), cancel: vi.fn().mockResolvedValue(true), recordOptOut: vi.fn().mockResolvedValue(true),
    cleanupRetention: vi.fn().mockResolvedValue({ textPurged: 1, metadataPurged: 2 }) };
  deps = { store, now: () => now, workerEnabled: () => true, deliveryEnabled: () => true, killSwitch: () => false,
    hasEntitlements: vi.fn().mockResolvedValue(true), modelAvailable: () => true, takeModelBudget: vi.fn().mockResolvedValue(true),
    plan: vi.fn().mockResolvedValue({ status: "PROPOSED", text: "Reviewed proposal", language: "FILIPINO" }),
    send: vi.fn().mockResolvedValue({ status: "CONFIRMED", providerMessageId: "mid.own" }) };
});

describe("dedicated guarded messaging worker", () => {
  it("requires retention cleanup even when globally disabled, and aborts when cleanup fails", async () => {
    deps.workerEnabled = () => false;
    expect(await processMessagingBatch(deps)).toMatchObject({ enabled: false, processed: 0, textPurged: 1 });
    expect(store.claimDue).not.toHaveBeenCalled();
    vi.mocked(store.cleanupRetention).mockRejectedValue(new Error("unavailable"));
    await expect(processMessagingBatch(deps)).rejects.toThrow("unavailable"); expect(store.claimDue).not.toHaveBeenCalled();
  });
  it("claims a bounded batch with exclusive lease and sends only after repeated snapshots and CAS", async () => {
    expect(await processMessagingBatch(deps)).toMatchObject({ processed: 1, sent: 1 });
    expect(store.claimDue).toHaveBeenCalledWith({ now, limit: 1, leaseMs: 60000 });
    expect(store.claimDue).toHaveBeenCalledTimes(2);
    expect(store.loadContext).toHaveBeenCalledTimes(2);
    expect(store.saveProposal).toHaveBeenCalledWith(job, { text: "Reviewed proposal", language: "FIL" }, now, { settingsRevision: 1, channelRevision: 1 });
    expect(store.markSending).toHaveBeenCalledWith(job, now, { settingsRevision: 1, channelRevision: 1 });
    expect(deps.plan).toHaveBeenCalledWith(expect.anything(), "UNKNOWN", now);
    expect(deps.send).toHaveBeenCalledWith(expect.anything(), "Reviewed proposal", "stable-delivery-a");
    expect(store.markOutcome).toHaveBeenCalledWith(job, { status: "CONFIRMED", providerMessageId: "mid.own" }, now);
  });
  it("leases jobs just in time, processes at most ten, and leaves excess jobs unclaimed", async () => {
    pendingJobs = Array.from({ length: 20 }, (_, index) => ({ ...job, id: `job-${index}`, deliveryKey: `stable-${index}` }));
    let time = now;
    deps.now = () => time;
    vi.mocked(store.loadContext).mockImplementation(async claimed => ({ ...context(), job: claimed }));
    vi.mocked(store.markSending).mockImplementation(async claimed => ({ ...context(), job: claimed }));
    vi.mocked(deps.plan).mockImplementation(async () => {
      time = new Date(time.getTime() + 45_000);
      return { status: "PROPOSED", text: "Reviewed proposal", language: "FILIPINO" };
    });
    expect(await processMessagingBatch(deps)).toMatchObject({ processed: 10, sent: 10 });
    expect(store.claimDue).toHaveBeenCalledTimes(10); expect(pendingJobs).toHaveLength(10);
    for (let index = 0; index < 10; index++) {
      expect(vi.mocked(store.claimDue).mock.calls[index][0]).toEqual({ limit: 1, now: new Date(now.getTime() + index * 45_000), leaseMs: 60_000 });
    }
    expect(vi.mocked(store.claimDue).mock.invocationCallOrder[1]).toBeGreaterThan(vi.mocked(deps.send).mock.invocationCallOrder[0]);
  });
  it("finishes the last entitlement check before CAS and starts sending without another entitlement wait", async () => {
    const order: string[] = [];
    vi.mocked(deps.hasEntitlements).mockImplementation(async () => { order.push("entitlement"); return true; });
    vi.mocked(store.markSending).mockImplementation(async () => { order.push("markSending"); return context(); });
    vi.mocked(deps.send).mockImplementation(async () => { order.push("send"); return { status: "CONFIRMED", providerMessageId: "mid.own" }; });
    await processMessagingBatch(deps);
    expect(order).toEqual(["entitlement", "entitlement", "entitlement", "markSending", "send"]);
  });
  it("lets the locked final snapshot suppress a human reply racing an entitlement lookup", async () => {
    let replied = false;
    vi.mocked(deps.hasEntitlements).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockImplementation(async () => { replied = true; return true; });
    vi.mocked(store.markSending).mockImplementation(async () => replied ? null : context());
    expect(await processMessagingBatch(deps)).toMatchObject({ suppressed: 1, sent: 0 });
    expect(deps.send).not.toHaveBeenCalled(); expect(store.markOutcome).not.toHaveBeenCalled();
  });
  it("cancels final entitlement revocation while still CLAIMED and never marks SENDING", async () => {
    vi.mocked(deps.hasEntitlements).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await processMessagingBatch(deps)).toMatchObject({ suppressed: 1, sent: 0 });
    expect(store.cancel).toHaveBeenCalledWith(job, "ENTITLEMENT_REQUIRED", now);
    expect(store.markSending).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });
  it("persists an encrypted proposal through the repository in SUGGEST mode and never sends", async () => {
    vi.mocked(store.loadContext).mockImplementation(async () => { const value = context(); value.settings.mode = "SUGGEST"; return value; });
    expect(await processMessagingBatch(deps)).toMatchObject({ suggested: 1, sent: 0 });
    expect(store.saveProposal).toHaveBeenCalledOnce(); expect(store.markSending).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled(); expect(store.cancel).not.toHaveBeenCalled();
  });
  it.each(["CONSENT", "AI_CONSENT", "PAUSED", "TAKEOVER", "OPT_OUT", "HUMAN", "REVISION", "EXPIRED_WINDOW", "FUTURE", "TOKEN", "UNKNOWN_TOKEN_EXPIRY"])("suppresses %s before a model", async reason => {
    vi.mocked(store.loadContext).mockImplementation(async () => {
      const value = context();
      if (reason === "CONSENT") value.settings.consent = false;
      if (reason === "AI_CONSENT") value.settings.aiConsent = false;
      if (reason === "PAUSED") value.settings.paused = true;
      if (reason === "TAKEOVER") value.conversation.takeover = true;
      if (reason === "OPT_OUT") value.conversation.optedOut = true;
      if (reason === "HUMAN") value.conversation.lastHumanReplyAt = now;
      if (reason === "REVISION") value.conversation.revision++;
      if (reason === "EXPIRED_WINDOW") value.conversation.latestInboundAt = new Date(now.getTime() - 86400000);
      if (reason === "FUTURE") value.conversation.latestInboundAt = new Date(now.getTime() + 1);
      if (reason === "TOKEN") value.channel.tokenExpiresAt = now;
      if (reason === "UNKNOWN_TOKEN_EXPIRY") value.channel.tokenExpiresAt = null;
      return value;
    });
    expect(await processMessagingBatch(deps)).toMatchObject({ sent: 0, suppressed: 1 }); expect(deps.plan).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });
  it("persists a local opt-out separately before any model request", async () => {
    vi.mocked(store.loadContext).mockImplementation(async () => { const value = context(); value.messages[0].text = "Huwag na kayo mag-message"; return value; });
    await processMessagingBatch(deps); expect(store.recordOptOut).toHaveBeenCalledWith(job, now); expect(deps.plan).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });
  it("fails closed on missing entitlement, model configuration or distributed cost budget", async () => {
    for (const reason of ["entitlement", "model", "budget"]) {
      pendingJobs = [job];
      deps.hasEntitlements = vi.fn().mockResolvedValue(reason !== "entitlement");
      deps.modelAvailable = () => reason !== "model"; deps.takeModelBudget = vi.fn().mockResolvedValue(reason !== "budget");
      await processMessagingBatch(deps);
    }
    expect(deps.plan).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });
  it("rechecks revocation during budget acquisition before any model request", async () => {
    vi.mocked(store.loadContext).mockResolvedValueOnce(context()).mockImplementation(async () => { const value = context(); value.settings.revision++; return value; });
    expect(await processMessagingBatch(deps)).toMatchObject({ suppressed: 1 }); expect(deps.plan).not.toHaveBeenCalled();
  });
  it("reloads consent after the pre-model entitlement wait and never invokes planning on revocation", async () => {
    let consent = true;
    let checks = 0;
    vi.mocked(deps.hasEntitlements).mockImplementation(async () => { if (++checks === 2) consent = false; return true; });
    vi.mocked(store.loadContext).mockImplementation(async () => { const value = context(); value.settings.aiConsent = consent; return value; });
    expect(await processMessagingBatch(deps)).toMatchObject({ suppressed: 1, sent: 0 });
    expect(deps.plan).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });
  it("checks entitlement before the final submission snapshot and suppresses consent revoked during the wait", async () => {
    const order: string[] = [];
    let consent = true;
    vi.mocked(deps.hasEntitlements).mockImplementation(async () => { order.push("entitlement"); consent = false; return true; });
    vi.mocked(store.loadContext).mockImplementation(async () => { order.push("snapshot"); const value = context(); value.settings.aiConsent = consent; return value; });
    expect(await recheckMessagingModelSubmit(context(), deps)).toBe(false);
    expect(order).toEqual(["entitlement", "snapshot"]);
  });
  it("does not send after CAS proposal or final claim loses a race", async () => {
    vi.mocked(store.saveProposal).mockResolvedValue(false); await processMessagingBatch(deps); expect(deps.send).not.toHaveBeenCalled();
    vi.mocked(store.saveProposal).mockResolvedValue(true); vi.mocked(store.markSending).mockResolvedValue(null);
    pendingJobs = [job];
    await processMessagingBatch(deps); expect(deps.send).not.toHaveBeenCalled();
  });
  it.each(["human", "inbound", "channel", "settings", "pause", "optout", "kill", "delivery"])("suppresses a final %s race", async reason => {
    vi.mocked(store.markSending).mockImplementation(async () => {
      const value = context();
      if (reason === "human") value.conversation.lastHumanReplyAt = now;
      if (reason === "inbound") value.conversation.latestInboundMessageId = "new-mid";
      if (reason === "channel") value.channel.revision++;
      if (reason === "settings") value.settings.revision++;
      if (reason === "pause") value.settings.paused = true;
      if (reason === "optout") value.conversation.optedOut = true;
      if (reason === "kill") deps.killSwitch = () => true;
      if (reason === "delivery") deps.deliveryEnabled = () => false;
      return value;
    });
    await processMessagingBatch(deps); expect(deps.send).not.toHaveBeenCalled();
    expect(store.markOutcome).toHaveBeenCalledWith(job, { status: "FAILED", retryable: false }, now);
  });
  it("quarantines unknown or thrown sends without retrying", async () => {
    vi.mocked(deps.send).mockResolvedValue({ status: "UNKNOWN" });
    expect(await processMessagingBatch(deps)).toMatchObject({ unknown: 1 }); expect(deps.send).toHaveBeenCalledOnce();
    expect(store.markOutcome).toHaveBeenCalledWith(job, { status: "UNKNOWN" }, now);
    vi.mocked(deps.send).mockRejectedValue(new Error("provider private text"));
    pendingJobs = [job];
    expect(await processMessagingBatch(deps)).toMatchObject({ unknown: 1 }); expect(deps.send).toHaveBeenCalledTimes(2);
  });
  it("does not report success when confirmed delivery cannot be recorded", async () => {
    vi.mocked(store.markOutcome).mockResolvedValue(false);
    expect(await processMessagingBatch(deps)).toMatchObject({ sent: 0, unknown: 1 });
  });
  it("requires fresh token and window again at final send time", async () => {
    let time = now;
    deps.now = () => time;
    vi.mocked(store.markSending).mockImplementation(async () => { time = new Date("2026-10-06T01:00:00Z"); return context(); });
    await processMessagingBatch(deps); expect(deps.send).not.toHaveBeenCalled();
  });
});
