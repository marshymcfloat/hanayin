import type { Prisma } from "@/prisma/generated/prisma/client";

// Explicit legacy scalar DTO: no customer, credentials, or future relation fields.
export const ownerServiceSelect = {
  id: true, price: true, estimated_cost: true, discount: true, discount_reason: true,
  final_price: true, commission_base: true, status: true, claimed_at: true, served_at: true,
  completed_at: true, cancelled_at: true, booking_id: true, service_id: true, package_id: true,
  served_by_id: true, served_by_owner_id: true, served_by_type: true, scheduled_at: true,
  estimated_end: true, paid_in_payslip_id: true, created_at: true, updated_at: true,
} as const satisfies Prisma.AvailedServiceSelect;
