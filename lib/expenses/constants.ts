import { ExpenseCategory } from "@/prisma/generated/prisma/enums";

export type CreateExpenseParams = {
  businessSlug: string;
  amount: number;
  category: ExpenseCategory;
  description?: string;
  date: Date;
};

export type UpdateExpenseParams = {
  id: number;
  businessSlug: string;
  amount: number;
  category: ExpenseCategory;
  description?: string;
  date: Date;
};

export type ExpenseView = {
  id: number;
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  date: Date;
  created_at: Date;
  created_by_name: string | null;
};

export type ExpenseSummaryByCategory = {
  category: ExpenseCategory;
  total: number;
  count: number;
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  SUPPLIES: "Supplies",
  UTILITIES: "Utilities",
  RENT: "Rent",
  EQUIPMENT: "Equipment",
  MARKETING: "Marketing",
  MAINTENANCE: "Maintenance",
  PROFESSIONAL: "Professional",
  MISCELLANEOUS: "Miscellaneous",
};
