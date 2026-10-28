import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";

export const serviceCatalogSelect = {
  id: true, name: true, description: true, price: true, estimated_cost: true,
  duration: true, category: true, business_id: true, is_demo: true,
  created_at: true, updated_at: true,
} as const satisfies Prisma.ServiceSelect;

export const serviceCatalogFlowSelect = {
  id: true, trigger_service_id: true, suggested_service_id: true,
  delay_duration: true, delay_unit: true, type: true, business_id: true,
  created_at: true, updated_at: true,
  suggested_service: { select: serviceCatalogSelect },
} as const satisfies Prisma.ServiceFlowSelect;
