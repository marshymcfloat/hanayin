import "server-only";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import type { BookingDetailPayload } from "@/features/bookings/booking-detail-types";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const bookingDetailSelect = {
  id: true, status: true, business_id: true,
  customer: { select: { id: true, name: true, email: true, phone: true, trust_tier: true, no_show_count: true } },
  is_anonymous_walk_in: true, customer_label: true, payment_method: true,
  payment_status: true, amount_paid: true, grand_total: true, total_discount: true,
  downpayment: true, downpayment_status: true, scheduled_at: true,
  estimated_end: true, created_at: true, hold_expires_at: true, cancelled_at: true,
  vouchers: { select: { id: true, code: true } },
  payments: { orderBy: { created_at: "desc" }, select: {
    id: true, type: true, status: true, payment_method: true,
    amount_principal: true, payer_name: true, provider_reference: true,
    submitted_at: true, verified_at: true, paid_at: true,
    escalated_at: true, escalation_reason: true, rejection_reason: true,
    resolution_outcome: true, resolution_note: true, void_reason: true,
    verified_by: { select: { name: true } },
  } },
  availed_services: { select: {
    id: true, served_by_id: true, final_price: true, discount: true, price: true, status: true,
    service: { select: { id: true, name: true, category: true } },
    served_by: { select: { id: true, user: { select: { name: true } } } },
    served_by_owner: { select: { id: true, user: { select: { name: true } } } },
  } },
} satisfies Prisma.BookingSelect;

export async function getTenantBookingDetail(context: Extract<TenantActorContext, { success: true }>, bookingId: number): Promise<BookingDetailPayload | null> {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, business_id: context.businessId }, select: bookingDetailSelect });
  if (!booking) return null;
  return {
    id: booking.id, status: booking.status, business_id: booking.business_id,
    customer: booking.customer ? { id: booking.customer.id, name: booking.customer.name, email: booking.customer.email, phone: booking.customer.phone, trust_tier: booking.customer.trust_tier, no_show_count: booking.customer.no_show_count } : null,
    is_anonymous_walk_in: booking.is_anonymous_walk_in, customer_label: booking.customer_label,
    payment_method: booking.payment_method, payment_status: booking.payment_status,
    amount_paid: booking.amount_paid, grand_total: booking.grand_total, total_discount: booking.total_discount,
    downpayment: booking.downpayment, downpayment_status: booking.downpayment_status,
    scheduled_at: booking.scheduled_at?.toISOString() ?? null,
    estimated_end: booking.estimated_end?.toISOString() ?? null, created_at: booking.created_at.toISOString(),
    hold_expires_at: booking.hold_expires_at?.toISOString() ?? null,
    cancelled_at: booking.cancelled_at?.toISOString() ?? null,
    vouchers: booking.vouchers.map(voucher => ({ id: voucher.id, code: voucher.code })),
    payments: booking.payments.map(payment => ({
      id: payment.id, type: payment.type, status: payment.status, payment_method: payment.payment_method,
      amount_principal: payment.amount_principal, payer_name: payment.payer_name,
      provider_reference: payment.provider_reference, submitted_at: payment.submitted_at?.toISOString() ?? null,
      verified_at: payment.verified_at?.toISOString() ?? null,
      verified_by: payment.verified_by ? { name: payment.verified_by.name } : null,
      paid_at: payment.paid_at?.toISOString() ?? null, escalated_at: payment.escalated_at?.toISOString() ?? null,
      escalation_reason: payment.escalation_reason, rejection_reason: payment.rejection_reason,
      resolution_outcome: payment.resolution_outcome, resolution_note: payment.resolution_note,
      void_reason: payment.void_reason,
    })),
    availed_services: booking.availed_services.map(item => ({
      id: item.id, served_by_id: item.served_by_id, service: { id: item.service.id, name: item.service.name, category: item.service.category },
      served_by: item.served_by ? { id: item.served_by.id, user: { name: item.served_by.user.name } } : null,
      served_by_owner: item.served_by_owner ? { id: item.served_by_owner.id, user: { name: item.served_by_owner.user.name } } : null,
      final_price: item.final_price, discount: item.discount, price: item.price, status: item.status,
    })),
  };
}
