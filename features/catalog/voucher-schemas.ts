import { z } from "zod";
import { normalizeVoucherCode } from "@/lib/utils/voucher-code";
import { businessSlugSchema } from "@/lib/validation/business-slug";

export const voucherCodeSchema = z.string().max(200).transform(normalizeVoucherCode).pipe(z.string().min(1, "Voucher code can't be empty").max(200));
const amount = z.number().finite().min(0).max(1e12);
export const voucherIdSchema = z.number().int().positive().max(2147483647);
export const createVoucherSchema = z.object({
  code: voucherCodeSchema,
  type: z.enum(["PERCENTAGE", "FLAT"]),
  value: amount,
  minimum_amount: amount,
  expires_at: z.date().refine(date => date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999),
}).refine(data => data.type !== "PERCENTAGE" || data.value <= 100);
export const updateVoucherSchema = createVoucherSchema;
export const voucherActiveSchema = z.boolean();
export const verifyVoucherSchema = z.object({ code: voucherCodeSchema, businessSlug: businessSlugSchema, currentTotal: amount });
export function voucherInputError(issues: readonly { message: string }[]) {
  return issues.some(issue => issue.message === "Voucher code can't be empty") ? "Voucher code can't be empty" : "Invalid voucher input.";
}
