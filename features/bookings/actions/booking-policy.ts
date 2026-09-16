"use server";

// Feature-owned Server Action boundary.

import { prisma } from "@/prisma/prisma";
import { revalidatePath } from "next/cache";
import { requireTenantWriteAccess } from "@/lib/auth/guards";
import {
  BookingPolicy,
  normalizeBookingPolicy,
  normalizeBookingPublicPaymentType,
} from "@/lib/types/booking-policy";
import { getBookingPolicyByBusinessSlug } from "@/lib/services/booking-policy";

export async function getBookingPolicy(
  businessSlug: string,
): Promise<BookingPolicy> {
  return getBookingPolicyByBusinessSlug(prisma, businessSlug);
}

export async function updateBookingPolicy(
  businessSlug: string,
  input: Partial<BookingPolicy>,
) {
  const auth = await requireTenantWriteAccess(businessSlug);
  if (!auth.success) return auth;

  const normalized = normalizeBookingPolicy(input);
  await prisma.business.update({
    where: { slug: businessSlug },
    data: {
      booking_horizon_days: normalized.bookingHorizonDays,
      booking_min_lead_minutes: normalized.minLeadMinutes,
      booking_slot_interval_minutes: normalized.slotIntervalMinutes,
      same_day_attendance_strict_minutes:
        normalized.sameDayAttendanceStrictMinutes,
      public_allow_full_payment: normalized.allowPublicFullPayment,
      public_allow_downpayment: normalized.allowPublicDownpayment,
      public_default_payment_type: normalizeBookingPublicPaymentType(
        normalized.defaultPublicPaymentType,
      ),
      downpayment_percentage: normalized.downpaymentPercentage,
      booking_v2_enabled: normalized.bookingV2Enabled,
    },
  });

  revalidatePath(`/app/${businessSlug}`);
  revalidatePath(`/app/${businessSlug}/business-hours`);
  revalidatePath(`/${businessSlug}/booking`);

  return { success: true };
}
