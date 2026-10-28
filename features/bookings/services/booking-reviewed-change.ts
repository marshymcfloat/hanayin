import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { recheckBookingCommandAccess, type BookingCommandActor } from "@/features/bookings/booking-command-access";
import { buildBookingPricingSnapshot } from "@/features/bookings/services/booking-pricing";
import { toBookingQuote } from "@/features/bookings/booking-quote";
import { assertBookingOfferCapacity } from "@/features/bookings/services/booking-offer-capacity";
import { validateBookingOrThrow } from "@/features/bookings/services/booking-availability";
import type { BookingChangeInput } from "@/features/bookings/booking-change-schemas";
import { logAudit } from "@/lib/services/audit";

const options = { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 } as const;
export class BookingChangeError extends Error {}
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function editableBooking(tx: Prisma.TransactionClient, actor: BookingCommandActor, id: number) {
  const business = await recheckBookingCommandAccess(tx, actor, "BOOKING_MODIFY");
  if (!business) throw new BookingChangeError("Forbidden");
  const booking = await tx.booking.findFirst({ where: { id, business_id: actor.businessId, business }, include: { availed_services: { orderBy: [{ scheduled_at: "asc" }, { id: "asc" }], include: { service: true, package: { select: { name: true } } } }, vouchers: { select: { code: true } }, payments: { where: { status: { in: ["PENDING", "SUCCEEDED"] } }, select: { id: true } } } });
  if (!booking) throw new BookingChangeError("Booking not found.");
  if (booking.status !== "ACCEPTED" || booking.cancelled_at || booking.amount_paid > 0 || booking.payment_status !== "UNPAID" || booking.payments.length || booking.availed_services.some(line => line.status !== "PENDING" || line.paid_in_payslip_id !== null)) throw new BookingChangeError("Only unpaid, unstarted bookings without pending payments can be changed here. Use the existing follow-up or adjustment flow.");
  return booking;
}
export async function readBookingChangeEditor(actor: BookingCommandActor, id: number) {
  return prisma.$transaction(async tx => {
    const booking = await editableBooking(tx, actor, id);
    const [services, packages] = await Promise.all([
      tx.service.findMany({ where: { business_id: actor.businessId }, orderBy: { name: "asc" } }),
      tx.servicePackage.findMany({ where: { business_id: actor.businessId }, include: { items: { include: { service: true } } }, orderBy: { name: "asc" } }),
    ]);
    return { businessSlug: actor.businessSlug, scheduledAt: booking.scheduled_at ?? booking.created_at, total: booking.grand_total, voucherCode: booking.vouchers[0]?.code,
      services, packages, selected: booking.availed_services.map(line => ({ ...line.service, price: line.final_price, originalPrice: line.price, quantity: 1, selectionKey: `existing-${line.id}`, packageId: line.package_id ?? undefined, packageInstanceId: line.package_instance_id ?? (line.package_id == null ? undefined : `legacy-${line.package_id}`), packageChoiceId: line.package_choice_id ?? undefined, packageName: line.package?.name })),
    };
  }, options);
}
export async function reviewBookingChange(actor: BookingCommandActor, input: BookingChangeInput) {
  return prisma.$transaction(async tx => {
    if (!await recheckBookingCommandAccess(tx, actor, "BOOKING_MODIFY")) throw new BookingChangeError("Forbidden");
    const payloadHash = hash({ services: input.services, voucherCode: input.voucherCode, expectedFingerprint: input.expectedFingerprint });
    if (input.requestKey) {
      const prior = await tx.bookingChangeCommand.findFirst({ where: { booking_id: input.bookingId, actor_id: actor.userId, request_key: input.requestKey, booking: { business_id: actor.businessId } }, select: { payload_hash: true } });
      if (prior) { if (prior.payload_hash !== payloadHash) throw new BookingChangeError("This request key was already used for a different change."); return { applied: true as const, bookingId: input.bookingId }; }
    }
    const booking = await editableBooking(tx, actor, input.bookingId);
    const pricing = await buildBookingPricingSnapshot({ db: tx, businessSlug: actor.businessSlug, scheduledAt: booking.scheduled_at ?? booking.created_at, services: input.services, paymentMethod: booking.payment_method === "CASH" ? "CASH" : "ONLINE", paymentType: "FULL", voucherCode: input.voucherCode, existingBookingId: booking.id });
    const quote = toBookingQuote(pricing);
    quote.fingerprint = hash({ quote: quote.fingerprint, updated: booking.updated_at, lines: booking.availed_services.map(line => ({ id: line.id, price: line.final_price, revision: line.payroll_revision, updated: line.updated_at })) });
    if (!input.requestKey || input.expectedFingerprint !== quote.fingerprint) return { applied: false as const, quote };
    await assertBookingOfferCapacity(tx, actor.businessId, pricing.appliedOffers.map(offer => offer.id), booking.id);
    await validateBookingOrThrow({ db: tx, businessSlug: actor.businessSlug, scheduledAt: booking.scheduled_at ?? booking.created_at, services: pricing.services, paymentType: "FULL", isPublicBooking: false, isWalkIn: true, excludeBookingId: booking.id });
    const retained = new Set<number>();
    const original = new Map(booking.availed_services.map(line => [line.id, line]));
    // Avoid transient overlaps while moving still-pending assignments together.
    await tx.availedService.updateMany({ where: { booking_id: booking.id, booking: { business_id: actor.businessId }, status: "PENDING" }, data: { served_by_id: null, served_by_owner_id: null, served_by_type: null } });
    let cursor = booking.scheduled_at ?? booking.created_at;
    for (const service of pricing.services) {
      const match = /^existing-(\d+)-0:0$/.exec(service.selectionKey ?? "");
      const previous = match ? original.get(Number(match[1])) : undefined;
      if (previous && retained.has(previous.id)) throw new BookingChangeError("A service line cannot be selected twice.");
      const end = new Date(cursor.getTime() + service.duration * 60000);
      const data = { service_id: service.id, package_id: service.packageId ?? null, package_instance_id: service.packageInstanceId ?? null, package_choice_id: service.packageChoiceId ?? null, selection_key: service.selectionKey, pricing_snapshot: json(service), price: service.originalPrice, estimated_cost: service.estimatedCost, final_price: service.price, discount: service.discount, discount_reason: service.discountReason, commission_base: service.commissionBase, scheduled_at: cursor, estimated_end: end,
        ...(previous?.service_id === service.id ? { served_by_id: previous.served_by_id, served_by_owner_id: previous.served_by_owner_id, served_by_type: previous.served_by_type } : {}),
      };
      if (previous) { retained.add(previous.id); await tx.availedService.update({ where: { id: previous.id, booking_id: booking.id }, data }); }
      else await tx.availedService.create({ data: { ...data, booking_id: booking.id } });
      cursor = end;
    }
    await tx.availedService.deleteMany({ where: { id: { in: booking.availed_services.filter(line => !retained.has(line.id)).map(line => line.id) }, booking_id: booking.id, booking: { business_id: actor.businessId } } });
    await tx.voucher.updateMany({ where: { business_id: actor.businessId, used_by_id: booking.id, ...(pricing.voucher ? { id: { not: pricing.voucher.id } } : {}) }, data: { used_by_id: null, is_active: true } });
    if (pricing.voucher) {
      const voucher = await tx.voucher.updateMany({ where: { id: pricing.voucher.id, business_id: actor.businessId, OR: [{ used_by_id: booking.id }, { used_by_id: null, is_active: true }] }, data: { used_by_id: booking.id, is_active: false } });
      if (voucher.count !== 1) throw new BookingChangeError("Voucher availability changed. Review the prices again.");
    }
    await tx.bookingOfferApplication.deleteMany({ where: { booking_id: booking.id, booking: { business_id: actor.businessId } } });
    if (pricing.appliedOffers.length) await tx.bookingOfferApplication.createMany({ data: pricing.appliedOffers.map(offer => ({ booking_id: booking.id, sale_event_id: offer.id, snapshot: json(offer) })) });
    const snapshot = json({ version: 1, quoteFingerprint: pricing.quoteFingerprint, services: pricing.services, packages: pricing.packageSnapshots, offers: pricing.appliedOffers, voucher: pricing.voucher, voucherOutcome: pricing.voucherOutcome, grandTotal: pricing.grandTotal });
    await tx.booking.update({ where: { id: booking.id, business_id: actor.businessId, updated_at: booking.updated_at }, data: { grand_total: pricing.grandTotal, total_discount: pricing.voucherDiscount, estimated_end: cursor, sale_event_id: pricing.appliedSaleEventId, pricing_snapshot: snapshot } });
    await tx.bookingChangeCommand.create({ data: { booking_id: booking.id, actor_id: actor.userId, request_key: input.requestKey, payload_hash: payloadHash, snapshot: json({ before: booking.pricing_snapshot, after: snapshot }) } });
    await logAudit(tx, { businessId: actor.businessId, actorId: actor.userId, entityType: "Booking", entityId: String(booking.id), action: "UPDATED", changes: { before: { grand_total: booking.grand_total }, after: { grand_total: pricing.grandTotal, reason: "Reviewed services and offers", requestKey: input.requestKey } } });
    return { applied: true as const, bookingId: booking.id };
  }, options);
}
