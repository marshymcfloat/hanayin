import { z } from "zod";

export const bookingPreviewDateSchema = z.iso.date().refine((value) => {
  const parsed = new Date(`${value}T12:00:00+08:00`);
  return !Number.isNaN(parsed.getTime()) && new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(parsed) === value;
}, "Invalid date");

export const bookingPreviewFilterSchema = z.object({
  date: bookingPreviewDateSchema.optional(),
  status: z.enum(["ALL", "HOLD", "ACCEPTED", "COMPLETED", "CANCELLED"]).default("ALL"),
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export type BookingPreviewFilters = z.infer<typeof bookingPreviewFilterSchema>;

export function bookingPreviewDayBounds(date: string) {
  const start = new Date(`${date}T00:00:00+08:00`);
  return { gte: start, lt: new Date(start.getTime() + 86_400_000) };
}
