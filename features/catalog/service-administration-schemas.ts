import "server-only";
import { z } from "zod";

export const serviceIdSchema = z.number().int().positive().max(2147483647);
const nonnegativeInteger = z.number().int().nonnegative().max(2147483647);
const amount = z.number().finite().nonnegative().max(1e12);
const flowSchema = z.object({
  suggested_service_id: serviceIdSchema,
  delay_duration: nonnegativeInteger,
  delay_unit: z.enum(["DAYS", "WEEKS", "MONTHS"]),
  type: z.enum(["REQUIRED", "SUGGESTED"]),
});
export const createServiceInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  price: amount,
  estimated_cost: amount.optional(),
  duration: nonnegativeInteger.optional(),
  category: z.string().min(1).max(200),
  flows: z.array(flowSchema).max(100).optional(),
});
export const updateServiceInputSchema = createServiceInputSchema.partial();

export type CreateServiceInput = z.infer<typeof createServiceInputSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceInputSchema>;
