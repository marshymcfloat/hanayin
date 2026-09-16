"use server";

// Feature-owned Server Action boundary.

/**
 * Read-only listing of notes attached to a booking. Tenant-scoped via
 * the actor context — the action never leaks notes outside the
 * caller's business even if a booking_id from another tenant is
 * supplied.
 *
 * Permission: any signed-in tenant user. The booking-edit panel surfaces
 * notes to anyone who can see the booking, since notes are part of the
 * booking's context (e.g. allergy warnings, customer preferences).
 *
 * For customer-facing endpoints, do NOT call this directly — filter by
 * visibility=CUSTOMER_VISIBLE first.
 */

import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { prisma } from "@/prisma/prisma";

export type BookingNoteEntry = {
  id: string;
  body: string;
  visibility: "INTERNAL" | "CUSTOMER_VISIBLE";
  createdAt: string;
  createdBy: { id: string; name: string } | null;
};

export type ListBookingNotesResult =
  | { success: true; notes: BookingNoteEntry[] }
  | { success: false; error: string };

export async function listBookingNotesAction(
  bookingId: number,
): Promise<ListBookingNotesResult> {
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireAuth();
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const actorContext = await resolveTenantActorContext(
    auth.businessSlug,
    auth.session.user.id,
  );
  if (!actorContext.success) {
    return { success: false, error: actorContext.error };
  }

  // Tenant scope: only return notes whose parent booking belongs to
  // the actor's business. Anything else returns an empty list rather
  // than leaking the existence of an out-of-tenant booking.
  const notes = await prisma.bookingNote.findMany({
    where: {
      booking_id: bookingId,
      booking: { business_id: actorContext.businessId },
    },
    select: {
      id: true,
      body: true,
      visibility: true,
      created_at: true,
      created_by_user: {
        select: { id: true, name: true },
      },
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  return {
    success: true,
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      visibility: n.visibility,
      createdAt: n.created_at.toISOString(),
      createdBy: n.created_by_user
        ? { id: n.created_by_user.id, name: n.created_by_user.name }
        : null,
    })),
  };
}
