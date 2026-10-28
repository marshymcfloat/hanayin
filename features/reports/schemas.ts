import { z } from "zod";

export const reportFiltersSchema = z.object({
  preset: z.string().max(32).optional(),
  start: z.string().max(32).optional(),
  end: z.string().max(32).optional(),
  groupBy: z.string().max(32).optional(),
}).default({});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const ownerPreviewReportQuerySchema = z.object({
  tab: z.enum(["overview", "revenue", "customers", "operations", "expenses"]).default("overview"),
  preset: z.enum(["7d", "30d", "90d"]).default("30d"),
  groupBy: z.enum(["day", "week", "month"]).default("day"),
}).strict();
