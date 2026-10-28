"use server";

import { requireAuth } from "@/lib/auth/guards";
import { requireStaffPermission, resolveTenantActorContext } from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { revalidatePath, revalidateTag } from "next/cache";
import { tenantCacheTags } from "@/lib/data/cached";
import { createServiceInputSchema, updateServiceInputSchema, serviceIdSchema } from "@/features/catalog/service-administration-schemas";
import type { CreateServiceInput, UpdateServiceInput } from "@/features/catalog/service-administration-schemas";
import { createTenantCatalogService, updateTenantCatalogService, deleteTenantCatalogService, serviceAdministrationError } from "@/features/catalog/services/service-administration";
import { listTenantCatalogServices, listTenantServiceCategories } from "@/features/catalog/queries/service-catalog";

function invalidateServices(slug: string, businessId: string) {
  for (const path of [
    `/app/${slug}/services`,
    `/owner-dashboard-preview/${slug}/services`,
  ]) {
    try { revalidatePath(path); } catch { /* Persistence already committed. */ }
  }
  try { revalidateTag(tenantCacheTags.servicesByBusiness(businessId), "max"); } catch { /* Persistence already committed. */ }
}

export async function getServicesAction() {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth;
    if (!auth.session.user.id) return { success: false as const, error: "Unauthorized" };
    const actor = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!actor.success) return actor;
    return { success: true as const, data: await listTenantCatalogServices(actor) };
  } catch {
    return { success: false as const, error: "Failed to fetch services" };
  }
}

export async function createServiceAction(data: CreateServiceInput) {
  const parsed = createServiceInputSchema.safeParse(data);
  if (!parsed.success) return { success: false as const, error: "Invalid input" };
  try {
    const sessionAuth = await requireAuth();
    if (!sessionAuth.success) return sessionAuth;
    const auth = await requireStaffPermission(sessionAuth.businessSlug, StaffPermission.CATALOG_MANAGE, { write: true });
    if (!auth.success) return auth;
    const service = await createTenantCatalogService(auth.context, parsed.data);
    invalidateServices(auth.context.businessSlug, auth.context.businessId);
    return { success: true as const, data: service };
  } catch (error) {
    return { success: false as const, error: serviceAdministrationError(error, "Failed to create service") };
  }
}

export async function updateServiceAction(serviceId: number, data: UpdateServiceInput) {
  const id = serviceIdSchema.safeParse(serviceId);
  const parsed = updateServiceInputSchema.safeParse(data);
  if (!id.success || !parsed.success) return { success: false as const, error: "Invalid input" };
  try {
    const sessionAuth = await requireAuth();
    if (!sessionAuth.success) return sessionAuth;
    const auth = await requireStaffPermission(sessionAuth.businessSlug, StaffPermission.CATALOG_MANAGE, { write: true });
    if (!auth.success) return auth;
    const service = await updateTenantCatalogService(auth.context, id.data, parsed.data);
    invalidateServices(auth.context.businessSlug, auth.context.businessId);
    return { success: true as const, data: service };
  } catch (error) {
    return { success: false as const, error: serviceAdministrationError(error, "Failed to update service") };
  }
}

export async function deleteServiceAction(serviceId: number) {
  const id = serviceIdSchema.safeParse(serviceId);
  if (!id.success) return { success: false as const, error: "Invalid input" };
  try {
    const sessionAuth = await requireAuth();
    if (!sessionAuth.success) return sessionAuth;
    const auth = await requireStaffPermission(sessionAuth.businessSlug, StaffPermission.CATALOG_MANAGE, { write: true });
    if (!auth.success) return auth;
    const deleted = await deleteTenantCatalogService(auth.context, id.data);
    invalidateServices(auth.context.businessSlug, auth.context.businessId);
    return { success: true as const, data: deleted };
  } catch (error) {
    return { success: false as const, error: serviceAdministrationError(error, "Failed to delete service") };
  }
}

export async function getServiceCategoriesAction() {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth;
    if (!auth.session.user.id) return { success: false as const, error: "Unauthorized" };
    const actor = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!actor.success) return actor;
    return { success: true as const, data: await listTenantServiceCategories(actor) };
  } catch {
    return { success: false as const, error: "Failed to fetch categories" };
  }
}
