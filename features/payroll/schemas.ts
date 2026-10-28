import { z } from "zod";

export const payrollEmployeeIdSchema = z.number().int().positive();
export const createPayslipSchema = z.object({
  employeeId: payrollEmployeeIdSchema,
  deduction: z.preprocess(
    (value) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0,
    z.number().nonnegative(),
  ),
  comment: z.string().max(2000).optional(),
});
