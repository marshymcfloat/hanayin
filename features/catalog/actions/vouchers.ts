"use server";

import { revalidatePath } from "next/cache";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { requireVoucherAccess } from "@/features/catalog/voucher-access";
import { createVoucherSchema, updateVoucherSchema, voucherActiveSchema, voucherIdSchema, verifyVoucherSchema, voucherInputError } from "@/features/catalog/voucher-schemas";
import { listTenantVouchers, generateTenantVoucherCode, verifyPublicVoucher } from "@/features/catalog/queries/voucher-administration";
import { createTenantVoucher, deleteTenantVoucher, setTenantVoucherActive, updateTenantVoucher, voucherAdministrationError } from "@/features/catalog/services/voucher-administration";
import type { CreateVoucherInput, VerifyVoucherResult } from "@/features/catalog/voucher-types";
import { toVoucherMutationData } from "@/features/catalog/catalog-mutation-dtos";
export type { CreateVoucherInput, VerifyVoucherResult } from "@/features/catalog/voucher-types";

function invalidateVouchers(slug: string) {
  for (const path of [
    `/app/${slug}/vouchers`,
    `/owner-dashboard-preview/${slug}/vouchers`,
  ]) {
    try { revalidatePath(path); } catch { /* Persistence already committed. */ }
  }
}
export async function getVouchersAction(businessSlug: string) {
  if (!businessSlugSchema.safeParse(businessSlug).success) return { success: false as const, error: "Invalid business slug" };
  try {
    const access = await requireVoucherAccess(false, businessSlug);
    if (!access.success) return access;
    return { success: true as const, data: await listTenantVouchers(access.context) };
  } catch { return { success: false as const, error: "Failed to fetch vouchers" }; }
}
export async function createVoucherAction(data: CreateVoucherInput) {
  const parsed = createVoucherSchema.safeParse(data);
  if (!parsed.success) return { success: false as const, error: voucherInputError(parsed.error.issues) };
  try {
    const access = await requireVoucherAccess(true);
    if (!access.success) return access;
    const voucher = await createTenantVoucher(access.context, parsed.data);
    invalidateVouchers(access.context.businessSlug);
    return { success: true as const, data: toVoucherMutationData(voucher, new Date()) };
  } catch (error) { return { success: false as const, error: voucherAdministrationError(error, "Failed to create voucher") }; }
}
export async function updateVoucherAction(id: number, data: CreateVoucherInput) {
  const parsedId = voucherIdSchema.safeParse(id);
  const parsed = updateVoucherSchema.safeParse(data);
  if (!parsedId.success || !parsed.success) return { success: false as const, error: "Invalid voucher input." };
  try {
    const access = await requireVoucherAccess(true);
    if (!access.success) return access;
    const voucher = await updateTenantVoucher(access.context, parsedId.data, parsed.data);
    invalidateVouchers(access.context.businessSlug);
    return { success: true as const, data: toVoucherMutationData(voucher, new Date()) };
  } catch (error) { return { success: false as const, error: voucherAdministrationError(error, "Failed to update voucher") }; }
}
export async function setVoucherActiveAction(id: number, isActive: boolean) {
  const parsedId = voucherIdSchema.safeParse(id);
  const parsedActive = voucherActiveSchema.safeParse(isActive);
  if (!parsedId.success || !parsedActive.success) return { success: false as const, error: "Invalid voucher input." };
  try {
    const access = await requireVoucherAccess(true);
    if (!access.success) return access;
    const voucher = await setTenantVoucherActive(access.context, parsedId.data, parsedActive.data);
    invalidateVouchers(access.context.businessSlug);
    return { success: true as const, data: toVoucherMutationData(voucher, new Date()) };
  } catch (error) { return { success: false as const, error: voucherAdministrationError(error, "Failed to update voucher status") }; }
}
export async function deleteVoucherAction(id: number) {
  const parsed = voucherIdSchema.safeParse(id);
  if (!parsed.success) return { success: false as const, error: "Invalid voucher input." };
  try {
    const access = await requireVoucherAccess(true);
    if (!access.success) return access;
    const deleted = await deleteTenantVoucher(access.context, parsed.data);
    invalidateVouchers(access.context.businessSlug);
    return { success: true as const, data: deleted };
  } catch (error) { return { success: false as const, error: voucherAdministrationError(error, "Failed to delete voucher") }; }
}
export async function generateVoucherCodeAction() {
  try {
    const access = await requireVoucherAccess(true);
    if (!access.success) return access;
    return await generateTenantVoucherCode(access.context);
  } catch { return { success: false as const, error: "Failed to generate code" }; }
}
export async function verifyVoucherAction(code: string, businessSlug: string, currentTotal: number): Promise<VerifyVoucherResult> {
  const parsed = verifyVoucherSchema.safeParse({ code, businessSlug, currentTotal });
  if (!parsed.success) return { success: false, error: voucherInputError(parsed.error.issues) };
  try { return await verifyPublicVoucher(parsed.data.code, parsed.data.businessSlug, parsed.data.currentTotal); }
  catch { return { success: false, error: "Failed to verify voucher" }; }
}
