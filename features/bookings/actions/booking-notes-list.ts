"use server";

import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { bookingNotesIdSchema } from "@/features/bookings/booking-note-schemas";
import { getTenantBookingNotes } from "@/features/bookings/queries/booking-notes";
import type { BookingNoteEntry as NoteDto, BookingNotesResult } from "@/features/bookings/booking-note-types";

export type BookingNoteEntry = NoteDto;
export type ListBookingNotesResult = BookingNotesResult;

export async function listBookingNotesAction(bookingId: number): Promise<ListBookingNotesResult> {
  const validation = bookingNotesIdSchema.safeParse(bookingId);
  if (!validation.success) return { success: false, error: "Invalid input" };
  try {
    const auth = await requireAuth();
    if (!auth.success) return { success: false, error: auth.error };
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success) return { success: false, error: context.error };
    return { success: true, notes: await getTenantBookingNotes(context, validation.data) };
  } catch {
    return { success: false, error: "Unable to load booking notes." };
  }
}
