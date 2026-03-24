export type SaleEventRef = { id: number };

export type SaleEventForPricing = {
  title: string;
  discount_type: "PERCENTAGE" | "FLAT";
  discount_value: number;
  slot_limit?: number | null;
  slots_remaining?: number | null;
  applicable_services: SaleEventRef[];
  applicable_packages: SaleEventRef[];
};

export const getApplicableDiscount = (
  serviceId: number,
  packageId: number | undefined,
  price: number,
  saleEvents: SaleEventForPricing[],
) => {
  if (!saleEvents || saleEvents.length === 0) return null;

  const applicableEvent = saleEvents
    .filter((event) => {
      // Skip sold-out events
      if (event.slots_remaining !== undefined && event.slots_remaining !== null && event.slots_remaining <= 0) {
        return false;
      }
      if (packageId) {
        return event.applicable_packages.some((p) => p.id === packageId);
      }
      return event.applicable_services.some((s) => s.id === serviceId);
    })
    .sort((a, b) => {
      const valA =
        a.discount_type === "PERCENTAGE"
          ? (price * a.discount_value) / 100
          : a.discount_value;
      const valB =
        b.discount_type === "PERCENTAGE"
          ? (price * b.discount_value) / 100
          : b.discount_value;
      return valB - valA;
    })[0];

  if (applicableEvent) {
    let discountAmount = 0;
    if (applicableEvent.discount_type === "PERCENTAGE") {
      discountAmount = (price * applicableEvent.discount_value) / 100;
    } else {
      discountAmount = applicableEvent.discount_value;
    }
    // Ensure we don't discount more than the price
    discountAmount = Math.min(discountAmount, price);

    if (discountAmount > 0) {
      return {
        finalPrice: price - discountAmount,
        discount: discountAmount,
        reason: applicableEvent.title,
        slotsRemaining: applicableEvent.slots_remaining ?? null,
      };
    }
  }
  return null;
};

/**
 * Calculates the final booking total using integer math to avoid floating point errors.
 *
 * @param params.subtotal - The total price of all services after item-level discounts
 * @param params.voucherDiscount - The total discount amount from a voucher
 * @param params.paymentMethod - The payment method (e.g., "QRPH", "CASH")
 * @param params.paymentType - "FULL" or "DOWNPAYMENT"
 * @returns The final amount to charge in standard units (e.g. pesos), rounded to 2 decimal places if needed, but calculated precisely.
 */
export function calculateBookingTotal({
  subtotal,
  voucherDiscount = 0,
  paymentMethod,
  paymentType,
}: {
  subtotal: number;
  voucherDiscount?: number;
  paymentMethod: "QRPH" | "CASH" | string;
  paymentType: "FULL" | "DOWNPAYMENT" | string;
}): number {
  // Convert everything to cents (integers)
  const subtotalCents = Math.round(subtotal * 100);
  const voucherDiscountCents = Math.round(voucherDiscount * 100);

  // 1. Apply Voucher Discount
  // Ensure we don't go below zero
  const totalAfterDiscountCents = Math.max(
    0,
    subtotalCents - voucherDiscountCents,
  );

  // 2. Apply Payment Type (Downpayment vs Full)
  let amountToPayCents = totalAfterDiscountCents;

  if (paymentType === "DOWNPAYMENT") {
    // 50% downpayment
    // Math.round to ensure we have an integer cent value
    amountToPayCents = Math.round(totalAfterDiscountCents * 0.5);
  }

  // 3. Apply Convenience Fee for QRPH
  if (paymentMethod === "QRPH") {
    // 1.5% fee
    // We calculate the fee separately and add it, rounding the fee to the nearest cent
    const feeCents = Math.round(amountToPayCents * 0.015);
    amountToPayCents += feeCents;
  }

  // Convert back to standard unit
  return amountToPayCents / 100;
}
