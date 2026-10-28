import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { inspectAssistantMessage } from "@/features/social/conversation-assistant/privacy";
import { messengerEnvelopeSchema, type MessengerEnvelope } from "@/features/social/customer-messaging/schemas";
import { decryptMessagingValue, encryptMessagingValue, messagingFingerprint, isMessagingEncryptionAvailable, type MessagingEncryptionScope } from "@/features/social/customer-messaging/crypto";
import { channelReadinessReasons, lockMessagingChannel, lockMessagingConversation, messagingSchemaAvailable } from "@/features/social/customer-messaging/repository";
import { getMessagingConfig, MAX_MESSENGER_BODY_BYTES, MAX_MESSENGER_EVENTS, MESSAGING_DEBOUNCE_MS,
  MESSAGING_TEXT_RETENTION_MS, MESSAGING_METADATA_RETENTION_MS } from "@/features/social/customer-messaging/config";

export class MessagingWebhookError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function ownMessengerEchoDeliveryKey(message: {
  is_echo?: boolean; app_id?: string; metadata?: string;
}, appId: string): string | null {
  if (message.is_echo !== true || !appId || message.app_id !== appId) return null;
  if (message.metadata?.length !== 39) return null;
  const matched = /^sf:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(message.metadata ?? "");
  return matched?.[1] ?? null;
}

export function matchesMessengerEchoContent(messageText: string | undefined, proof: {
  providerMessageHash: string | null; draftEncrypted: string | null; textExpiresAt: Date;
}, messageHash: string, now: Date, scope: MessagingEncryptionScope): boolean {
  if (proof.providerMessageHash && proof.providerMessageHash !== messageHash) return false;
  if (proof.draftEncrypted && proof.textExpiresAt > now) {
    if (messageText === undefined) return false;
    try { return decryptMessagingValue(proof.draftEncrypted, scope) === messageText; } catch { return false; }
  }
  // Expired text is never decrypted/restored. A previously recorded provider MID
  // remains sufficient evidence only together with the typed own-app UUID proof.
  return proof.providerMessageHash === messageHash;
}

export function verifyMessengerSignature(raw: Uint8Array, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

export async function readBoundedMessengerBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_MESSENGER_BODY_BYTES)) throw new MessagingWebhookError(413, "Webhook body exceeds limit.");
  if (!request.body) throw new MessagingWebhookError(400, "Invalid webhook body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_MESSENGER_BODY_BYTES) { await reader.cancel(); throw new MessagingWebhookError(413, "Webhook body exceeds limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}

function boundedEventCount(value: unknown): boolean {
  if (!value || typeof value !== "object" || !("entry" in value) || !Array.isArray(value.entry) || value.entry.length > 20) return false;
  let count = 0;
  for (const entry of value.entry) {
    if (!entry || typeof entry !== "object" || !("messaging" in entry) || !Array.isArray(entry.messaging)) return false;
    count += entry.messaging.length;
    if (count > MAX_MESSENGER_EVENTS) return false;
  }
  return true;
}

export function parseVerifiedMessengerBody(raw: Uint8Array): MessengerEnvelope {
  let value: unknown;
  try { value = JSON.parse(Buffer.from(raw).toString("utf8")); } catch { throw new MessagingWebhookError(400, "Invalid webhook body."); }
  if (!boundedEventCount(value)) throw new MessagingWebhookError(400, "Webhook event limit exceeded.");
  const parsed = messengerEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new MessagingWebhookError(400, "Invalid webhook events.");
  return parsed.data;
}

export async function ingestMessengerEnvelope(envelope: MessengerEnvelope, now: Date, db: PrismaClient = prisma) {
  const config = getMessagingConfig();
  if (config.killSwitch || !config.intakeEnabled || !config.appId || !isMessagingEncryptionAvailable() || !messagingSchemaAvailable(db)) throw new MessagingWebhookError(503, "Messaging intake unavailable.");
  if (!Number.isFinite(now.getTime())) throw new MessagingWebhookError(400, "Invalid messaging clock.");
  let accepted = 0;
  for (const entry of envelope.entry) {
    const channels = await db.messengerChannel.findMany({ where: { app_id: config.appId, page_id: entry.id, active: true }, take: 2 });
    if (channels.length !== 1 || channelReadinessReasons(channels[0], now).length) continue;
    const selected = channels[0];
    for (const event of entry.messaging) {
      if (!event.message || event.timestamp > now.getTime() || event.timestamp < now.getTime() - MESSAGING_METADATA_RETENTION_MS) continue;
      const outbound = event.message.is_echo === true || event.sender.id === entry.id;
      if (!outbound && event.recipient.id !== entry.id) continue;
      if (outbound && event.sender.id !== entry.id) continue;
      const recipient = outbound ? event.recipient.id : event.sender.id;
      if (recipient === entry.id) continue;
      const occurredAt = new Date(event.timestamp);
      const textExpiresAt = new Date(event.timestamp + MESSAGING_TEXT_RETENTION_MS);
      const metadataExpiresAt = new Date(event.timestamp + MESSAGING_METADATA_RETENTION_MS);
      const recipientHash = messagingFingerprint("recipient", selected.business_id, selected.id, recipient);
      const messageHash = messagingFingerprint("message", config.appId, entry.id, event.message.mid);
      const eventHash = messagingFingerprint("event", config.appId, entry.id, event.message.mid);
      const screened = inspectAssistantMessage(event.message.text ?? "");
      const optOut = !outbound && screened.reason === "OPT_OUT";
      const result = await db.$transaction(async tx => {
        await lockMessagingChannel(tx, selected.business_id, selected.id);
        const channel = await tx.messengerChannel.findFirst({ where: { id: selected.id, business_id: selected.business_id, app_id: config.appId, page_id: entry.id } });
        if (!channel || channelReadinessReasons(channel, now).length) return false;
        if (optOut) await tx.customerMessagingSuppression.upsert({ where: {
          channel_id_recipient_hash: { channel_id: channel.id, recipient_hash: recipientHash },
        }, create: { business_id: channel.business_id, channel_id: channel.id, recipient_hash: recipientHash }, update: {} });
        if (optOut) {
          const existing = await tx.customerConversation.findUnique({ where: {
            channel_id_recipient_hash: { channel_id: channel.id, recipient_hash: recipientHash },
          }, select: { id: true } });
          if (existing) {
            await tx.customerConversation.updateMany({ where: { id: existing.id, business_id: channel.business_id, opted_out: false },
              data: { opted_out: true, revision: { increment: 1 } } });
            await tx.customerMessagingJob.updateMany({ where: {
              business_id: channel.business_id, conversation_id: existing.id, status: { in: ["PENDING", "CLAIMED", "SUGGESTED"] },
            }, data: { status: "CANCELLED", reason: "OPT_OUT", lease_token: null, lease_expires_at: null, draft_encrypted: null } });
          }
        }
        const settings = await tx.customerMessagingSettings.findUnique({ where: { business_id: channel.business_id } });
        if (!settings?.consent || settings.mode === "OFF") return false;
        if (!settings.consenting_user_id || !await tx.owner.findFirst({ where: {
          business_id: channel.business_id, user_id: settings.consenting_user_id,
          user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" },
        }, select: { id: true } })) return false;
        const receipt = await tx.customerMessagingReceipt.createMany({ data: {
          business_id: channel.business_id, channel_id: channel.id, event_hash: eventHash,
          occurred_at: occurredAt, metadata_expires_at: metadataExpiresAt,
        }, skipDuplicates: true });
        if (!receipt.count) return false;
        const suppression = await tx.customerMessagingSuppression.findUnique({ where: {
          channel_id_recipient_hash: { channel_id: channel.id, recipient_hash: recipientHash },
        } });
        const conversationId = randomUUID();
        const conversation = await tx.customerConversation.upsert({ where: {
          channel_id_recipient_hash: { channel_id: channel.id, recipient_hash: recipientHash },
        }, create: {
          id: conversationId, business_id: channel.business_id, channel_id: channel.id, recipient_hash: recipientHash,
          recipient_encrypted: encryptMessagingValue(recipient, { purpose: "RECIPIENT", businessId: channel.business_id, conversationId }),
          last_activity_at: occurredAt, metadata_expires_at: metadataExpiresAt, opted_out: !!suppression,
        }, update: {} });
        await lockMessagingConversation(tx, channel.business_id, conversation.id);
        const inserted = await tx.customerMessage.createMany({ data: {
          business_id: channel.business_id, conversation_id: conversation.id, provider_message_hash: messageHash,
          direction: outbound ? "OUTBOUND" : "INBOUND",
          text_encrypted: event.message?.text && textExpiresAt > now ? encryptMessagingValue(screened.redacted.slice(0, 1000), {
            purpose: "MESSAGE_TEXT", businessId: channel.business_id, conversationId: conversation.id,
          }) : null,
          text_expires_at: textExpiresAt, occurred_at: occurredAt, metadata_expires_at: metadataExpiresAt,
        }, skipDuplicates: true });
        if (!inserted.count) return false;
        const message = await tx.customerMessage.findUniqueOrThrow({ where: { provider_message_hash: messageHash }, select: { id: true } });
        const echoDeliveryKey = outbound && channel.metadata_echo_verified && event.message
          ? ownMessengerEchoDeliveryKey(event.message, channel.app_id) : null;
        const echoJob = echoDeliveryKey ? await tx.customerMessagingJob.findFirst({ where: {
          business_id: channel.business_id, conversation_id: conversation.id, delivery_key: echoDeliveryKey,
          status: { in: ["SENDING", "UNKNOWN", "CONFIRMED"] }, metadata_expires_at: { gt: now },
        } }) : null;
        const knownAssistantEcho = !!echoJob && matchesMessengerEchoContent(event.message?.text, {
          providerMessageHash: echoJob.provider_message_hash, draftEncrypted: echoJob.draft_encrypted,
          textExpiresAt: echoJob.text_expires_at,
        }, messageHash, now, { purpose: "DRAFT_TEXT", businessId: channel.business_id, conversationId: conversation.id });
        const resolvedUnknownQuarantine = knownAssistantEcho && echoJob?.status === "UNKNOWN"
          && (echoJob.reason === "SEND_OUTCOME_UNKNOWN" || echoJob.reason === "SEND_LEASE_EXPIRED")
          && conversation.revision === echoJob.revision + 1 && conversation.takeover && !conversation.opted_out
          && (!conversation.last_human_reply_at || !!conversation.latest_inbound_at && conversation.last_human_reply_at < conversation.latest_inbound_at);
        if (knownAssistantEcho && echoJob) await tx.customerMessagingJob.updateMany({ where: {
          id: echoJob.id, business_id: channel.business_id, conversation_id: conversation.id,
          delivery_key: echoDeliveryKey ?? "", status: { in: ["SENDING", "UNKNOWN", "CONFIRMED"] },
        }, data: { status: "CONFIRMED", reason: "OWN_ECHO_OBSERVED", provider_message_hash: messageHash,
          lease_token: null, lease_expires_at: null } });
        const human = outbound && !knownAssistantEcho;
        const newerInbound = !outbound && (!conversation.latest_inbound_at || occurredAt >= conversation.latest_inbound_at);
        const handoff = !outbound && !screened.safe && screened.reason !== "OPT_OUT";
        const advanceRevision = newerInbound || human || optOut || handoff || resolvedUnknownQuarantine;
        await tx.customerConversation.update({ where: { business_id_id: { business_id: channel.business_id, id: conversation.id } }, data: {
          last_activity_at: occurredAt > conversation.last_activity_at ? occurredAt : conversation.last_activity_at,
          metadata_expires_at: metadataExpiresAt > conversation.metadata_expires_at ? metadataExpiresAt : conversation.metadata_expires_at,
          ...(advanceRevision ? { revision: { increment: 1 } } : {}),
          ...(newerInbound ? { latest_inbound_at: occurredAt, latest_inbound_message_id: message.id } : {}),
          ...(human ? { last_human_reply_at: !conversation.last_human_reply_at || occurredAt > conversation.last_human_reply_at ? occurredAt : conversation.last_human_reply_at, takeover: true } : {}),
          ...(handoff ? { takeover: true } : {}), ...(suppression ? { opted_out: true } : {}),
          ...(resolvedUnknownQuarantine ? { takeover: false } : {}),
        } });
        if (advanceRevision) await tx.customerMessagingJob.updateMany({ where: {
          business_id: channel.business_id, conversation_id: conversation.id, status: { in: ["PENDING", "CLAIMED", "SUGGESTED"] },
        }, data: { status: "CANCELLED", reason: optOut ? "OPT_OUT" : human ? "HUMAN_REPLY" : "SUPERSEDED", lease_token: null, lease_expires_at: null, draft_encrypted: null } });
        if (newerInbound && screened.safe && !suppression && !conversation.takeover && !settings.paused && settings.ai_consent && textExpiresAt > now) await tx.customerMessagingJob.create({ data: {
          business_id: channel.business_id, conversation_id: conversation.id, revision: conversation.revision + 1,
          due_at: new Date(event.timestamp + MESSAGING_DEBOUNCE_MS), delivery_key: randomUUID(),
          origin_event_at: occurredAt,
          text_expires_at: textExpiresAt, metadata_expires_at: metadataExpiresAt,
        } });
        return true;
      }, { timeout: 10_000, maxWait: 5_000 });
      if (result) accepted += 1;
    }
  }
  return { accepted };
}

export async function receiveMessengerWebhook(request: Request) {
  const config = getMessagingConfig();
  if (config.killSwitch || !config.intakeEnabled || !config.appSecret || !config.verifyToken
    || config.appSecret === config.verifyToken) throw new MessagingWebhookError(503, "Messaging intake unavailable.");
  const raw = await readBoundedMessengerBody(request);
  if (!verifyMessengerSignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) throw new MessagingWebhookError(401, "Invalid webhook signature.");
  return ingestMessengerEnvelope(parseVerifiedMessengerBody(raw), new Date());
}

export function verifyMessengerChallenge(request: Request): string {
  const config = getMessagingConfig();
  if (config.killSwitch || !config.intakeEnabled || !config.verifyToken || !config.appSecret || config.verifyToken === config.appSecret) throw new MessagingWebhookError(503, "Messaging verification unavailable.");
  const query = new URL(request.url).searchParams;
  const supplied = query.get("hub.verify_token") ?? "";
  const expected = Buffer.from(config.verifyToken);
  const actual = Buffer.from(supplied);
  const challenge = query.get("hub.challenge");
  if (query.get("hub.mode") !== "subscribe" || !challenge || challenge.length > 256 || expected.length !== actual.length
    || !timingSafeEqual(expected, actual)) throw new MessagingWebhookError(403, "Invalid webhook verification.");
  return challenge;
}
