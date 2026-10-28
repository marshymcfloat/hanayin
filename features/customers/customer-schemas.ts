import { z } from "zod";
export const customerIdSchema = z.string().trim().min(1).max(191);
export const customerSearchSchema = z.string().max(200).transform(value => value.trim());
export const customerProfileSchema = z.object({
  name: z.string().min(1).max(200).refine(value => value.trim().length > 0),
  email: z.string().max(320).optional(),
  phone: z.string().max(50).optional(),
});
export const customerDuplicateSchema = customerProfileSchema.extend({ name: z.string().max(200) });
export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;
