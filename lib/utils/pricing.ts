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

export function calculateBookingTotal({
  subtotal,
  voucherDiscount = 0,
  paymentMethod: _paymentMethod,
  paymentType,
  downpaymentPercentage = 50,
}: {
  subtotal: number;
  voucherDiscount?: number;
  paymentMethod: "ONLINE" | "CASH" | string;
  paymentType: "FULL" | "DOWNPAYMENT" | string;
  downpaymentPercentage?: number;
}): number {
  const subtotalCents = Math.round(subtotal * 100);
  const voucherDiscountCents = Math.round(voucherDiscount * 100);
  const totalAfterDiscountCents = Math.max(0, subtotalCents - voucherDiscountCents);

  let amountToPayCents = totalAfterDiscountCents;
  if (paymentType === "DOWNPAYMENT") {
    const safePercentage = Math.max(1, Math.min(100, downpaymentPercentage));
    amountToPayCents = Math.round(totalAfterDiscountCents * (safePercentage / 100));
  }

  return amountToPayCents / 100;
}
