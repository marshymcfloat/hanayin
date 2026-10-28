import "server-only";
import { prisma } from "@/prisma/prisma";
import { voucherBusinessWhere, type VoucherActorContext } from "@/features/catalog/voucher-access";
import { publicVoucherSelect, voucherSelect } from "@/features/catalog/voucher-select";
import { evaluateVoucher } from "@/features/catalog/voucher-policy";
import { generateVoucherSuffix, VOUCHER_CODE_MAX_ATTEMPTS } from "@/features/catalog/voucher-code";
import { normalizeVoucherCode } from "@/lib/utils/voucher-code";
import type { VerifyVoucherResult } from "@/features/catalog/voucher-types";
export async function listTenantVouchers(context: VoucherActorContext) {
  return prisma.voucher.findMany({
    where: { business_id: context.businessId, business: voucherBusinessWhere(context) },
    orderBy: { created_at: "desc" },
    select: { ...voucherSelect, used_by: { where: { business_id: context.businessId }, select: { id: true, created_at: true } } },
  });
}
export async function generateTenantVoucherCode(context: VoucherActorContext) {
  const business = await prisma.business.findFirst({ where: voucherBusinessWhere(context), select: { initials: true } });
  if (!business) return { success: false as const, error: "Business not found" };
  const prefix = (business.initials || "VO").toUpperCase();
  for (let attempt = 0; attempt < VOUCHER_CODE_MAX_ATTEMPTS; attempt += 1) {
    const code = normalizeVoucherCode(`${prefix}-${generateVoucherSuffix()}`);
    if (!await prisma.voucher.findUnique({ where: { code }, select: { id: true } })) return { success: true as const, code };
  }
  return { success: false as const, error: "Couldn't generate a unique code. Try again." };
}
export async function verifyPublicVoucher(code: string, businessSlug: string, currentTotal: number, now = new Date()): Promise<VerifyVoucherResult> {
  const voucher = await prisma.voucher.findFirst({ where: { code, business: { slug: businessSlug } }, select: publicVoucherSelect });
  if (!voucher) {
    const exists = await prisma.voucher.findUnique({ where: { code }, select: { id: true } });
    return { success: false, error: exists ? "Invalid voucher for this business" : "Voucher code not found" };
  }
  return evaluateVoucher(voucher, currentTotal, now);
}
