import { prisma } from "@/prisma/prisma";

export async function getPublicBookingSuccess(businessSlug: string, id: number) {
  return prisma.booking.findFirst({ where: { id, business: { slug: businessSlug } }, select: { id: true, status: true, cancellation_reason: true, hold_expires_at: true, scheduled_at: true, estimated_end: true, payment_method: true, grand_total: true, amount_paid: true, business: { select: { name: true, gcash_account_name: true, gcash_mobile_number: true, gcash_qr_image_url: true, gcash_instructions: true } }, payments: { orderBy: { created_at: "desc" }, take: 1, select: { status: true, amount_principal: true, submitted_at: true, expires_at: true, rejection_reason: true } }, availed_services: { select: { service: { select: { name: true } } } } } });
}
