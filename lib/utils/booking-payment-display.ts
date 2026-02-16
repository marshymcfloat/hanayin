export type BookingPaymentDisplay = {
  grandTotal: number;
  amountPaid: number;
  remainingBalance: number;
  grandTotalLabel: string;
  amountPaidLabel: string;
  remainingBalanceLabel: string;
  paymentStatusLabel: string;
};

const roundCurrency = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

function toSafeNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getBookingPaymentDisplay(input: {
  grandTotal: number | string | null | undefined;
  amountPaid: number | string | null | undefined;
}): BookingPaymentDisplay {
  const grandTotal = Math.max(0, roundCurrency(toSafeNumber(input.grandTotal)));
  const amountPaidRaw = Math.max(0, roundCurrency(toSafeNumber(input.amountPaid)));
  const amountPaid = Math.min(amountPaidRaw, grandTotal);
  const remainingBalance = Math.max(0, roundCurrency(grandTotal - amountPaid));

  return {
    grandTotal,
    amountPaid,
    remainingBalance,
    grandTotalLabel: "Grand Total",
    amountPaidLabel: "Amount Paid",
    remainingBalanceLabel: "Balance Due",
    paymentStatusLabel: remainingBalance > 0 ? "Partially Paid" : "Paid in Full",
  };
}
