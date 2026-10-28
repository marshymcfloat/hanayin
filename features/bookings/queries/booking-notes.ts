import "server-only";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import type { BookingNoteEntry } from "@/features/bookings/booking-note-types";
import { prisma } from "@/prisma/prisma";

export async function getTenantBookingNotes(context: Extract<TenantActorContext, { success: true }>, bookingId: number): Promise<BookingNoteEntry[]> {
  const notes = await prisma.bookingNote.findMany({
    where: { booking_id: bookingId, booking: { business_id: context.businessId } },
    select: {
      id: true, body: true, visibility: true, created_at: true,
      created_by_user: { select: { id: true, name: true } },
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });
  return notes.map(note => ({
    id: note.id, body: note.body, visibility: note.visibility,
    createdAt: note.created_at.toISOString(),
    createdBy: note.created_by_user ? { id: note.created_by_user.id, name: note.created_by_user.name } : null,
  }));
}
