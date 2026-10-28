"use server";

import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { getOwnerNotificationHistory } from "@/features/notifications/queries/history";
import { notificationHistorySchema } from "@/features/notifications/schemas";
import type { NotificationRecord as NotificationDto } from "@/features/notifications/types";

export type NotificationRecord = NotificationDto;

export async function getNotificationHistoryAction(
  businessSlug: string,
  options: { page?: number; eventType?: string } = {},
) {
  const validation = notificationHistorySchema.safeParse({ businessSlug, options });
  if (!validation.success) return { success: false as const, error: "Invalid input" };

  try {
    const auth = await requireOwnerTenantWriteAccess(validation.data.businessSlug);
    if (!auth.success) return { success: false as const, error: "Unauthorized" };
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success || context.actorType !== "OWNER") {
      return { success: false as const, error: "Unauthorized" };
    }
    return await getOwnerNotificationHistory(context, validation.data.options);
  } catch {
    return { success: false as const, error: "Unable to load notification history." };
  }
}
