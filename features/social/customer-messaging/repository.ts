import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, MessengerChannel } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import type { ClaimedMessagingJob, MessagingContext, MessagingJobStore, MessagingReadinessReason } from "@/features/social/customer-messaging/contracts";
import { decryptMessagingValue, encryptMessagingValue, messagingFingerprint } from "@/features/social/customer-messaging/crypto";
import { getMessagingConfig, MAX_MESSAGING_ATTEMPTS, MESSAGING_DEBOUNCE_MS, MESSAGING_WINDOW_MS } from "@/features/social/customer-messaging/config";

export function messagingSchemaAvailable(db: PrismaClient = prisma) {
  return typeof db.messengerChannel?.findMany === "function"
    && typeof db.customerMessagingJob?.updateMany === "function"
    && typeof db.customerMessagingSettings?.findUnique === "function";
}

export function channelReadinessReasons(channel: MessengerChannel | null, now: Date): MessagingReadinessReason[] {
  if (!channel?.active || !channel.verified_at || channel.verified_at > now || !channel.token_expires_at || channel.token_expires_at <= now) return ["CHANNEL_UNVERIFIED"];
  const reasons: MessagingReadinessReason[] = [];
  if (!channel.permissions_verified_at || channel.permissions_verified_at > now || !channel.pages_messaging_granted
    || !channel.facebook_login_verified || !channel.app_review_verified || !channel.business_verified || !channel.page_message_task) reasons.push("PERMISSIONS_UNVERIFIED");
  if (!channel.webhook_subscribed || !channel.echoes_verified || !channel.metadata_echo_verified) reasons.push("WEBHOOK_UNCONFIGURED");
  if (!channel.pilot_approved) reasons.push("PILOT_UNVERIFIED");
  return reasons;
}

export async function lockMessagingChannel(tx: Prisma.TransactionClient, businessId: string, channelId: string) {
  await tx.$queryRaw`SELECT "id" FROM "MessengerChannel" WHERE "business_id" = ${businessId} AND "id" = ${channelId} FOR UPDATE`;
}

export async function lockMessagingConversation(tx: Prisma.TransactionClient, businessId: string, conversationId: string) {
  await tx.$queryRaw`SELECT "id" FROM "CustomerConversation" WHERE "business_id" = ${businessId} AND "id" = ${conversationId} FOR UPDATE`;
}

const leaseWhere = (job: ClaimedMessagingJob, now: Date) => ({
  id: job.id, business_id: job.businessId, conversation_id: job.conversationId,
  revision: job.revision, lease_token: job.leaseToken, lease_expires_at: { gt: now },
});

function validNow(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid messaging clock.");
}

export function createMessagingRepository(db: PrismaClient = prisma): MessagingJobStore {
  async function hasRetentionBacklog(now: Date) {
    const remaining = await Promise.all([
      db.customerMessage.findFirst({ where: { text_expires_at: { lte: now }, text_encrypted: { not: null } }, select: { id: true } }),
      db.customerMessagingJob.findFirst({ where: { text_expires_at: { lte: now }, draft_encrypted: { not: null } }, select: { id: true } }),
      db.customerConversation.findFirst({ where: { metadata_expires_at: { lte: now } }, select: { id: true } }),
      db.customerMessagingReceipt.findFirst({ where: { metadata_expires_at: { lte: now } }, select: { id: true } }),
      db.customerMessage.findFirst({ where: { metadata_expires_at: { lte: now } }, select: { id: true } }),
      db.customerMessagingJob.findFirst({ where: { metadata_expires_at: { lte: now } }, select: { id: true } }),
    ]);
    return remaining.some(Boolean);
  }
  async function load(tx: Prisma.TransactionClient, job: ClaimedMessagingJob, now: Date, sending = false): Promise<MessagingContext | null> {
    const config = getMessagingConfig();
    if (config.killSwitch || !config.workerEnabled || !config.intakeEnabled) return null;
    const stored = await tx.customerMessagingJob.findFirst({ where: {
      ...leaseWhere(job, now), status: sending ? "SENDING" : "CLAIMED",
      text_expires_at: { gt: now }, metadata_expires_at: { gt: now },
    } });
    if (!stored) return null;
    const conversation = await tx.customerConversation.findFirst({ where: {
      id: job.conversationId, business_id: job.businessId, metadata_expires_at: { gt: now },
    } });
    if (!conversation || conversation.revision !== job.revision || !conversation.latest_inbound_at
      || !conversation.latest_inbound_message_id || conversation.takeover || conversation.opted_out
      || conversation.latest_inbound_at.getTime() + MESSAGING_DEBOUNCE_MS > now.getTime()
      || conversation.latest_inbound_at.getTime() + MESSAGING_WINDOW_MS <= now.getTime()
      || (conversation.last_human_reply_at && conversation.last_human_reply_at >= conversation.latest_inbound_at)) return null;
    const channel = await tx.messengerChannel.findFirst({ where: { id: conversation.channel_id, business_id: job.businessId } });
    if (channelReadinessReasons(channel, now).length || !channel || channel.app_id !== config.appId || !channel.verified_at || !channel.permissions_verified_at) return null;
    const settings = await tx.customerMessagingSettings.findUnique({ where: { business_id: job.businessId } });
    if (!settings || settings.mode === "OFF" || settings.paused || !settings.consent || !settings.ai_consent) return null;
    if (!settings.consenting_user_id || !await tx.owner.findFirst({ where: {
      business_id: job.businessId, user_id: settings.consenting_user_id,
      user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" },
    }, select: { id: true } })) return null;
    if (await tx.customerMessagingSuppression.findUnique({ where: {
      channel_id_recipient_hash: { channel_id: channel.id, recipient_hash: conversation.recipient_hash },
    } })) return null;
    const business = await tx.business.findUnique({ where: { id: job.businessId }, select: { slug: true } });
    if (!business) return null;
    const messages = await tx.customerMessage.findMany({ where: {
      business_id: job.businessId, conversation_id: job.conversationId,
      text_expires_at: { gt: now }, text_encrypted: { not: null }, metadata_expires_at: { gt: now },
    }, orderBy: [{ occurred_at: "desc" }, { id: "desc" }], take: 10 });
    const scope = { businessId: job.businessId, conversationId: job.conversationId };
    return {
      job, businessId: job.businessId, businessSlug: business.slug,
      settings: { mode: settings.mode, consent: settings.consent, aiConsent: settings.ai_consent,
        paused: settings.paused, defaultLanguage: settings.default_language === "UNKNOWN" ? "FIL" : settings.default_language, revision: settings.revision },
      channel: { id: channel.id, appId: channel.app_id, pageId: channel.page_id, revision: channel.revision,
        verifiedAt: channel.verified_at, permissionsVerifiedAt: channel.permissions_verified_at,
        tokenEncrypted: channel.token_encrypted, tokenExpiresAt: channel.token_expires_at,
        metadataEchoVerified: channel.metadata_echo_verified,
        facebookLoginVerified: channel.facebook_login_verified,
        permissionsVerified: !!channel.permissions_verified_at && channel.pages_messaging_granted
          && channel.app_review_verified && channel.business_verified && channel.page_message_task,
        pilotVerified: channel.pilot_approved },
      conversation: { revision: conversation.revision, latestInboundAt: conversation.latest_inbound_at,
        latestInboundMessageId: conversation.latest_inbound_message_id, lastHumanReplyAt: conversation.last_human_reply_at,
        takeover: conversation.takeover, optedOut: conversation.opted_out,
        languagePreference: conversation.language_preference === "UNKNOWN" ? null : conversation.language_preference },
      messages: messages.reverse().flatMap(message => message.text_encrypted ? [{
        id: message.id,
        text: decryptMessagingValue(message.text_encrypted, { ...scope, purpose: "MESSAGE_TEXT" }),
        direction: message.direction, occurredAt: message.occurred_at,
      }] : []),
      recipientId: decryptMessagingValue(conversation.recipient_encrypted, { ...scope, purpose: "RECIPIENT" }),
      draft: stored.draft_encrypted && stored.draft_language ? {
        text: decryptMessagingValue(stored.draft_encrypted, { ...scope, purpose: "DRAFT_TEXT" }), language: stored.draft_language,
      } : null,
    };
  }

  async function locked<T>(job: ClaimedMessagingJob, callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return db.$transaction(async tx => {
      const conversation = await tx.customerConversation.findFirst({
        where: { id: job.conversationId, business_id: job.businessId }, select: { channel_id: true },
      });
      if (conversation) {
        await lockMessagingChannel(tx, job.businessId, conversation.channel_id);
        await lockMessagingConversation(tx, job.businessId, job.conversationId);
      }
      return callback(tx);
    }, { timeout: 10_000, maxWait: 5_000 });
  }

  return {
    async claimDue({ limit, now, leaseMs }) {
      validNow(now);
      if (!Number.isInteger(limit) || limit < 1 || limit > 25 || !Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 60_000) throw new Error("Invalid messaging batch.");
      const config = getMessagingConfig();
      if (config.killSwitch || !config.workerEnabled || !messagingSchemaAvailable(db)) return [];
      if (await hasRetentionBacklog(now)) throw new Error("Messaging retention backlog requires cleanup.");
      return db.$transaction(async tx => {
        // A crashed or expired HTTP send can have reached Meta. Never reclaim it.
        const expiredSends = await tx.customerMessagingJob.findMany({ where: {
          status: "SENDING", lease_expires_at: { lte: now },
        }, select: { id: true, business_id: true, conversation_id: true }, take: limit });
        for (const expired of expiredSends) {
          const conversation = await tx.customerConversation.findFirst({ where: {
            id: expired.conversation_id, business_id: expired.business_id,
          }, select: { channel_id: true } });
          if (!conversation) continue;
          await lockMessagingChannel(tx, expired.business_id, conversation.channel_id);
          await lockMessagingConversation(tx, expired.business_id, expired.conversation_id);
          const quarantined = await tx.customerMessagingJob.updateMany({ where: {
            id: expired.id, business_id: expired.business_id, status: "SENDING", lease_expires_at: { lte: now },
          }, data: { status: "UNKNOWN", reason: "SEND_LEASE_EXPIRED", lease_token: null, lease_expires_at: null } });
          if (quarantined.count) await tx.customerConversation.updateMany({
            where: { id: expired.conversation_id, business_id: expired.business_id },
            data: { takeover: true, revision: { increment: 1 } },
          });
        }
        const exhausted = await tx.customerMessagingJob.findMany({ where: {
          status: "CLAIMED", lease_expires_at: { lte: now }, attempts: { gte: MAX_MESSAGING_ATTEMPTS },
        }, select: { id: true }, take: limit });
        await tx.customerMessagingJob.updateMany({ where: {
          id: { in: exhausted.map(row => row.id) }, status: "CLAIMED", lease_expires_at: { lte: now },
        }, data: { status: "FAILED", reason: "ATTEMPTS_EXHAUSTED", lease_token: null, lease_expires_at: null, draft_encrypted: null } });
        const candidates = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "CustomerMessagingJob"
          WHERE ("status" = 'PENDING' OR ("status" = 'CLAIMED' AND "lease_expires_at" <= ${now}))
          AND "due_at" <= ${now} AND "attempts" < ${MAX_MESSAGING_ATTEMPTS}
          AND "text_expires_at" > ${now} AND "metadata_expires_at" > ${now}
          ORDER BY "due_at", "id" LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
        const claimed: ClaimedMessagingJob[] = [];
        for (const candidate of candidates) {
          const leaseToken = randomUUID();
          const row = await tx.customerMessagingJob.update({ where: { id: candidate.id }, data: {
            status: "CLAIMED", lease_token: leaseToken, lease_expires_at: new Date(now.getTime() + leaseMs), attempts: { increment: 1 },
          } });
          claimed.push({ id: row.id, businessId: row.business_id, conversationId: row.conversation_id,
            revision: row.revision, attempts: row.attempts, leaseToken, deliveryKey: row.delivery_key });
        }
        return claimed;
      });
    },
    async loadContext(job, now) {
      validNow(now);
      return locked(job, tx => load(tx, job, now));
    },
    async saveProposal(job, proposal, now, expected) {
      validNow(now);
      if (!proposal.text.trim() || proposal.text.length > 1200) return false;
      return locked(job, async tx => {
        const context = await load(tx, job, now);
        if (!context || context.settings.revision !== expected.settingsRevision || context.channel.revision !== expected.channelRevision) return false;
        const suggested = context.settings.mode === "SUGGEST";
        const result = await tx.customerMessagingJob.updateMany({ where: { ...leaseWhere(job, now), status: "CLAIMED" }, data: {
          draft_encrypted: encryptMessagingValue(proposal.text, { purpose: "DRAFT_TEXT", businessId: job.businessId, conversationId: job.conversationId }),
          draft_language: proposal.language, status: suggested ? "SUGGESTED" : "CLAIMED",
          ...(suggested ? { lease_token: null, lease_expires_at: null } : {}),
        } });
        if (result.count === 1 && proposal.language !== "UNKNOWN") await tx.customerConversation.updateMany({
          where: { id: job.conversationId, business_id: job.businessId, revision: job.revision },
          data: { language_preference: proposal.language },
        });
        return result.count === 1;
      });
    },
    async markSending(job, now, expected) {
      validNow(now);
      const config = getMessagingConfig();
      if (!config.deliveryEnabled || config.killSwitch) return null;
      return locked(job, async tx => {
        const context = await load(tx, job, now);
        if (!context || context.settings.mode !== "AUTO" || !context.draft
          || context.settings.revision !== expected.settingsRevision || context.channel.revision !== expected.channelRevision) return null;
        const result = await tx.customerMessagingJob.updateMany({ where: { ...leaseWhere(job, now), status: "CLAIMED" }, data: { status: "SENDING" } });
        return result.count === 1 ? context : null;
      });
    },
    async markOutcome(job, outcome, now) {
      validNow(now);
      return locked(job, async tx => {
        const row = await tx.customerMessagingJob.findFirst({ where: {
          id: job.id, business_id: job.businessId, conversation_id: job.conversationId,
          revision: job.revision, lease_token: job.leaseToken, status: "SENDING",
        } });
        if (!row) {
          // An authenticated own-app echo may arrive before the Send API POST
          // resolves. Its durable observed-send proof wins over a lost/late ACK;
          // no caller may downgrade that terminal proof or schedule another send.
          return !!await tx.customerMessagingJob.findFirst({ where: {
            id: job.id, business_id: job.businessId, conversation_id: job.conversationId,
            revision: job.revision, delivery_key: job.deliveryKey, status: "CONFIRMED",
            reason: "OWN_ECHO_OBSERVED", provider_message_hash: { not: null },
          }, select: { id: true } });
        }
        const retry = outcome.status === "FAILED" && outcome.retryable && row.attempts < MAX_MESSAGING_ATTEMPTS && row.text_expires_at > now;
        const conversation = await tx.customerConversation.findFirst({ where: { id: job.conversationId, business_id: job.businessId }, select: { channel: { select: { app_id: true, page_id: true } } } });
        const result = await tx.customerMessagingJob.updateMany({ where: {
          id: job.id, business_id: job.businessId, lease_token: job.leaseToken, status: "SENDING",
        }, data: {
          status: retry ? "PENDING" : outcome.status,
          lease_token: null, lease_expires_at: null,
          reason: outcome.status === "UNKNOWN" ? "SEND_OUTCOME_UNKNOWN" : null,
          ...(retry ? { due_at: new Date(now.getTime() + Math.min(60_000, row.attempts * 15_000)) } : {}),
          provider_message_hash: outcome.status === "CONFIRMED" && outcome.providerMessageId && conversation
            ? messagingFingerprint("message", conversation.channel.app_id, conversation.channel.page_id, outcome.providerMessageId) : null,
        } });
        if (result.count === 1 && outcome.status === "UNKNOWN") await tx.customerConversation.updateMany({
          where: { id: job.conversationId, business_id: job.businessId },
          data: { takeover: true, revision: { increment: 1 } },
        });
        return result.count === 1;
      });
    },
    async cancel(job, reason, now) {
      validNow(now);
      const safeReason = /^[A-Z_]{1,60}$/.test(reason) ? reason : "GUARD_REJECTED";
      const result = await db.customerMessagingJob.updateMany({ where: { ...leaseWhere(job, now), status: "CLAIMED" },
        data: { status: "CANCELLED", reason: safeReason, lease_token: null, lease_expires_at: null, draft_encrypted: null } });
      return result.count === 1;
    },
    async recordOptOut(job, now) {
      validNow(now);
      return locked(job, async tx => {
        const row = await tx.customerMessagingJob.findFirst({ where: { ...leaseWhere(job, now), status: "CLAIMED" } });
        const conversation = await tx.customerConversation.findFirst({ where: {
          id: job.conversationId, business_id: job.businessId, revision: job.revision,
        } });
        if (!row || !conversation) return false;
        await tx.customerMessagingSuppression.upsert({ where: {
          channel_id_recipient_hash: { channel_id: conversation.channel_id, recipient_hash: conversation.recipient_hash },
        }, create: { business_id: job.businessId, channel_id: conversation.channel_id,
          recipient_hash: conversation.recipient_hash }, update: {} });
        await tx.customerConversation.updateMany({ where: {
          id: job.conversationId, business_id: job.businessId, revision: job.revision,
        }, data: { opted_out: true, revision: { increment: 1 } } });
        await tx.customerMessagingJob.updateMany({ where: {
          business_id: job.businessId, conversation_id: job.conversationId,
          status: { in: ["PENDING", "CLAIMED", "SUGGESTED"] },
        }, data: { status: "CANCELLED", reason: "OPT_OUT", lease_token: null, lease_expires_at: null, draft_encrypted: null } });
        return true;
      });
    },
    async cleanupRetention(now, limit) {
      validNow(now);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid retention batch.");
      // Bound each cleanup category separately; retained content cannot be copied
      // into jobs/previews. Accessors additionally refuse expired content.
      const result = await db.$transaction(async tx => {
        const messages = await tx.customerMessage.findMany({ where: { text_expires_at: { lte: now }, text_encrypted: { not: null } }, select: { id: true }, take: limit });
        const drafts = await tx.customerMessagingJob.findMany({ where: { text_expires_at: { lte: now }, draft_encrypted: { not: null } }, select: { id: true }, take: limit });
        const purgedMessages = await tx.customerMessage.updateMany({ where: { id: { in: messages.map(row => row.id) } }, data: { text_encrypted: null } });
        const purgedDrafts = await tx.customerMessagingJob.updateMany({ where: { id: { in: drafts.map(row => row.id) } }, data: { draft_encrypted: null, draft_language: null } });
        let metadataPurged = 0;
        const conversations = await tx.customerConversation.findMany({ where: { metadata_expires_at: { lte: now } }, select: { id: true }, take: limit });
        metadataPurged += (await tx.customerConversation.deleteMany({ where: { id: { in: conversations.map(row => row.id) } } })).count;
        const receipts = await tx.customerMessagingReceipt.findMany({ where: { metadata_expires_at: { lte: now } }, select: { id: true }, take: limit });
        metadataPurged += (await tx.customerMessagingReceipt.deleteMany({ where: { id: { in: receipts.map(row => row.id) } } })).count;
        const oldMessages = await tx.customerMessage.findMany({ where: { metadata_expires_at: { lte: now } }, select: { id: true }, take: limit });
        metadataPurged += (await tx.customerMessage.deleteMany({ where: { id: { in: oldMessages.map(row => row.id) } } })).count;
        const jobs = await tx.customerMessagingJob.findMany({ where: { metadata_expires_at: { lte: now } }, select: { id: true }, take: limit });
        metadataPurged += (await tx.customerMessagingJob.deleteMany({ where: { id: { in: jobs.map(row => row.id) } } })).count;
        return { textPurged: purgedMessages.count + purgedDrafts.count, metadataPurged };
      });
      if (await hasRetentionBacklog(now)) throw new Error("Messaging retention backlog requires cleanup.");
      return result;
    },
  };
}
