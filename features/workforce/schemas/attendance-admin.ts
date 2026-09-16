import { z } from "zod";

import { AttendanceStatus } from "@/prisma/generated/prisma/enums";

export const attendanceDateSchema = z
  .date()
  .refine((date) => !Number.isNaN(date.getTime()), "Invalid date");

export const dailyAttendanceInputSchema = z.object({
  businessId: z.string().min(1),
  date: attendanceDateSchema,
});

export const employeeAttendanceInputSchema = z.object({
  employeeId: z.number().int().positive(),
});

export const attendanceImpactInputSchema = employeeAttendanceInputSchema.extend(
  {
    date: attendanceDateSchema,
  },
);

export const updateAttendanceInputSchema = attendanceImpactInputSchema.extend({
  status: z.nativeEnum(AttendanceStatus),
});
