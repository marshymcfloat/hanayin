import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { prisma } from "@/prisma/prisma";
import { ingestMessengerEnvelope } from "@/features/social/customer-messaging/ingestion";
import { createMessagingRepository } from "@/features/social/customer-messaging/repository";
import { encryptMessagingValue, decryptMessagingValue } from "@/features/social/customer-messaging/crypto";
import { messengerEnvelopeSchema } from "@/features/social/customer-messaging/schemas";
import { MESSAGING_TEXT_RETENTION_MS, MESSAGING_METADATA_RETENTION_MS } from "@/features/social/customer-messaging/config";
import { getConversationDetail, getInboxSnapshot, setConversationTakeover } from "@/features/social/customer-messaging/inbox-service";

vi.mock("server-only", () => ({}));
requireTestDatabase();

const now = new Date("2030-01-15T09:00:00Z");
const due = new Date(now.getTime() + 120_001);
const factory = createSharedWorkflowFactory({ namespace: "integration-customer-messaging", now });
const business = factory.business();
const foreign = factory.business({ id: business.id + "-foreign", slug: business.slug + "-foreign" });
const owner = factory.user({ contactNumber: "+639170009903" });
const channelId = "integration-customer-messaging-channel";
const appId = "integration-customer-messaging-app";
const pageId = "integration-customer-messaging-page";
const recipientId = "synthetic-messenger-recipient";
const store = createMessagingRepository();

function envelope(mid: string, text = "How much is manicure gel?", timestamp = now.getTime(), echo = false) {
  return messengerEnvelopeSchema.parse({ object: "page", entry: [{ id: pageId, time: timestamp, messaging: [{
    sender: { id: echo ? pageId : recipientId }, recipient: { id: echo ? recipientId : pageId }, timestamp,
    message: { mid, text, ...(echo ? { is_echo: true } : {}) },
  }] }] });
}

function assistantEcho(mid: string, deliveryKey: string, timestamp: number, echoAppId = appId, text = "Synthetic grounded reply") {
  const value = envelope(mid, text, timestamp, true);
  value.entry[0].messaging[0].message = {
    mid, text, is_echo: true, app_id: echoAppId, metadata: `sf:${deliveryKey}`,
  };
  return value;
}

async function inbound(mid = "synthetic-inbound-1") {
  await ingestMessengerEnvelope(envelope(mid), now);
  return prisma.customerConversation.findFirstOrThrow({ where: { business_id: business.id } });
}

async function claimed() {
  await inbound();
  const [job] = await store.claimDue({ limit: 1, now: due, leaseMs: 60_000 });
  expect(job).toBeDefined();
  const context = await store.loadContext(job, due);
  expect(context).not.toBeNull();
  if (!context) throw new Error("Missing synthetic worker context.");
  return { job, context, expected: { settingsRevision: context.settings.revision, channelRevision: context.channel.revision } };
}

describe("durable Messenger PostgreSQL state", () => {
  beforeAll(async () => {
    vi.stubEnv("SOCIAL_MESSAGING_APP_ID", appId);
    vi.stubEnv("SOCIAL_MESSAGING_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubEnv("SOCIAL_MESSAGING_INTAKE_ENABLED", "true");
    vi.stubEnv("SOCIAL_MESSAGING_WORKER_ENABLED", "true");
    vi.stubEnv("SOCIAL_MESSAGING_DELIVERY_ENABLED", "true");
    vi.stubEnv("SOCIAL_MESSAGING_KILL_SWITCH", "false");
    await prisma.business.deleteMany({ where: { id: { in: [business.id, foreign.id] } } });
    await prisma.user.deleteMany({ where: { id: owner.id } });
    for (const record of [business, foreign]) await prisma.business.create({ data: {
      id: record.id, slug: record.slug, name: record.name, initials: record.initials,
    } });
    await prisma.user.create({ data: { id: owner.id, name: owner.name, contact_number: owner.contactNumber,
      hashed_password: owner.hashedPassword, role: "OWNER" } });
    await prisma.owner.create({ data: { user_id: owner.id, business_id: business.id, permissions: ["SETTINGS_MANAGE"] } });
  });
  beforeEach(async () => {
    await prisma.messengerChannel.deleteMany({ where: { business_id: { in: [business.id, foreign.id] } } });
    await prisma.customerMessagingSettings.deleteMany({ where: { business_id: { in: [business.id, foreign.id] } } });
    await prisma.socialConnection.deleteMany({ where: { business_id: business.id } });
    await prisma.user.update({ where: { id: owner.id }, data: { role: "OWNER" } });
    await prisma.owner.update({ where: { user_id: owner.id }, data: { permissions: ["SETTINGS_MANAGE"] } });
    await prisma.messengerChannel.create({ data: {
      id: channelId, business_id: business.id, app_id: appId, page_id: pageId, display_name: "Synthetic reviewed Page",
      token_encrypted: encryptMessagingValue("synthetic-page-token", { purpose: "CHANNEL_TOKEN", businessId: business.id, conversationId: channelId }),
      token_expires_at: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000), active: true,
      verified_at: now, permissions_verified_at: now, pages_messaging_granted: true,
      facebook_login_verified: true, app_review_verified: true, business_verified: true, page_message_task: true,
      webhook_subscribed: true, echoes_verified: true, metadata_echo_verified: true, pilot_approved: true,
    } });
    await prisma.customerMessagingSettings.create({ data: {
      business_id: business.id, mode: "AUTO", consent: true, ai_consent: true,
      consenting_user_id: owner.id, default_language: "FIL",
    } });
  });
  afterAll(async () => {
    try {
      await prisma.business.deleteMany({ where: { id: { in: [business.id, foreign.id] } } });
      await prisma.user.deleteMany({ where: { id: owner.id } });
    } finally { vi.unstubAllEnvs(); await prisma.$disconnect(); }
  });

  it("deduplicates concurrent receipts/messages and creates one encrypted delayed job", async () => {
    await Promise.all([ingestMessengerEnvelope(envelope("duplicate-mid"), now), ingestMessengerEnvelope(envelope("duplicate-mid"), now)]);
    expect(await prisma.customerMessagingReceipt.count({ where: { business_id: business.id } })).toBe(1);
    expect(await prisma.customerMessage.count({ where: { business_id: business.id } })).toBe(1);
    expect(await prisma.customerMessagingJob.count({ where: { business_id: business.id } })).toBe(1);
    const conversation = await prisma.customerConversation.findFirstOrThrow({ where: { business_id: business.id } });
    const message = await prisma.customerMessage.findFirstOrThrow({ where: { business_id: business.id } });
    expect(conversation.recipient_encrypted).not.toContain(recipientId);
    expect(message.text_encrypted).not.toContain("How much");
    expect(message.text_expires_at.getTime()).toBe(now.getTime() + MESSAGING_TEXT_RETENTION_MS);
    expect(decryptMessagingValue(message.text_encrypted ?? "", { purpose: "MESSAGE_TEXT", businessId: business.id, conversationId: conversation.id })).toBe("How much is manicure gel?");
  });
  it("uses latest inbound revision/debounce and keeps out-of-order events from restoring an old job", async () => {
    await inbound("first");
    const later = new Date(now.getTime() + 30_000);
    await ingestMessengerEnvelope(envelope("later", "Magkano po ang manicure gel?", later.getTime()), later);
    await ingestMessengerEnvelope(envelope("old", "How much?", now.getTime() - 10_000), later);
    const conversation = await prisma.customerConversation.findFirstOrThrow({ where: { business_id: business.id } });
    expect(conversation.revision).toBe(2);
    expect(conversation.latest_inbound_at).toEqual(later);
    expect(await store.claimDue({ limit: 5, now: due, leaseMs: 60_000 })).toEqual([]);
    const jobs = await store.claimDue({ limit: 5, now: new Date(later.getTime() + 120_000), leaseMs: 60_000 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].revision).toBe(2);
  });
  it("enforces globally unique app/Page mappings and tenant composite foreign keys", async () => {
    await expect(prisma.messengerChannel.create({ data: {
      business_id: foreign.id, app_id: appId, page_id: pageId, display_name: "Foreign", token_encrypted: "synthetic",
    } })).rejects.toThrow();
    const conversation = await inbound();
    await expect(prisma.customerMessage.create({ data: {
      business_id: foreign.id, conversation_id: conversation.id, provider_message_hash: "foreign-synthetic-hash", direction: "INBOUND",
      text_expires_at: new Date(now.getTime() + MESSAGING_TEXT_RETENTION_MS), occurred_at: now,
      metadata_expires_at: new Date(now.getTime() + MESSAGING_METADATA_RETENTION_MS),
    } })).rejects.toThrow();
    expect(await getConversationDetail(foreign.id, conversation.id)).toBeNull();
  });
  it("does not accept publishing CONNECTED status as messaging proof", async () => {
    await prisma.messengerChannel.deleteMany({ where: { business_id: business.id } });
    await prisma.socialConnection.create({ data: { business_id: business.id, platform: "FACEBOOK_PAGE", external_account_id: pageId,
      display_name: "Publishing only", access_token_encrypted: "synthetic", status: "CONNECTED" } });
    expect(await ingestMessengerEnvelope(envelope("publishing-only"), now)).toEqual({ accepted: 0 });
    expect(await prisma.customerMessage.count({ where: { business_id: business.id } })).toBe(0);
  });
  it("suppresses human/unknown echoes and unsupported attachments durably", async () => {
    const conversation = await inbound();
    await ingestMessengerEnvelope(envelope("human-echo", "Synthetic staff reply", now.getTime() + 1, true), new Date(now.getTime() + 1));
    expect(await store.claimDue({ limit: 5, now: due, leaseMs: 60_000 })).toEqual([]);
    expect(await prisma.customerConversation.findUniqueOrThrow({ where: { id: conversation.id } })).toMatchObject({ takeover: true });
    const attachment = messengerEnvelopeSchema.parse({ object: "page", entry: [{ id: pageId, time: now.getTime(), messaging: [{
      sender: { id: "synthetic-attachment-recipient" }, recipient: { id: pageId }, timestamp: now.getTime(),
      message: { mid: "attachment-mid", attachments: [{ type: "image" }] },
    }] }] });
    await ingestMessengerEnvelope(attachment, now);
    expect(await prisma.customerConversation.count({ where: { business_id: business.id, takeover: true } })).toBe(2);
  });
  it("rejects future events without storing content", async () => {
    await ingestMessengerEnvelope(envelope("future", "How much?", now.getTime() + 1), now);
    expect(await prisma.customerMessage.count({ where: { business_id: business.id } })).toBe(0);
  });
  it("records Filipino opt-out before work and preserves it beyond thirty-day cleanup", async () => {
    await inbound();
    await ingestMessengerEnvelope(envelope("opt-out", "Wag na kayo mag-message", now.getTime() + 1), new Date(now.getTime() + 1));
    expect(await prisma.customerMessagingSuppression.count({ where: { business_id: business.id } })).toBe(1);
    expect(await store.claimDue({ limit: 5, now: due, leaseMs: 60_000 })).toEqual([]);
    const later = new Date(now.getTime() + MESSAGING_METADATA_RETENTION_MS + 2);
    await store.cleanupRetention(later, 100);
    expect(await prisma.customerConversation.count({ where: { business_id: business.id } })).toBe(0);
    expect(await prisma.customerMessagingSuppression.count({ where: { business_id: business.id } })).toBe(1);
    await ingestMessengerEnvelope(envelope("later-replay", "How much?", later.getTime()), later);
    expect(await prisma.customerConversation.findFirstOrThrow({ where: { business_id: business.id } })).toMatchObject({ opted_out: true });
    expect(await prisma.customerMessagingJob.count({ where: { business_id: business.id, status: "PENDING" } })).toBe(0);
  });
  it("claims exactly once across simultaneous leases and rejects stale lease writers", async () => {
    await inbound();
    const concurrent = await Promise.all([store.claimDue({ limit: 1, now: due, leaseMs: 60_000 }), store.claimDue({ limit: 1, now: due, leaseMs: 60_000 })]);
    const jobs = concurrent.flat();
    expect(jobs).toHaveLength(1);
    expect(await store.cancel({ ...jobs[0], leaseToken: "stale-lease" }, "STALE", due)).toBe(false);
    expect(await store.cancel(jobs[0], "OWNER_PAUSED", due)).toBe(true);
  });
  it("rechecks current owner permission, consent/settings revisions and channel revisions before proposals or sending", async () => {
    const { job, expected } = await claimed();
    expect(await store.saveProposal(job, { text: "Synthetic grounded reply", language: "EN" }, due, expected)).toBe(true);
    await prisma.customerMessagingSettings.update({ where: { business_id: business.id }, data: { revision: { increment: 1 } } });
    expect(await store.markSending(job, due, expected)).toBeNull();
    expect(await store.saveProposal(job, { text: "Stale reply", language: "EN" }, due, expected)).toBe(false);
    await prisma.customerMessagingSettings.update({ where: { business_id: business.id }, data: { revision: expected.settingsRevision } });
    await prisma.messengerChannel.update({ where: { id: channelId }, data: { revision: { increment: 1 } } });
    expect(await store.markSending(job, due, expected)).toBeNull();
    await prisma.owner.update({ where: { user_id: owner.id }, data: { permissions: [] } });
    expect(await store.loadContext(job, due)).toBeNull();
  });
  it("prevents sending after committed human takeover/new inbound and retains the unavoidable external race boundary", async () => {
    const { job, expected } = await claimed();
    await store.saveProposal(job, { text: "Synthetic grounded reply", language: "EN" }, due, expected);
    await ingestMessengerEnvelope(envelope("human-before-send", "Synthetic staff reply", due.getTime(), true), due);
    expect(await store.markSending(job, due, expected)).toBeNull();
    expect((await prisma.customerMessagingJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CANCELLED");
  });
  it("quarantines an expired SENDING lease instead of retrying an unknown remote outcome", async () => {
    const { job, expected } = await claimed();
    await store.saveProposal(job, { text: "Synthetic grounded reply", language: "EN" }, due, expected);
    expect(await store.markSending(job, due, expected)).not.toBeNull();
    const expired = new Date(due.getTime() + 60_001);
    expect(await store.claimDue({ limit: 5, now: expired, leaseMs: 60_000 })).toEqual([]);
    expect(await prisma.customerMessagingJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "UNKNOWN", lease_token: null });
    expect(await store.markOutcome(job, { status: "FAILED", retryable: true }, expired)).toBe(false);
    expect(await prisma.customerConversation.findUniqueOrThrow({ where: { id: job.conversationId } })).toMatchObject({ takeover: true });
  });
  it("correlates an own-app echo before the Send API acknowledgement and prevents late outcome downgrade", async () => {
    const { job, expected } = await claimed();
    await store.saveProposal(job, { text: "Synthetic grounded reply", language: "EN" }, due, expected);
    await store.markSending(job, due, expected);
    const echoAt = new Date(due.getTime() + 10);
    await ingestMessengerEnvelope(assistantEcho("early-own-echo", job.deliveryKey, echoAt.getTime()), echoAt);
    expect(await prisma.customerMessagingJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "CONFIRMED", reason: "OWN_ECHO_OBSERVED", lease_token: null,
    });
    expect(await prisma.customerConversation.findUniqueOrThrow({ where: { id: job.conversationId } })).toMatchObject({
      revision: job.revision, takeover: false, last_human_reply_at: null,
    });
    expect(await store.markOutcome(job, { status: "UNKNOWN" }, echoAt)).toBe(true);
    expect(await store.markOutcome(job, { status: "FAILED", retryable: true }, echoAt)).toBe(true);
    expect((await prisma.customerMessagingJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CONFIRMED");
    expect(await store.claimDue({ limit: 5, now: echoAt, leaseMs: 60_000 })).toEqual([]);
  });
  it("resolves a lost-ack unknown send from its authenticated echo without resending", async () => {
    const { job, expected } = await claimed();
    await store.saveProposal(job, { text: "Synthetic grounded reply", language: "EN" }, due, expected);
    await store.markSending(job, due, expected);
    expect(await store.markOutcome(job, { status: "UNKNOWN" }, due)).toBe(true);
    const echoAt = new Date(due.getTime() + 10);
    await ingestMessengerEnvelope(assistantEcho("late-own-echo", job.deliveryKey, echoAt.getTime()), echoAt);
    expect((await prisma.customerMessagingJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CONFIRMED");
    expect(await prisma.customerConversation.findUniqueOrThrow({ where: { id: job.conversationId } })).toMatchObject({
      takeover: false, last_human_reply_at: null,
    });
    expect(await store.claimDue({ limit: 5, now: echoAt, leaseMs: 60_000 })).toEqual([]);
  });
  it("preserves explicit owner takeover before lease expiry when a late own echo resolves the send", async () => {
    const { job, expected } = await claimed();
    await store.saveProposal(job, { text: "Synthetic grounded reply", language: "EN" }, due, expected);
    await store.markSending(job, due, expected);
    expect(await setConversationTakeover(business.id, owner.id, job.conversationId, true)).toBe(true);
    expect(await prisma.customerConversation.findUniqueOrThrow({ where: { id: job.conversationId } })).toMatchObject({
      revision: job.revision + 1, takeover: true,
    });
    const expired = new Date(due.getTime() + 60_001);
    expect(await store.claimDue({ limit: 5, now: expired, leaseMs: 60_000 })).toEqual([]);
    expect(await prisma.customerConversation.findUniqueOrThrow({ where: { id: job.conversationId } })).toMatchObject({
      revision: job.revision + 2, takeover: true,
    });
    const echoAt = new Date(expired.getTime() + 1);
    await ingestMessengerEnvelope(assistantEcho("owner-takeover-late-echo", job.deliveryKey, echoAt.getTime()), echoAt);
    expect((await prisma.customerMessagingJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CONFIRMED");
    expect(await prisma.customerConversation.findUniqueOrThrow({ where: { id: job.conversationId } })).toMatchObject({
      revision: job.revision + 2, takeover: true, last_human_reply_at: null,
    });
    expect(await store.claimDue({ limit: 5, now: echoAt, leaseMs: 60_000 })).toEqual([]);
  });
  it.each(["OTHER_APP", "FAKE_KEY", "MISMATCHED_TEXT"])("keeps %s echo evidence human/unknown and preserves human takeover during late reconciliation", async variant => {
    const { job, expected } = await claimed();
    await store.saveProposal(job, { text: "Synthetic grounded reply", language: "EN" }, due, expected);
    await store.markSending(job, due, expected);
    const echoAt = new Date(due.getTime() + 10);
    await ingestMessengerEnvelope(assistantEcho("untrusted-echo", variant === "FAKE_KEY" ? "11111111-1111-4111-8111-111111111111" : job.deliveryKey,
      echoAt.getTime(), variant === "OTHER_APP" ? "another-app" : appId,
      variant === "MISMATCHED_TEXT" ? "Different text" : "Synthetic grounded reply"), echoAt);
    expect(await prisma.customerConversation.findUniqueOrThrow({ where: { id: job.conversationId } })).toMatchObject({ takeover: true, last_human_reply_at: echoAt });
    await store.markOutcome(job, { status: "UNKNOWN" }, echoAt);
    const late = new Date(echoAt.getTime() + 10);
    await ingestMessengerEnvelope(assistantEcho("later-real-own-echo", job.deliveryKey, late.getTime()), late);
    expect((await prisma.customerMessagingJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CONFIRMED");
    expect((await prisma.customerConversation.findUniqueOrThrow({ where: { id: job.conversationId } })).takeover).toBe(true);
  });
  it("purges text from messages and every job copy without deleting retained delivery metadata", async () => {
    const { job, expected } = await claimed();
    await store.saveProposal(job, { text: "Synthetic grounded reply", language: "EN" }, due, expected);
    const expiredText = new Date(now.getTime() + MESSAGING_TEXT_RETENTION_MS);
    await store.cleanupRetention(expiredText, 100);
    expect(await prisma.customerMessage.findFirstOrThrow({ where: { business_id: business.id } })).toMatchObject({ text_encrypted: null });
    expect(await prisma.customerMessagingJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ draft_encrypted: null, draft_language: null });
    expect(await prisma.customerMessagingReceipt.count({ where: { business_id: business.id } })).toBe(1);
    expect(await prisma.customerMessagingJob.count({ where: { business_id: business.id } })).toBe(1);
  });
  it("commits bounded cleanup progress and fails closed while expired content remains", async () => {
    await inbound();
    const later = new Date(now.getTime() + 1);
    await ingestMessengerEnvelope(envelope("second-content", "Magkano po?", later.getTime()), later);
    const expired = new Date(now.getTime() + MESSAGING_TEXT_RETENTION_MS + 2);
    await expect(store.cleanupRetention(expired, 1)).rejects.toThrow("Messaging retention backlog requires cleanup.");
    expect(await prisma.customerMessage.count({ where: { business_id: business.id, text_encrypted: null } })).toBe(1);
    await expect(store.claimDue({ limit: 1, now: expired, leaseMs: 60_000 })).rejects.toThrow("Messaging retention backlog requires cleanup.");
    await store.cleanupRetention(expired, 100);
  });
  it("rolls back graph writes when a transaction fails and enforces retention constraints", async () => {
    const conversation = await inbound();
    await expect(prisma.$transaction(async tx => {
      await tx.customerMessagingReceipt.create({ data: {
        business_id: business.id, channel_id: channelId, event_hash: "synthetic-rollback", occurred_at: now,
        metadata_expires_at: new Date(now.getTime() + MESSAGING_METADATA_RETENTION_MS),
      } });
      throw new Error("Synthetic dependent write failure");
    })).rejects.toThrow("Synthetic dependent write failure");
    expect(await prisma.customerMessagingReceipt.count({ where: { event_hash: "synthetic-rollback" } })).toBe(0);
    await expect(prisma.customerMessage.create({ data: {
      business_id: business.id, conversation_id: conversation.id, provider_message_hash: "bad-retention", direction: "INBOUND",
      occurred_at: now, text_expires_at: new Date(now.getTime() + MESSAGING_TEXT_RETENTION_MS + 1),
      metadata_expires_at: new Date(now.getTime() + MESSAGING_METADATA_RETENTION_MS),
    } })).rejects.toThrow();
  });
  it("returns minimized inbox DTOs with no customer/provider identities", async () => {
    await inbound();
    const snapshot = await getInboxSnapshot(business.id);
    expect(snapshot.conversations).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toContain(recipientId);
    expect(JSON.stringify(snapshot)).not.toContain("synthetic-page-token");
    const detail = await getConversationDetail(business.id, snapshot.conversations[0].id);
    expect(detail?.messages[0].text).toBe("How much is manicure gel?");
    expect(JSON.stringify(detail)).not.toContain(recipientId);
  });
});
