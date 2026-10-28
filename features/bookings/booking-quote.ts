import type { BookingPricingSnapshot } from "@/features/bookings/services/booking-pricing";

/** Never expose estimated costs, commission bases, or private catalog records. */
export function toBookingQuote(pricing: BookingPricingSnapshot) {
  return {
    fingerprint: pricing.quoteFingerprint,
    services: pricing.services.map(({ id, name, quantity, duration, price, originalPrice, discount, discountReason, packageId, packageInstanceId, packageChoiceId, selectionKey }) => ({ id, name, quantity, duration, price, originalPrice, discount, discountReason, packageId, packageInstanceId, packageChoiceId, selectionKey })),
    subtotal: pricing.subtotal, voucherDiscount: pricing.voucherDiscount, grandTotal: pricing.grandTotal,
    amountToPay: pricing.amountToPay, totalDuration: pricing.totalDuration, voucherOutcome: pricing.voucherOutcome,
    offers: pricing.appliedOffers.map(({ id, title }) => ({ id, title })),
  };
}
export type BookingQuote = ReturnType<typeof toBookingQuote>;
export class BookingQuoteChangedError extends Error {
  constructor(readonly quote: BookingQuote) { super("QUOTE_CHANGED"); }
}
