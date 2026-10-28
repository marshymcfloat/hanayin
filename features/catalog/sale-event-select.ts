import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
export const saleEventSelect = {
  id: true, title: true, description: true, start_date: true, end_date: true,
  discount_type: true, discount_value: true, slot_limit: true, business_id: true,
  created_at: true, updated_at: true, revision: true, conditional_rule: true,
} as const satisfies Prisma.SaleEventSelect;
export const saleEventPackageSelect = {
  id: true, name: true, description: true, price: true, duration: true,
  category: true, business_id: true, created_at: true, updated_at: true,
} as const satisfies Prisma.ServicePackageSelect;
