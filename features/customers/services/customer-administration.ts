import "server-only";
import { prisma } from "@/prisma/prisma";
import type { CustomerActorContext } from "@/features/customers/customer-access";
import { customerBusinessWhere } from "@/features/customers/customer-access";
import type { CustomerProfileInput } from "@/features/customers/customer-schemas";
import { customerScalarSelect } from "@/features/customers/customer-select";
export class CustomerAdministrationError extends Error {}
const options = { isolationLevel: "Serializable" as const, maxWait: 5000, timeout: 10000 };
export async function createTenantCustomer(context: CustomerActorContext, input: CustomerProfileInput) {
  return prisma.$transaction(async tx => {
    if (!await tx.business.findFirst({ where: customerBusinessWhere(context), select: { id: true } })) throw new CustomerAdministrationError("Forbidden");
    return tx.customer.create({ data: { name: input.name, email: input.email, phone: input.phone, business_id: context.businessId }, select: customerScalarSelect });
  }, options);
}
export async function updateTenantCustomer(context: CustomerActorContext, id: string, input: CustomerProfileInput) {
  return prisma.$transaction(async tx => {
    const where = { id, business_id: context.businessId, business: customerBusinessWhere(context) };
    const updated = await tx.customer.updateMany({ where, data: { name: input.name, email: input.email, phone: input.phone } });
    if (updated.count !== 1) throw new CustomerAdministrationError("Customer not found or unauthorized");
    const customer = await tx.customer.findFirst({ where, select: customerScalarSelect });
    if (!customer) throw new CustomerAdministrationError("Failed to load updated customer");
    return customer;
  }, options);
}
export async function deleteTenantCustomer(context: CustomerActorContext, id: string) {
  const result = await prisma.customer.deleteMany({ where: { id, business_id: context.businessId, business: customerBusinessWhere(context) } });
  if (result.count !== 1) throw new CustomerAdministrationError("Customer not found or unauthorized");
}
export function customerMutationError(error: unknown, fallback: string) {
  if (error instanceof CustomerAdministrationError) return error.message;
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") return "Customer changed. Please refresh and try again.";
  return fallback;
}
