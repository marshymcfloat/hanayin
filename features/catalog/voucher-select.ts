import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
export const voucherSelect = {
  id: true, code: true, value: true, type: true, minimum_amount: true,
  expires_at: true, is_active: true, used_by_id: true, business_id: true,
  created_at: true, updated_at: true,
} satisfies Prisma.VoucherSelect;
export const publicVoucherSelect = {
  id: true, code: true, value: true, type: true, minimum_amount: true,
  expires_at: true, is_active: true, used_by_id: true,
} satisfies Prisma.VoucherSelect;
