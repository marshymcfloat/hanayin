import { z } from "zod";
import {
  GCASH_REJECTION_REASONS,
  GCASH_RESOLUTION_OUTCOMES,
} from "@/lib/types/manual-gcash";

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const cleaned = value?.trim().replace(/\s+/g, " ").slice(0, max);
      return cleaned || null;
    });

export const gcashBusinessSlugSchema = z.string().trim().min(1).max(120);

export const submitGcashPaymentSchema = z.object({
  bookingId: z.number().int(),
  businessSlug: gcashBusinessSlugSchema,
  token: z.string(),
  payerName: optionalText(100),
  reference: optionalText(80).transform((value) => value?.toUpperCase() ?? null),
});

export const approveGcashPaymentSchema = z.object({
  paymentId: z.number().int(),
  businessSlug: gcashBusinessSlugSchema,
  source: z.enum([
    "CUSTOMER_SUBMITTED",
    "OWNER_VERIFIED_WITHOUT_SUBMISSION",
  ]),
  attestation: z.object({
    transactionFound: z.literal(true),
    recipientMatched: z.literal(true),
    amountMatched: z.literal(true),
    detailsReviewed: z.literal(true),
  }),
});

export const rejectGcashPaymentSchema = z.object({
  paymentId: z.number().int(),
  businessSlug: gcashBusinessSlugSchema,
  reason: z.enum(GCASH_REJECTION_REASONS),
  internalNote: optionalText(500),
});

export const escalateGcashPaymentSchema = z.object({
  paymentId: z.number().int(),
  businessSlug: gcashBusinessSlugSchema,
  reason: z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, " ").slice(0, 240))
    .pipe(z.string().min(1)),
});

export const resolveGcashFollowUpSchema = z.object({
  paymentId: z.number().int(),
  businessSlug: gcashBusinessSlugSchema,
  outcome: z.enum(GCASH_RESOLUTION_OUTCOMES),
  note: optionalText(500),
});
