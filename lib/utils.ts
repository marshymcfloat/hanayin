import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Canonical PHP currency formatter. Uses the en-PH locale so the
 * peso glyph (₱) renders directly instead of the "PHP " prefix that
 * en-US would emit. Always two decimals — this matches how operators
 * read salary, sale-event discount values, and grand totals on the
 * payroll dialog and the customer history.
 *
 * Use this everywhere we display PHP money. Avoid manual
 * `₱${value.toLocaleString()}` (no decimal control) and
 * `PHP ${value.toFixed(2)}` (mismatched glyph).
 */
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
