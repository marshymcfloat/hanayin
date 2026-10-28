import { z } from "zod";
import { createEmployeeSchema } from "@/features/workforce/employee-create-schema";

export const employeeAdministrationIdSchema = z.number().int().positive().max(2_147_483_647);
export const employeeUpdateInputSchema = z.object({ employeeId: employeeAdministrationIdSchema, data: createEmployeeSchema.partial().extend({ expectedFinancialRevision: z.number().int().nonnegative().optional() }) });
export const employeePasswordResetInputSchema = z.object({ employeeId: employeeAdministrationIdSchema, newPassword: z.string().min(1).max(1024) });
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times must be in HH:MM 24h format.");
const row = z.object({ day_of_week: z.number({ error: "Invalid day of week." }).int("Invalid day of week.").min(0, "Invalid day of week.").max(6, "Invalid day of week."), start_time: time, end_time: time }).refine(value => value.start_time !== value.end_time, "Start and end can't be the same time.");
export const employeeScheduleInputSchema = z.object({ employeeId: employeeAdministrationIdSchema, rows: z.array(row).max(1000) }).superRefine((value, ctx) => {
  for (let day = 0; day <= 6; day++) {
    const ranges = value.rows.filter(range => range.day_of_week === day && range.start_time < range.end_time).sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (let index = 1; index < ranges.length; index++) {
      if (ranges[index].start_time < ranges[index - 1].end_time) { ctx.addIssue({ code: "custom", message: "Time ranges overlap on the same day.", path: ["rows"] }); return; }
    }
  }
});
