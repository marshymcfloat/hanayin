import type { z } from "zod";
import type { createEmployeeSchema } from "@/features/workforce/employee-create-schema";
export type EmployeeCreateInput = z.input<typeof createEmployeeSchema>;
export type EmployeeUpdateInput = Partial<EmployeeCreateInput> & { expectedFinancialRevision?: number };
export type EmployeeScheduleRow = { day_of_week: number; start_time: string; end_time: string };
export type EmployeeAdministrationIdentity = { businessSlug: string; userId: string };
