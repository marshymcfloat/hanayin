"use server";

import { requireOwnerPermission } from "@/lib/auth/owner-access";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";
import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import { getAssistantPublicFacts } from "@/features/social/conversation-assistant/facts";
import { assistantPublicFactsSchema } from "@/features/social/conversation-assistant/schemas";
import {
  isOwnerAssistantAiPreviewAvailable, ownerAssistantContextSchema,
  ownerAssistantPreviewSchema, previewOwnerAssistantReply,
} from "@/features/social/conversation-assistant/preview-service";

export async function getOwnerAssistantLabContextAction(input: unknown) {
  const parsed = ownerAssistantContextSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Invalid assistant preview." };
  try {
    const access = await requireOwnerPermission(parsed.data.businessSlug, OwnerPermission.SETTINGS_MANAGE);
    if (!access.success) return access;
    const entitlements = await getBusinessEntitlementsBySlug(access.context.businessSlug);
    if (!entitlements.social) return { success: false as const, error: "Social assistant previews require a Pro plan." };
    const tenant = { businessId: access.context.businessId, businessSlug: access.context.businessSlug };
    const facts = assistantPublicFactsSchema.parse(await getAssistantPublicFacts(tenant));
    return {
      success: true as const,
      data: { facts, aiPreviewAvailable: entitlements.ai && isOwnerAssistantAiPreviewAvailable(), liveEnabled: false as const },
    };
  } catch {
    return { success: false as const, error: "Assistant preview facts are unavailable. Please retry." };
  }
}

export async function simulateOwnerAssistantReplyAction(input: unknown) {
  const parsed = ownerAssistantPreviewSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Invalid assistant preview." };
  try {
    const access = await requireOwnerPermission(parsed.data.businessSlug, OwnerPermission.SETTINGS_MANAGE);
    if (!access.success) return access;
    const entitlements = await getBusinessEntitlementsBySlug(access.context.businessSlug);
    if (!entitlements.social || (parsed.data.mode === "AI" && !entitlements.ai)) {
      return { success: false as const, error: "This assistant preview is not included in your plan." };
    }
    const tenant = { businessId: access.context.businessId, businessSlug: access.context.businessSlug };
    const data = await previewOwnerAssistantReply(tenant, access.context.userId, parsed.data, entitlements.ai);
    return { success: true as const, data };
  } catch {
    return { success: false as const, error: "Assistant preview could not run. Check the service/date and retry." };
  }
}
