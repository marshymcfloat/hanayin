import "server-only";

import { z } from "zod";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { ExpenseCategory } from "@/prisma/generated/prisma/enums";

export const expenseIdSchema = z.number().int().positive().max(2147483647);
export const createExpenseSchema = z.object({
  businessSlug: businessSlugSchema,
  amount: z.number().finite().positive("Amount must be greater than 0."),
  category: z.enum(ExpenseCategory),
  description: z.string().max(2000).optional(),
  date: z.date(),
});
export const updateExpenseSchema = createExpenseSchema.extend({ id: expenseIdSchema });
export const deleteExpenseSchema = z.object({ id: expenseIdSchema, businessSlug: businessSlugSchema });
export const expenseQuerySchema = z.object({
  businessSlug: businessSlugSchema,
  options: z.object({
    startDate: z.date().optional(), endDate: z.date().optional(),
    limit: z.number().int().positive().max(1000).optional(),
  }).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate,
    "Start date must not be after end date.").optional(),
});

export type ValidatedExpenseInput = z.infer<typeof createExpenseSchema>;
export type ExpenseQueryOptions = NonNullable<z.infer<typeof expenseQuerySchema>["options"]>;
