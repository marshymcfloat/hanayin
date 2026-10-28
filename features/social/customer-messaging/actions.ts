"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwnerInboxAccess } from "@/features/social/customer-messaging/access";
import { setConversationTakeover, updateSettings } from "@/features/social/customer-messaging/inbox-service";
import { messagingSettingsSchema } from "@/features/social/customer-messaging/schemas";
import { businessSlugSchema } from "@/lib/validation/business-slug";

const settingsInputSchema = z.object({ businessSlug: businessSlugSchema, settings: messagingSettingsSchema }).strict();
const takeoverInputSchema = z.object({
  businessSlug: businessSlugSchema,
  conversationId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  takeover: z.boolean(),
}).strict();

export async function updateOwnerInboxSettingsAction(input: unknown) {
  const parsed = settingsInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Review the inbox settings and privacy consent." };
  const { businessSlug, settings } = parsed.data;
  const access = await requireOwnerInboxAccess(businessSlug, settings.mode !== "OFF" || settings.aiConsent);
  if (!access.success) return access;
  if (settings.mode !== "OFF" && !settings.aiConsent) {
    return { success: false as const, error: "External AI processing consent is required for reply suggestions and automation." };
  }
  try {
    const data = await updateSettings(access.context.businessId, access.context.userId, settings);
    revalidatePath(`/app/${access.context.businessSlug}/inbox`);
    return { success: true as const, data };
  } catch {
    return { success: false as const, error: "Settings could not be saved. Check inbox readiness and retry." };
  }
}

export async function setOwnerInboxTakeoverAction(input: unknown) {
  const parsed = takeoverInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Invalid conversation request." };
  const access = await requireOwnerInboxAccess(parsed.data.businessSlug);
  if (!access.success) return access;
  try {
    const updated = await setConversationTakeover(access.context.businessId, access.context.userId, parsed.data.conversationId, parsed.data.takeover);
    if (!updated) return { success: false as const, error: "Conversation is unavailable. Refresh the inbox." };
    revalidatePath(`/app/${access.context.businessSlug}/inbox`);
    return { success: true as const };
  } catch {
    return { success: false as const, error: "Conversation control could not be saved. Please retry." };
  }
}
