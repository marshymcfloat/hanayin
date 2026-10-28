import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import type { InboxConversationDetail, InboxConversationSummary, InboxSnapshot, MessagingDeliveryTruth, MessagingReadinessReason, MessagingSettings } from "@/features/social/customer-messaging/contracts";
import { messagingSettingsSchema, type MessagingSettingsInput } from "@/features/social/customer-messaging/schemas";
import { decryptMessagingValue, isMessagingEncryptionAvailable } from "@/features/social/customer-messaging/crypto";
import { channelReadinessReasons, lockMessagingChannel, lockMessagingConversation, messagingSchemaAvailable } from "@/features/social/customer-messaging/repository";
import { getMessagingConfig } from "@/features/social/customer-messaging/config";
import { messagingPublicOrigin } from "@/features/social/customer-messaging/worker/booking-link";

export class MessagingUnavailableError extends Error {
  constructor(message = "Customer inbox is unavailable.") { super(message); }
}

const defaults: MessagingSettings = { mode: "OFF", consent: false, aiConsent: false, paused: false, defaultLanguage: "FIL" };

function runtimeReadiness(): MessagingReadinessReason[] {
  const config = getMessagingConfig();
  const reasons: MessagingReadinessReason[] = [];
  if (!messagingSchemaAvailable()) reasons.push("SCHEMA_UNAVAILABLE");
  if (!isMessagingEncryptionAvailable()) reasons.push("ENCRYPTION_UNAVAILABLE");
  if (!config.intakeEnabled || config.killSwitch) reasons.push("INTAKE_DISABLED");
  if (!config.deliveryEnabled || config.killSwitch) reasons.push("DELIVERY_DISABLED");
  if (!config.workerEnabled || config.killSwitch) reasons.push("WORKER_DISABLED");
  if (!config.appId || !config.appSecret || !config.verifyToken || config.appSecret === config.verifyToken) reasons.push("WEBHOOK_UNCONFIGURED");
  if (!config.aiEnabled || !process.env.TYPESAFE_API_KEY?.trim()) reasons.push("AI_UNAVAILABLE");
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) reasons.push("RATE_STORE_UNAVAILABLE");
  if (!/^v\d+\.\d+$/.test(config.graphApiVersion)) reasons.push("GRAPH_VERSION_UNCONFIGURED");
  if (!messagingPublicOrigin(config.publicBaseUrl)) reasons.push("PUBLIC_URL_UNCONFIGURED");
  return reasons;
}

function unavailableSnapshot(reasons: MessagingReadinessReason[]): InboxSnapshot {
  return { setupStatus: "SETUP_REQUIRED", readinessReasons: [...new Set([...reasons,
    "CHANNEL_UNVERIFIED" as const, "PERMISSIONS_UNVERIFIED" as const, "PILOT_UNVERIFIED" as const])], channel: null,
    settings: { ...defaults }, canEnableAuto: false, conversations: [] };
}

type SummaryRecord = {
  id: string; last_activity_at: Date; takeover: boolean; opted_out: boolean;
};
function summary(record: SummaryRecord): InboxConversationSummary {
  return { id: record.id, title: "Customer conversation", lastActivityAt: record.last_activity_at.toISOString(),
    takeover: record.takeover, optedOut: record.opted_out,
    status: record.opted_out ? "OPTED_OUT" : record.takeover ? "HUMAN" : "OPEN" };
}

function deliveryTruth(status?: string): MessagingDeliveryTruth {
  if (status === "UNKNOWN" || status === "CONFIRMED" || status === "FAILED") return status;
  if (status === "SENDING" || status === "PENDING" || status === "CLAIMED") return "PENDING";
  return "NONE";
}

function requireReadiness() {
  const reasons = runtimeReadiness();
  if (reasons.includes("SCHEMA_UNAVAILABLE") || reasons.includes("ENCRYPTION_UNAVAILABLE")) throw new MessagingUnavailableError("Customer inbox setup is required.");
}

// Tenant identity is supplied only by the authenticated owner boundary.
export async function getInboxSnapshot(businessId: string): Promise<InboxSnapshot> {
  const reasons = runtimeReadiness();
  if (reasons.includes("SCHEMA_UNAVAILABLE") || reasons.includes("ENCRYPTION_UNAVAILABLE")) return unavailableSnapshot(reasons);
  const now = new Date();
  try {
    const channels = await prisma.messengerChannel.findMany({ where: { business_id: businessId }, take: 2, orderBy: { created_at: "desc" } });
    const channel = channels.length === 1 ? channels[0] : null;
    if (channel && channel.app_id !== getMessagingConfig().appId) reasons.push("CHANNEL_UNVERIFIED");
    reasons.push(...channelReadinessReasons(channel, now));
    const settings = await prisma.customerMessagingSettings.findUnique({ where: { business_id: businessId } });
    const conversations = await prisma.customerConversation.findMany({
      where: { business_id: businessId, metadata_expires_at: { gt: now } },
      select: { id: true, takeover: true, opted_out: true, last_activity_at: true },
      orderBy: [{ last_activity_at: "desc" }, { id: "desc" }], take: 50,
    });
    const uniqueReasons = [...new Set(reasons)];
    return {
      setupStatus: uniqueReasons.length ? "SETUP_REQUIRED" : "READY", readinessReasons: uniqueReasons,
      channel: channel ? { displayName: channel.display_name.slice(0, 120), verified: channelReadinessReasons(channel, now).length === 0 } : null,
      settings: settings ? { mode: settings.mode, consent: settings.consent, aiConsent: settings.ai_consent,
        paused: settings.paused, defaultLanguage: settings.default_language === "UNKNOWN" ? "FIL" : settings.default_language } : { ...defaults },
      canEnableAuto: uniqueReasons.length === 0,
      conversations: conversations.map(summary),
    };
  } catch { return unavailableSnapshot([...new Set([...reasons, "SCHEMA_UNAVAILABLE" as const])]); }
}

export async function getConversationDetail(businessId: string, id: string): Promise<InboxConversationDetail | null> {
  requireReadiness();
  const now = new Date();
  try {
    const conversation = await prisma.customerConversation.findFirst({ where: {
      id, business_id: businessId, metadata_expires_at: { gt: now },
    }, select: { id: true, takeover: true, opted_out: true, last_activity_at: true } });
    if (!conversation) return null;
    const messages = await prisma.customerMessage.findMany({ where: {
      conversation_id: id, business_id: businessId, metadata_expires_at: { gt: now },
    }, orderBy: [{ occurred_at: "desc" }, { id: "desc" }], take: 50 });
    const job = await prisma.customerMessagingJob.findFirst({ where: {
      conversation_id: id, business_id: businessId, metadata_expires_at: { gt: now },
    }, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
    const scope = { businessId, conversationId: id };
    return {
      conversation: summary(conversation),
      messages: [
        ...messages.reverse().map(message => ({ id: message.id, direction: message.direction,
        text: message.text_encrypted && message.text_expires_at > now ? decryptMessagingValue(message.text_encrypted, { ...scope, purpose: "MESSAGE_TEXT" }) : null,
        occurredAt: message.occurred_at.toISOString(), deliveryStatus: message.direction === "OUTBOUND" ? "CONFIRMED" as const : "NONE" as const })),
        ...(job?.status === "CONFIRMED" && job.draft_encrypted && job.text_expires_at > now
          && !messages.some(message => message.provider_message_hash === job.provider_message_hash) ? [{
          id: job.id, direction: "OUTBOUND" as const,
          text: decryptMessagingValue(job.draft_encrypted, { ...scope, purpose: "DRAFT_TEXT" }),
          occurredAt: job.updated_at.toISOString(), deliveryStatus: "CONFIRMED" as const,
        }] : []),
      ].slice(-50),
      draft: job?.draft_encrypted && job.text_expires_at > now && (job.status === "SUGGESTED" || job.status === "CLAIMED")
        ? { text: decryptMessagingValue(job.draft_encrypted, { ...scope, purpose: "DRAFT_TEXT" }), createdAt: job.created_at.toISOString() } : null,
      deliveryTruth: deliveryTruth(job?.status),
    };
  } catch { throw new MessagingUnavailableError(); }
}

async function requireCurrentOwner(tx: Prisma.TransactionClient, businessId: string, userId: string) {
  const owner = await tx.owner.findFirst({ where: {
    business_id: businessId, user_id: userId, user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" },
  }, select: { id: true } });
  if (!owner) throw new MessagingUnavailableError("Customer inbox access is unavailable.");
}

export async function updateSettings(businessId: string, userId: string, input: MessagingSettingsInput): Promise<MessagingSettings> {
  const parsed = messagingSettingsSchema.safeParse(input);
  if (!parsed.success) throw new MessagingUnavailableError("Invalid inbox settings or missing consent.");
  requireReadiness();
  const now = new Date();
  try {
    await prisma.$transaction(async tx => {
      const channels = await tx.messengerChannel.findMany({ where: { business_id: businessId }, take: 2 });
      const channel = channels.length === 1 ? channels[0] : null;
      if (channel) await lockMessagingChannel(tx, businessId, channel.id);
      await requireCurrentOwner(tx, businessId, userId);
      const refreshed = channel ? await tx.messengerChannel.findFirst({ where: { id: channel.id, business_id: businessId } }) : null;
      if (parsed.data.mode === "AUTO" && (runtimeReadiness().length || channelReadinessReasons(refreshed, now).length)) throw new MessagingUnavailableError("Automatic replies require verified messaging setup.");
      if (parsed.data.mode !== "OFF" && (runtimeReadiness().filter(reason => reason !== "DELIVERY_DISABLED").length || channelReadinessReasons(refreshed, now).length)) throw new MessagingUnavailableError("Suggested replies require verified messaging setup.");
      await tx.customerMessagingSettings.upsert({ where: { business_id: businessId }, create: {
        business_id: businessId, mode: parsed.data.mode, consent: parsed.data.consent, ai_consent: parsed.data.aiConsent,
        consenting_user_id: parsed.data.consent && parsed.data.aiConsent ? userId : null,
        paused: parsed.data.paused, default_language: parsed.data.defaultLanguage, revision: 1,
      }, update: { mode: parsed.data.mode, consent: parsed.data.consent, ai_consent: parsed.data.aiConsent,
        consenting_user_id: parsed.data.consent && parsed.data.aiConsent ? userId : null,
        paused: parsed.data.paused, default_language: parsed.data.defaultLanguage, revision: { increment: 1 } } });
      if (parsed.data.mode === "OFF" || parsed.data.paused || !parsed.data.consent || !parsed.data.aiConsent) await tx.customerMessagingJob.updateMany({ where: {
        business_id: businessId, status: { in: ["PENDING", "CLAIMED", "SUGGESTED"] },
      }, data: { status: "CANCELLED", reason: "OWNER_PAUSED", lease_token: null, lease_expires_at: null, draft_encrypted: null } });
      await tx.auditLog.create({ data: { business_id: businessId, actor_id: userId, entity_type: "CustomerMessagingSettings",
        entity_id: businessId, action: "UPDATED", changes: parsed.data } });
    }, { timeout: 10_000, maxWait: 5_000 });
    return parsed.data;
  } catch (error) { if (error instanceof MessagingUnavailableError) throw error; throw new MessagingUnavailableError(); }
}

export async function setConversationTakeover(businessId: string, userId: string, id: string, takeover: boolean): Promise<boolean> {
  requireReadiness();
  try {
    return await prisma.$transaction(async tx => {
      const conversation = await tx.customerConversation.findFirst({ where: { id, business_id: businessId }, select: { channel_id: true } });
      if (!conversation) return false;
      await lockMessagingChannel(tx, businessId, conversation.channel_id);
      await lockMessagingConversation(tx, businessId, id);
      await requireCurrentOwner(tx, businessId, userId);
      const changed = await tx.customerConversation.updateMany({ where: { id, business_id: businessId }, data: { takeover, revision: { increment: 1 } } });
      await tx.customerMessagingJob.updateMany({ where: { business_id: businessId, conversation_id: id, status: { in: ["PENDING", "CLAIMED", "SUGGESTED"] } },
        data: { status: "CANCELLED", reason: "OWNER_TAKEOVER", lease_token: null, lease_expires_at: null, draft_encrypted: null } });
      await tx.auditLog.create({ data: { business_id: businessId, actor_id: userId, entity_type: "CustomerConversation",
        entity_id: id, action: takeover ? "TAKEOVER_ENABLED" : "TAKEOVER_RELEASED" } });
      return changed.count === 1;
    }, { timeout: 10_000, maxWait: 5_000 });
  } catch (error) { if (error instanceof MessagingUnavailableError) throw error; throw new MessagingUnavailableError(); }
}
