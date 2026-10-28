"use server";

import { revalidatePath } from "next/cache";
import { requireBookingAddOnAccess } from "@/features/bookings/booking-addon-access";
import { bookingAddOnSchema, type BookingAddOnInput, type AddBookingServiceOrCreateFollowUpResult } from "@/features/bookings/booking-addon-schemas";
import { addTenantBookingServices } from "@/features/bookings/services/booking-addon-orchestration";

export type { AddBookingServiceOrCreateFollowUpResult } from "@/features/bookings/booking-addon-schemas";

export async function addBookingServiceOrCreateFollowUpAction(input: BookingAddOnInput): Promise<AddBookingServiceOrCreateFollowUpResult> {
  const validation = bookingAddOnSchema.safeParse(input);
  if (!validation.success) throw new Error("Invalid input");
  const actor = await requireBookingAddOnAccess();
  const result = await addTenantBookingServices(actor, validation.data);
  for (const path of [`/app/${actor.businessSlug}`, `/app/${actor.businessSlug}/bookings`]) {
    try { revalidatePath(path); } catch { /* The mutation already committed. */ }
  }
  return result;
}
