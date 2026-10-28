import { z } from "zod";
import { StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contact_number: z.string().min(1).max(50),
  daily_rate: z.number().finite().nonnegative(),
  commission_percentage: z.number().finite().min(0).max(100),
  profile: z.enum(StaffProfile).optional(),
  permissions: z.array(z.enum(StaffPermission)).max(100).optional(),
  specialties: z.array(z.string().min(1).max(100)).max(100).optional(),
  recurring_days_off: z.array(z.number().finite()).max(100).optional(),
  employment_start: z.iso.date({ error: "Enter a valid Joined on date." }).nullable().optional(),
});
