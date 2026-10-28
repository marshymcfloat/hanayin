import { z } from "zod";
import { eligibilitySchema, openingSchema, dateOnly } from "./schemas";

export const eligibilityHistorySchema = z.array(z.object({ from: dateOnly, region: z.string(), category: z.string(), eligibility: eligibilitySchema }));
export function eligibilityAt(history: unknown, date: string) {
  const parsed = eligibilityHistorySchema.safeParse(history);
  return parsed.success ? [...parsed.data].filter(entry => entry.from <= date).sort((a, b) => b.from.localeCompare(a.from))[0] : undefined;
}
export function openingForYear(history: unknown, current: unknown, year: number) {
  const records = history && typeof history === "object" && !Array.isArray(history) ? history as Record<string, unknown> : {};
  const live = openingSchema.safeParse(current);
  return openingSchema.safeParse(live.success && live.data.year === year ? live.data : records[String(year)]);
}
