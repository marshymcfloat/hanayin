import "server-only";
import { z } from "zod";
import { SUBSCRIPTION_PLAN_CODES } from "@/features/billing/subscription-service";

export const ownerInvoiceReasonSchema = z.string().min(1).max(120);
export const ownerPlanUpgradeSchema = z.object({
  targetPlanCode: z.enum(SUBSCRIPTION_PLAN_CODES),
  note: z.string().trim().max(1000).optional(),
});
export const ownerManualPaymentSchema = z.object({
  invoiceId: z.string().min(1).max(200),
  paymentReference: z.string().trim().min(2).max(120),
  amountCentavos: z.number().int().positive().max(1_000_000_000).optional(),
  note: z.string().trim().max(1000).optional(),
  proofUrl: z.string().trim().url().max(2000).optional(),
});
export type OwnerPlanUpgradeInput = z.infer<typeof ownerPlanUpgradeSchema>;
export type OwnerManualPaymentInput = z.infer<typeof ownerManualPaymentSchema>;
