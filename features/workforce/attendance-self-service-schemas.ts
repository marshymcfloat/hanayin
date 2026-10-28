import { z } from "zod";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { getEndOfDayPH, getMonthRangePH, getStartOfDayPH } from "@/lib/date-utils";

const employeeId = z.number().int().positive().max(2_147_483_647);
const date = z.date().refine(value => {
  try { return Number.isFinite(getStartOfDayPH(value).getTime()) && Number.isFinite(getEndOfDayPH(value).getTime()); }
  catch { return false; }
});
export const attendanceStatusInputSchema = z.object({ employeeId, date });
export const attendanceMonthlyInputSchema = z.object({ employeeId, year: z.number().int().min(1).max(9999), month: z.number().int().min(0).max(11) }).refine(value => {
  const range = getMonthRangePH(value.year, value.month);
  return Number.isFinite(range.startDate.getTime()) && Number.isFinite(range.endDate.getTime());
});
export const attendanceClockInputSchema = z.object({ employeeId, latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), businessSlug: businessSlugSchema });
export type AttendanceStatusInput = z.infer<typeof attendanceStatusInputSchema>;
export type AttendanceMonthlyInput = z.infer<typeof attendanceMonthlyInputSchema>;
export type AttendanceClockInput = z.infer<typeof attendanceClockInputSchema>;
