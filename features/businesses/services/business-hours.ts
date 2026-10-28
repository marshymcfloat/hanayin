import "server-only";
import { ownerPermissionMembershipWhere, type OwnerActorContext } from "@/lib/auth/owner-access";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/services/audit";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";
import type { BusinessHourInput } from "@/features/businesses/types/business-hours";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { hoursSignature } from "@/features/businesses/business-hours-display";

export async function saveBusinessHours(context: OwnerActorContext, hours: BusinessHourInput[], options?: { expectedHours: BusinessHourInput[]; resetCategories: string[] }): Promise<
  { success: true } | { success: false; error: string }
> {
  if (context.actorType !== "OWNER") return { success: false, error: "Forbidden" };
  const uniqueHours = Array.from(new Map(hours.map(hour => [`${hour.day_of_week}:${hour.category}`, hour])).values());
  try {
    await prisma.$transaction(async tx => {
      if (options) {
        const current = await tx.business.findFirst({
          where: { id: context.businessId, slug: context.businessSlug, owners: { some: ownerPermissionMembershipWhere(context, OwnerPermission.SETTINGS_MANAGE) } },
          select: { business_hours: { select: { category: true, day_of_week: true, open_time: true, close_time: true, is_closed: true } } },
        });
        if (!current) throw new Error("HOURS_FORBIDDEN");
        if (hoursSignature(current.business_hours) !== hoursSignature(options.expectedHours)) throw new Error("HOURS_CHANGED");
        if (options.resetCategories.length) await tx.businessHours.deleteMany({
          where: { business_id: context.businessId, category: { in: options.resetCategories } },
        });
      }
      await tx.business.update({
        where: {
          id: context.businessId, slug: context.businessSlug,
          owners: { some: ownerPermissionMembershipWhere(context, OwnerPermission.SETTINGS_MANAGE) },
        },
        data: { business_hours: { upsert: uniqueHours.map(hour => ({
          where: { business_id_day_of_week_category: {
            business_id: context.businessId, day_of_week: hour.day_of_week, category: hour.category,
          } },
          update: { open_time: hour.open_time, close_time: hour.close_time, is_closed: hour.is_closed },
          create: { ...hour },
        })) } },
        select: { id: true },
      });
      await logAudit(tx, {
        entityType: "Business", entityId: context.businessId, action: "UPDATED",
        actorId: context.userId, businessId: context.businessId,
        changes: { after: { hours: uniqueHours, resetCategories: options?.resetCategories ?? [], mode: "BUSINESS_HOURS_CHANGED" } },
      });
    }, { maxWait: 5000, timeout: 15000, ...(options ? { isolationLevel: "Serializable" as const } : {}) });
  } catch (error) {
    if ((error instanceof Error && error.message === "HOURS_CHANGED") || (typeof error === "object" && error !== null && "code" in error && error.code === "P2034")) return { success: false, error: "Hours changed since you opened this page. Refresh, review your changes, and try again." };
    if (error instanceof Error && error.message === "HOURS_FORBIDDEN") return { success: false, error: "Forbidden" };
    const denied = typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
    return { success: false, error: denied ? "Forbidden" : "Unable to update business hours." };
  }

  try {
    await detectAndEmitFutureBookingConflicts({ businessId: context.businessId, trigger: "BUSINESS_HOURS_UPDATED" });
  } catch {
    logger.warn("[BookingConflicts] Failed after business-hours update", {
      businessId: context.businessId, businessSlug: context.businessSlug,
    });
  }
  return { success: true };
}
