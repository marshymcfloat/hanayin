import "server-only";

import { z } from "zod";
import { businessSlugSchema } from "@/lib/validation/business-slug";

export const giftCardIdSchema = z.number().int().positive().max(2147483647);

const giftCardDateSchema = z
  .union([z.date(), z.string().min(1).max(64)])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .refine((value) => !Number.isNaN(value.getTime()), "Invalid expiry date");

const optionalEmailSchema = z
  .union([z.string().trim().email().max(320), z.literal(""), z.null()])
  .optional();
const optionalPhoneSchema = z
  .union([z.string().trim().min(1).max(50), z.literal(""), z.null()])
  .optional();
const catalogIdsSchema = z
  .array(giftCardIdSchema)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate catalog item");

export const giftCardWriteSchema = z
  .object({
    code: z.string().trim().min(1).max(200),
    customer_name: z.string().trim().min(1).max(200),
    customer_email: optionalEmailSchema,
    customer_phone: optionalPhoneSchema,
    expires_at: giftCardDateSchema,
    service_ids: catalogIdsSchema,
    package_ids: catalogIdsSchema,
  })
  .refine(
    (input) => Boolean(input.customer_email || input.customer_phone),
    "A recipient email or phone is required",
  )
  .refine(
    (input) => input.service_ids.length > 0 || input.package_ids.length > 0,
    "At least one service or package is required",
  );

export const giftCardListSchema = businessSlugSchema;
