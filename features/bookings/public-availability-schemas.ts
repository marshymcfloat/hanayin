import { z } from "zod";
import { businessSlugSchema } from "@/lib/validation/business-slug";

export const MAX_PUBLIC_CAPACITY_DAYS = 90;
const date = z.date().min(new Date("1000-01-01T00:00:00Z")).max(new Date("9998-12-31T23:59:59Z"));
const category = z.string().min(1).max(200);
const services = z.array(z.object({
  id: z.number().int().positive().max(2_147_483_647),
  quantity: z.number().int().min(1).max(100).optional(),
})).max(100);
const base = z.object({ businessSlug: businessSlugSchema, services });

export const availableSlotsSchema = base.extend({ date, slotIntervalMinutes: z.number().int().min(5).max(1440).optional() });
export const dayCapacitySchema = base.extend({ fromDate: date, toDate: date }).refine(value => value.toDate >= value.fromDate);
export const alternativeSlotsSchema = base.extend({ scheduledAt: date, limit: z.number().int().min(1).max(50).default(6) });
export const availableProvidersSchema = z.object({ businessSlug: businessSlugSchema, startTime: date, endTime: date, category: category.default("GENERAL"), categories: z.array(category).max(100).optional() }).refine(value => value.endTime > value.startTime && value.endTime.getTime() - value.startTime.getTime() <= 31 * 86_400_000);
export const categoryAvailabilitySchema = z.object({ businessSlug: businessSlugSchema, category: category.default("GENERAL"), date: date.optional() });

export type AvailableSlotsInput = z.input<typeof availableSlotsSchema>;
export type DayCapacityInput = z.input<typeof dayCapacitySchema>;
export type AlternativeSlotsInput = z.input<typeof alternativeSlotsSchema>;
export type AvailableProvidersInput = z.input<typeof availableProvidersSchema>;
export type CategoryAvailabilityInput = z.input<typeof categoryAvailabilitySchema>;

export function parsePublicAvailability<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error("Invalid input");
  return result.data;
}
