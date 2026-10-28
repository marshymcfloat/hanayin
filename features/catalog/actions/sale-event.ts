"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { tenantCacheTags } from "@/lib/data/cached";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { requireSaleEventAccess, saleEventClientError } from "@/features/catalog/sale-event-access";
import { createSaleEventSchema, updateSaleEventSchema, deleteSaleEventSchema, EMPTY_SALE_SELECTION } from "@/features/catalog/sale-event-schemas";
import { listTenantSaleEvents, listPublicActiveSaleEvents } from "@/features/catalog/queries/sale-event-administration";
import { createTenantSaleEvent } from "@/features/catalog/services/sale-event-creation";
import { updateTenantSaleEvent, deleteTenantSaleEvent } from "@/features/catalog/services/sale-event-administration";
import type { CreateSaleEventParams, UpdateSaleEventParams } from "@/features/catalog/sale-event-types";

export type { CreateSaleEventParams, UpdateSaleEventParams } from "@/features/catalog/sale-event-types";

function invalidateSaleEventCache(businessSlug: string, social = false) {
  // A committed sale remains successful if cache invalidation is unavailable.
  try { revalidatePath(`/app/${businessSlug}/sale-events`); } catch {}
  try { revalidatePath(`/owner-dashboard-preview/${businessSlug}/sale-events`); } catch {}
  if (social) { try { revalidatePath(`/app/${businessSlug}/social-posts`); } catch {} }
  try { revalidateTag(tenantCacheTags.businessBySlug(businessSlug), "max"); } catch {}
}

export async function getSaleEvents(businessSlug: string) {
  const parsed = businessSlugSchema.safeParse(businessSlug);
  if (!parsed.success) return { success: false as const, error: "Invalid business slug" };
  try {
    const access = await requireSaleEventAccess(parsed.data);
    if (!access.success) return access;
    return { success: true as const, data: await listTenantSaleEvents(access.context) };
  } catch { return { success: false as const, error: "Failed to fetch sale events" }; }
}

export async function getActiveSaleEvents(businessSlug: string) {
  const parsed = businessSlugSchema.safeParse(businessSlug);
  if (!parsed.success) return { success: false as const, error: "Invalid business slug" };
  try { return { success: true as const, data: await listPublicActiveSaleEvents(parsed.data) }; }
  catch { return { success: false as const, error: "Failed to fetch active sale events" }; }
}

export async function createSaleEvent(params: CreateSaleEventParams) {
  const parsed = createSaleEventSchema.safeParse(params);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues.some(issue => issue.message === EMPTY_SALE_SELECTION) ? EMPTY_SALE_SELECTION : "Invalid sale event input." };
  try {
    const access = await requireSaleEventAccess(parsed.data.businessSlug, true);
    if (!access.success) return access;
    await createTenantSaleEvent(access.context, parsed.data);
    invalidateSaleEventCache(access.context.businessSlug, true);
    return { success: true as const };
  } catch (error) { return { success: false as const, error: saleEventClientError(error, "Failed to create sale event") }; }
}

export async function updateSaleEvent(params: UpdateSaleEventParams) {
  const parsed = updateSaleEventSchema.safeParse(params);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues.some(issue => issue.message === EMPTY_SALE_SELECTION) ? EMPTY_SALE_SELECTION : "Invalid sale event input." };
  try {
    const access = await requireSaleEventAccess(parsed.data.businessSlug, true);
    if (!access.success) return access;
    await updateTenantSaleEvent(access.context, parsed.data);
    invalidateSaleEventCache(access.context.businessSlug);
    return { success: true as const };
  } catch (error) { return { success: false as const, error: saleEventClientError(error, "Failed to update sale event") }; }
}

export async function deleteSaleEvent(id: number, businessSlug: string) {
  const parsed = deleteSaleEventSchema.safeParse({ id, businessSlug });
  if (!parsed.success) return { success: false as const, error: "Invalid sale event input." };
  try {
    const access = await requireSaleEventAccess(parsed.data.businessSlug, true);
    if (!access.success) return access;
    await deleteTenantSaleEvent(access.context, parsed.data.id);
    invalidateSaleEventCache(access.context.businessSlug);
    return { success: true as const };
  } catch (error) { return { success: false as const, error: saleEventClientError(error, "Failed to delete sale event") }; }
}
