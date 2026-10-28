"use server";

import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { bookingDetailIdSchema } from "@/features/bookings/booking-detail-schemas";
import { getTenantBookingDetail } from "@/features/bookings/queries/booking-detail";
import type { GetBookingDetailResult } from "@/features/bookings/booking-detail-types";
export type { GetBookingDetailResult, BookingDetailPayload } from "@/features/bookings/booking-detail-types";

export async function getBookingDetailAction(bookingId: number): Promise<GetBookingDetailResult> {
  const parsed = bookingDetailIdSchema.safeParse(bookingId);
  if (!parsed.success) return { success: false, error: "Invalid input" };
  try {
    const auth = await requireAuth();
    if (!auth.success) return { success: false, error: auth.error };
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success) return { success: false, error: context.error };
    const booking = await getTenantBookingDetail(context, parsed.data);
    return booking ? { success: true, booking } : { success: false, error: "Booking not found" };
  } catch { return { success: false, error: "Failed to fetch booking details" }; }
}
