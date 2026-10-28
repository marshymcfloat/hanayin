import "server-only";
import { z } from "zod";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { SOCIAL_IMAGE_PROFILES } from "@/lib/services/social/image-profiles";
import { DiscountType, SocialPlatform } from "@/prisma/generated/prisma/enums";
import { conditionalSaleSchema, type ConditionalSale } from "@/features/catalog/offer-definitions";

export const saleEventIdSchema = z.number().int().positive().max(2147483647);
export const EMPTY_SALE_SELECTION = "Select at least one service or package for this sale event.";
const selections = z.array(saleEventIdSchema).max(100).transform(ids => Array.from(new Set(ids)));
const saleDate = z.date().min(new Date("0001-01-01T00:00:00.000Z")).max(new Date("9999-12-31T23:59:59.999Z"));
const details = {
  conditionalRule: conditionalSaleSchema.nullable().optional(), expectedRevision: z.number().int().nonnegative().optional(),
  businessSlug: businessSlugSchema, title: z.string().trim().min(1).max(200),
  description: z.string().max(10000).optional(), startDate: saleDate, endDate: saleDate,
  discountType: z.enum(DiscountType), discountValue: z.number().finite().nonnegative().max(1e12),
  serviceIds: selections, packageIds: selections,
};
const refineDetails = (input: { startDate: Date; endDate: Date; discountType: DiscountType; discountValue: number; serviceIds: number[]; packageIds: number[]; conditionalRule?: ConditionalSale | null }, ctx: z.RefinementCtx) => {
  if (input.endDate < input.startDate) ctx.addIssue({ code: "custom", message: "End date must not precede start date.", path: ["endDate"] });
  if (input.discountType === DiscountType.PERCENTAGE && input.discountValue > 100) ctx.addIssue({ code: "custom", message: "Percentage discount must be between 0 and 100.", path: ["discountValue"] });
  if (!input.conditionalRule && !input.serviceIds.length && !input.packageIds.length) ctx.addIssue({ code: "custom", message: EMPTY_SALE_SELECTION, path: ["serviceIds"] });
  if (input.conditionalRule && (input.serviceIds.length || input.packageIds.length)) ctx.addIssue({ code: "custom", message: "Book together uses its two service groups, not standard sale selections.", path: ["serviceIds"] });
};
export const createSaleEventSchema = z.object({
  ...details, createSocialDraft: z.boolean().optional(),
  targetPlatforms: z.array(z.enum(SocialPlatform)).max(10).transform(values => Array.from(new Set(values))).optional(),
  socialCaptionOverride: z.string().max(10000).optional(),
  socialMediaUrl: z.union([z.literal(""), z.url().max(2048).refine(value => new URL(value).protocol === "https:", "Media URL must use HTTPS.")]).optional(),
  socialImageProfile: z.enum(SOCIAL_IMAGE_PROFILES).optional(), socialImageDirection: z.string().max(2000).optional(),
  slotLimit: z.number().int().positive().max(2147483647).nullable().optional(),
}).superRefine(refineDetails);
export const updateSaleEventSchema = z.object({ ...details, id: saleEventIdSchema, slotLimit: z.number().int().positive().max(2147483647).nullable().optional() }).superRefine(refineDetails);
export const deleteSaleEventSchema = z.object({ id: saleEventIdSchema, businessSlug: businessSlugSchema });
export type CreateSaleEventInput = z.infer<typeof createSaleEventSchema>;
export type UpdateSaleEventInput = z.infer<typeof updateSaleEventSchema>;
