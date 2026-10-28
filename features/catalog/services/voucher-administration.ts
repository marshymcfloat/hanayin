import "server-only";
import { prisma } from "@/prisma/prisma";
import { voucherBusinessWhere, type VoucherActorContext } from "@/features/catalog/voucher-access";
import { voucherSelect } from "@/features/catalog/voucher-select";
import type { CreateVoucherInput } from "@/features/catalog/voucher-types";
export class VoucherAdministrationError extends Error {}
const transactionOptions = { isolationLevel: "Serializable" as const, maxWait: 5000, timeout: 10000 };
export async function createTenantVoucher(context: VoucherActorContext, input: CreateVoucherInput) {
  try {
    return await prisma.$transaction(async tx => {
      const business = await tx.business.findFirst({ where: voucherBusinessWhere(context), select: { id: true } });
      if (!business) throw new VoucherAdministrationError("Business not found");
      if (await tx.voucher.findUnique({ where: { code: input.code }, select: { id: true } })) throw new VoucherAdministrationError("Voucher code already exists");
      return tx.voucher.create({ data: { code: input.code, type: input.type, value: input.value, minimum_amount: input.minimum_amount, expires_at: input.expires_at, business_id: context.businessId, is_active: true }, select: voucherSelect });
    }, transactionOptions);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") throw new VoucherAdministrationError("Voucher code already exists");
    throw error;
  }
}
export async function updateTenantVoucher(context: VoucherActorContext, id: number, input: CreateVoucherInput) {
  try {
    return await prisma.$transaction(async tx => {
      const business = await tx.business.findFirst({ where: voucherBusinessWhere(context), select: { id: true } });
      if (!business) throw new VoucherAdministrationError("Voucher not found or unauthorized");
      const target = await tx.voucher.findFirst({ where: { id, business_id: context.businessId, business: voucherBusinessWhere(context) }, select: { id: true } });
      if (!target) throw new VoucherAdministrationError("Voucher not found or unauthorized");
      const duplicate = await tx.voucher.findUnique({ where: { code: input.code }, select: { id: true } });
      if (duplicate && duplicate.id !== id) throw new VoucherAdministrationError("Voucher code already exists");
      return tx.voucher.update({ where: { id: target.id }, data: { code: input.code, type: input.type, value: input.value, minimum_amount: input.minimum_amount, expires_at: input.expires_at }, select: voucherSelect });
    }, transactionOptions);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") throw new VoucherAdministrationError("Voucher code already exists");
    throw error;
  }
}
export async function setTenantVoucherActive(context: VoucherActorContext, id: number, isActive: boolean) {
  return prisma.$transaction(async tx => {
    const business = await tx.business.findFirst({ where: voucherBusinessWhere(context), select: { id: true } });
    if (!business) throw new VoucherAdministrationError("Voucher not found or unauthorized");
    const updated = await tx.voucher.updateMany({ where: { id, business_id: context.businessId, business: voucherBusinessWhere(context) }, data: { is_active: isActive } });
    if (updated.count !== 1) throw new VoucherAdministrationError("Voucher not found or unauthorized");
    const voucher = await tx.voucher.findFirst({ where: { id, business_id: context.businessId, business: voucherBusinessWhere(context) }, select: voucherSelect });
    if (!voucher) throw new VoucherAdministrationError("Voucher not found or unauthorized");
    return voucher;
  }, transactionOptions);
}
export async function deleteTenantVoucher(context: VoucherActorContext, id: number) {
  return prisma.$transaction(async tx => {
    const business = await tx.business.findFirst({ where: voucherBusinessWhere(context), select: { id: true } });
    if (!business) throw new VoucherAdministrationError("Voucher not found or unauthorized");
    const deleted = await tx.voucher.deleteMany({ where: { id, business_id: context.businessId, business: voucherBusinessWhere(context) } });
    if (deleted.count !== 1) throw new VoucherAdministrationError("Voucher not found or unauthorized");
    return { id };
  }, transactionOptions);
}
export function voucherAdministrationError(error: unknown, fallback: string) {
  if (error instanceof VoucherAdministrationError) return error.message;
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") return "Voucher changed. Refresh and try again.";
  return fallback;
}
