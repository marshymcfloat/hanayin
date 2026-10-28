"use server";
import { revalidatePath } from "next/cache";
import { requireCustomerAccess } from "@/features/customers/customer-access";
import { customerIdSchema, customerProfileSchema, customerSearchSchema, customerDuplicateSchema } from "@/features/customers/customer-schemas";
import { searchTenantCustomers, findTenantDuplicateCustomer, getTenantCustomerHistory } from "@/features/customers/queries/customer-administration";
import { createTenantCustomer, updateTenantCustomer, deleteTenantCustomer, customerMutationError } from "@/features/customers/services/customer-administration";
export type { CustomerSearchHit, CustomerFlowStatus, CustomerBookingHistoryItem, CustomerHistoryData } from "@/features/customers/customer-types";
function invalidateCustomerPage(slug: string) {
  try { revalidatePath(`/app/${slug}/customers`); } catch { /* The write committed; do not invite retries after cache failure. */ }
}
export async function searchCustomer(query: string, businessSlug: string) {
  void businessSlug;
  const parsed = customerSearchSchema.safeParse(query);
  if (!parsed.success) return { success: false as const, error: "Invalid customer search" };
  try {
    const access = await requireCustomerAccess();
    if (!access.success) return access;
    return await searchTenantCustomers(access.context, parsed.data);
  } catch { return { success: false as const, error: "Failed to search customers" }; }
}
export async function findDuplicateCustomerForBooking(input: { name: string; email?: string; phone?: string }) {
  const parsed = customerDuplicateSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Invalid customer details" };
  try {
    const access = await requireCustomerAccess();
    if (!access.success) return access;
    return await findTenantDuplicateCustomer(access.context, parsed.data);
  } catch { return { success: false as const, error: "Failed to check for duplicates" }; }
}
export async function createCustomer(data: { businessSlug: string; name: string; email?: string; phone?: string }) {
  const parsed = customerProfileSchema.safeParse(data);
  if (!parsed.success) return { success: false as const, error: "Invalid customer details" };
  try {
    const access = await requireCustomerAccess(true);
    if (!access.success) return access;
    const customer = await createTenantCustomer(access.context, parsed.data);
    invalidateCustomerPage(access.context.businessSlug);
    return { success: true as const, data: customer };
  } catch (error) { return { success: false as const, error: customerMutationError(error, "Failed to create customer") }; }
}
export async function updateCustomer(id: string, data: { name: string; email?: string; phone?: string; businessSlug: string }) {
  const parsedId = customerIdSchema.safeParse(id);
  const parsed = customerProfileSchema.safeParse(data);
  if (!parsed.success || !parsedId.success) return { success: false as const, error: "Invalid customer details" };
  try {
    const access = await requireCustomerAccess(true);
    if (!access.success) return access;
    const customer = await updateTenantCustomer(access.context, parsedId.data, parsed.data);
    invalidateCustomerPage(access.context.businessSlug);
    return { success: true as const, data: customer };
  } catch (error) { return { success: false as const, error: customerMutationError(error, "Failed to update customer") }; }
}
export async function deleteCustomer(id: string) {
  const parsed = customerIdSchema.safeParse(id);
  if (!parsed.success) return { success: false as const, error: "Invalid customer ID" };
  try {
    const access = await requireCustomerAccess(true);
    if (!access.success) return access;
    await deleteTenantCustomer(access.context, parsed.data);
    invalidateCustomerPage(access.context.businessSlug);
    return { success: true as const };
  } catch (error) { return { success: false as const, error: customerMutationError(error, "Failed to delete customer") }; }
}
export async function getCustomerHistory(customerId: string) {
  const parsed = customerIdSchema.safeParse(customerId);
  if (!parsed.success) return { success: false as const, error: "Invalid customer ID" };
  try {
    const access = await requireCustomerAccess();
    if (!access.success) return access;
    return await getTenantCustomerHistory(access.context, parsed.data);
  } catch { return { success: false as const, error: "Failed to fetch customer history" }; }
}
