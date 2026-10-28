import "server-only";
import { z } from "zod";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { packageChoicesSchema } from "@/features/catalog/offer-definitions";

export const packageIdSchema = z.number().int().positive().max(2147483647);
const priceSchema = z.number().finite().nonnegative().max(2147483647);
const itemSchema = z.object({ serviceId: packageIdSchema, customPrice: priceSchema });
export const packageDetailsSchema = z.object({
  choices: packageChoicesSchema.optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  price: priceSchema,
  duration: z.number().int().nonnegative().max(2147483647).optional(),
  category: z.string().min(1).max(200),
  items: z.array(itemSchema).max(100).refine(
    items => new Set(items.map(item => item.serviceId)).size === items.length,
    "A service may occur only once in a package.",
  ),
});
export const createPackageSchema = packageDetailsSchema.extend({ businessSlug: businessSlugSchema });
export type PackageDetails = z.infer<typeof packageDetailsSchema>;
export type CreatePackageInput = z.infer<typeof createPackageSchema>;
