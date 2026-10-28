import "server-only";

import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import { getTenantAccessState } from "@/features/billing/subscription-service";
import { ASSISTANT_DELAY_MS, ASSISTANT_WINDOW_MS } from "@/features/social/conversation-assistant/policy";
import { getAssistantAvailability, getAssistantPublicFacts } from "@/features/social/conversation-assistant/facts";
import { isAssistantJevConfigured } from "@/features/social/conversation-assistant/jev";
import { getMessagingConfig } from "@/features/social/customer-messaging/config";
import { decryptMessagingValue, isMessagingEncryptionAvailable } from "@/features/social/customer-messaging/crypto";
import { createMessagingRepository } from "@/features/social/customer-messaging/repository";
import { takeMessagingModelBudget } from "@/features/social/customer-messaging/worker/cost-budget";
import { sendMessengerReply } from "@/features/social/customer-messaging/worker/meta-send";
import { planMessagingReply } from "@/features/social/customer-messaging/worker/planner";
import { processMessagingBatch, recheckMessagingModelSubmit, type MessagingWorkerDependencies } from "@/features/social/customer-messaging/worker/processor";

/** Public runtime entry point. Missing encryption/schema/config fails closed. */
export async function runMessagingWorker() {
  const dependencies: MessagingWorkerDependencies = {
    store: createMessagingRepository(), now: () => new Date(),
    workerEnabled: () => getMessagingConfig().workerEnabled && isMessagingEncryptionAvailable(),
    deliveryEnabled: () => getMessagingConfig().deliveryEnabled,
    killSwitch: () => getMessagingConfig().killSwitch,
    modelAvailable: () => getMessagingConfig().aiEnabled && isAssistantJevConfigured(),
    takeModelBudget: businessId => takeMessagingModelBudget(businessId),
    hasEntitlements: async context => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([Promise.all([
          getBusinessEntitlementsBySlug(context.businessSlug), getTenantAccessState(context.businessSlug),
        ]).then(([entitlements, access]) => {
          const now = Date.now();
          if (!access.exists || access.businessId !== context.businessId || access.readOnly || !access.subscription) return false;
          const subscription = access.subscription;
          const current = subscription.status === "ACTIVE" && subscription.current_period_end.getTime() > now
            || subscription.status === "TRIALING" && Boolean(subscription.trial_ends_at && subscription.trial_ends_at.getTime() > now)
            || subscription.status === "GRACE_PERIOD" && Boolean(subscription.grace_ends_at && subscription.grace_ends_at.getTime() > now);
          return current && entitlements.social && entitlements.ai;
        }), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 3_000); })]);
      } finally { if (timer) clearTimeout(timer); }
    },
    plan: (context, establishedLanguage, now) => {
      const inbound = context.messages.filter(message => message.direction === "INBOUND");
      const latest = inbound.find(message => message.id === context.conversation.latestInboundMessageId);
      return planMessagingReply({ tenant: { businessId: context.businessId, businessSlug: context.businessSlug },
        message: latest?.text ?? "", establishedLanguage, messageAt: context.conversation.latestInboundAt,
        recentMessages: inbound.filter(message => message.id !== latest?.id && message.occurredAt <= context.conversation.latestInboundAt).slice(-3).map(message => message.text), now },
      { getFacts: getAssistantPublicFacts, getAvailability: getAssistantAvailability, now: () => new Date(),
        trustedPublicBaseUrl: getMessagingConfig().publicBaseUrl,
        beforeModelSubmit: () => recheckMessagingModelSubmit(context, dependencies) });
    },
    send: (context, text, deliveryKey) => {
      const config = getMessagingConfig();
      const now = Date.now();
      const age = now - context.conversation.latestInboundAt.getTime();
      if (!config.deliveryEnabled || !config.workerEnabled || config.killSwitch || !config.aiEnabled || context.channel.appId !== config.appId) {
        return Promise.resolve({ status: "FAILED" as const, retryable: false as const });
      }
      if (age < ASSISTANT_DELAY_MS || age >= ASSISTANT_WINDOW_MS || !context.channel.tokenExpiresAt
        || context.channel.tokenExpiresAt.getTime() <= now + 8_000) return Promise.resolve({ status: "FAILED" as const, retryable: false as const });
      const pageAccessToken = decryptMessagingValue(context.channel.tokenEncrypted,
        { purpose: "CHANNEL_TOKEN", businessId: context.businessId, conversationId: context.channel.id });
      return sendMessengerReply({ text, deliveryKey, target: {
        pageId: context.channel.pageId, recipientId: context.recipientId, pageAccessToken,
        graphVersion: config.graphApiVersion, facebookLoginVerified: context.channel.facebookLoginVerified,
        permissionsVerified: context.channel.permissionsVerified, pilotVerified: context.channel.pilotVerified,
        metadataEchoVerified: context.channel.metadataEchoVerified,
      } });
    },
  };
  return processMessagingBatch(dependencies);
}
