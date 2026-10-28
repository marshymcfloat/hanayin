import "server-only";
import { z } from "zod";

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const businessHoursInputSchema = z.array(z.object({
  day_of_week: z.number().int().min(0).max(6),
  open_time: time,
  close_time: time,
  is_closed: z.boolean(),
  category: z.string().min(1).max(200),
})).max(500);

export const businessHoursSaveOptionsSchema = z.object({
  expectedHours: businessHoursInputSchema,
  resetCategories: z.array(z.string().min(1).max(200).refine(value => value.toLowerCase() !== "general")).max(100),
});
