import { z } from "zod";

export const attendanceCountSchema = z.object({
  employeeId: z.number().int().positive(),
  startDate: z.date(),
  endDate: z.date(),
}).refine((input) => input.startDate <= input.endDate, { message: "Invalid date range" });
