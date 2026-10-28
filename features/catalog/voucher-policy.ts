import "server-only";
import type { VerifyVoucherResult } from "@/features/catalog/voucher-types";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { publicVoucherSelect } from "@/features/catalog/voucher-select";
type PublicVoucher = Prisma.VoucherGetPayload<{ select: typeof publicVoucherSelect }>;
export function evaluateVoucher(voucher: PublicVoucher, currentTotal: number, now: Date): VerifyVoucherResult {
  if (!voucher.is_active) return { success: false, error: "Voucher is inactive" };
  if (now > voucher.expires_at) return { success: false, error: "Voucher has expired" };
  if (voucher.used_by_id !== null) return { success: false, error: "Voucher has already been used" };
  if (currentTotal < voucher.minimum_amount) return { success: false, error: `Minimum spend of ${voucher.minimum_amount} required` };
  const discountAmount = Math.min(voucher.type === "PERCENTAGE" ? currentTotal * voucher.value / 100 : voucher.value, currentTotal);
  return { success: true, data: { id: voucher.id, code: voucher.code, type: voucher.type, value: voucher.value, discountAmount, finalPrice: currentTotal - discountAmount, minAmount: voucher.minimum_amount } };
}
