"use server";

// Feature-owned Server Action boundary.

/**
 * Read-only fetch of a single booking's full detail. Returns the same
 * BookingWithDetails shape the role-aware BookingQuickPanel expects so
 * lazy-opening the panel against just a bookingId becomes a one-shot
 * call.
 *
 * Tenant-scoped: the booking is filtered by the actor's businessSlug,
 * so a bookingId from another tenant returns "not found".
 *
 * Permission: any signed-in tenant user. The returned panel itself is
 * gated by the viewer context the caller passes in — this action just
 * returns the data shape.
 */

import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { prisma } from "@/prisma/prisma";

export type GetBookingDetailResult =
  | { success: true; booking: BookingDetailPayload }
  | { success: false; error: string };

// Inline type duplicates the panel's BookingWithDetails so callers
// don't need to import Prisma client types here.
export type BookingDetailPayload = {
  id: number;
  status: "HOLD" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  is_anonymous_walk_in: boolean;
  customer_label: string | null;
  payment_method: "CASH" | "ONLINE" | "GCASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
  payment_status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  amount_paid: number;
  grand_total: number;
  total_discount: number;
  downpayment: number | null;
  downpayment_status: "HOLD" | "ACCEPTED" | "COMPLETED" | "CANCELLED" | null;
  scheduled_at: string | null;
  estimated_end: string | null;
  created_at: string;
  business_id: string;
  vouchers: Array<{ id: number; code: string }>;
  availed_services: Array<{
    id: number;
    service: { id: number; name: string; category: string };
    served_by: { id: number; user: { name: string } } | null;
    served_by_owner: { id: number; user: { name: string } } | null;
    final_price: number;
    discount: number;
    price: number;
    status:
      | "PENDING"
      | "CLAIMED"
      | "SERVING"
      | "COMPLETED"
      | "CANCELLED";
  }>;
};

export async function getBookingDetailAction(
  bookingId: number,
): Promise<GetBookingDetailResult> {
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

  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      business_id: actorContext.businessId,
    },
    include: {
      customer: true,
      vouchers: true,
      availed_services: {
        include: {
          service: true,
          served_by: { include: { user: true } },
          served_by_owner: { include: { user: true } },
        },
      },
    },
  });

  if (!booking) {
    return { success: false, error: "Booking not found" };
  }

  return {
    success: true,
    booking: {
      id: booking.id,
      status: booking.status,
      customer: booking.customer
        ? {
            id: booking.customer.id,
            name: booking.customer.name,
            email: booking.customer.email,
            phone: booking.customer.phone,
          }
        : null,
      is_anonymous_walk_in: booking.is_anonymous_walk_in,
      customer_label: booking.customer_label,
      payment_method: booking.payment_method,
      payment_status: booking.payment_status,
      amount_paid: booking.amount_paid,
      grand_total: booking.grand_total,
      total_discount: booking.total_discount,
      downpayment: booking.downpayment,
      downpayment_status: booking.downpayment_status,
      scheduled_at: booking.scheduled_at?.toISOString() ?? null,
      estimated_end: booking.estimated_end?.toISOString() ?? null,
      created_at: booking.created_at.toISOString(),
      business_id: booking.business_id,
      vouchers: booking.vouchers.map((v) => ({ id: v.id, code: v.code })),
      availed_services: booking.availed_services.map((as) => ({
        id: as.id,
        service: {
          id: as.service.id,
          name: as.service.name,
          category: as.service.category,
        },
        served_by: as.served_by
          ? { id: as.served_by.id, user: { name: as.served_by.user.name } }
          : null,
        served_by_owner: as.served_by_owner
          ? {
              id: as.served_by_owner.id,
              user: { name: as.served_by_owner.user.name },
            }
          : null,
        final_price: as.final_price,
        discount: as.discount,
        price: as.price,
        status: as.status,
      })),
    },
  };
}
