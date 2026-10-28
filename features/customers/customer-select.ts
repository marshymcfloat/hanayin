import type { Prisma } from "@/prisma/generated/prisma/client";
export const customerScalarSelect = {
  id: true, name: true, email: true, phone: true, trust_tier: true,
  no_show_count: true, last_no_show_at: true, business_id: true,
  is_demo: true, created_at: true, updated_at: true,
} satisfies Prisma.CustomerSelect;
