import "server-only";
import { ownerPermissionMembershipWhere, type OwnerActorContext } from "@/lib/auth/owner-access";
import { logAudit } from "@/lib/services/audit";
import { normalizeBookingPolicy, type BookingPolicy } from "@/lib/types/booking-policy";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

class SettingsAccessDenied extends Error {}

export async function saveBookingPolicy(context: OwnerActorContext, input: Partial<BookingPolicy>): Promise<
  { success: true } | { success: false; error: string }
> {
  if (context.actorType !== "OWNER") return { success: false, error: "Forbidden" };
  const normalized = normalizeBookingPolicy(input);
  // Timezone is display configuration, not a writable field of this action.
  const data = {
    booking_horizon_days: normalized.bookingHorizonDays,
    booking_min_lead_minutes: normalized.minLeadMinutes,
    booking_slot_interval_minutes: normalized.slotIntervalMinutes,
    same_day_attendance_strict_minutes: normalized.sameDayAttendanceStrictMinutes,
    public_allow_full_payment: normalized.allowPublicFullPayment,
    public_allow_downpayment: normalized.allowPublicDownpayment,
    public_default_payment_type: normalized.defaultPublicPaymentType,
    downpayment_percentage: normalized.downpaymentPercentage,
    booking_v2_enabled: normalized.bookingV2Enabled,
  };
  try {
    await prisma.$transaction(async tx => {
      const update = await tx.business.updateMany({
        where: {
          id: context.businessId,
          slug: context.businessSlug,
          owners: { some: ownerPermissionMembershipWhere(context, OwnerPermission.SETTINGS_MANAGE) },
        },
        data,
      });
      if (update.count !== 1) throw new SettingsAccessDenied();
      await logAudit(tx, {
        entityType: "Business", entityId: context.businessId, action: "UPDATED",
        actorId: context.userId, businessId: context.businessId,
        changes: { after: { ...data, mode: "BOOKING_POLICY_CHANGED" } },
      });
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof SettingsAccessDenied ? "Forbidden" : "Unable to update booking policy." };
  }
}
