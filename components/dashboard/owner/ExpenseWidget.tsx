"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Zap,
  Home,
  Wrench,
  Megaphone,
  Settings,
  GraduationCap,
  MoreHorizontal,
  Plus,
  Receipt,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createExpense } from "@/features/payroll/actions/expenses";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses/constants";
import type { ExpenseView } from "@/lib/expenses/constants";
import { ExpenseCategory } from "@/prisma/generated/prisma/enums";

const CATEGORY_ICONS: Record<ExpenseCategory, React.ElementType> = {
  SUPPLIES: ShoppingCart,
  UTILITIES: Zap,
  RENT: Home,
  EQUIPMENT: Wrench,
  MARKETING: Megaphone,
  MAINTENANCE: Settings,
  PROFESSIONAL: GraduationCap,
  MISCELLANEOUS: MoreHorizontal,
};

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  SUPPLIES: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100",
  UTILITIES: "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100",
  RENT: "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100",
  EQUIPMENT: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100",
  MARKETING: "bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100",
  MAINTENANCE: "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100",
  PROFESSIONAL: "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100",
  MISCELLANEOUS: "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100",
};

const CATEGORY_COLORS_SELECTED: Record<ExpenseCategory, string> = {
  SUPPLIES: "bg-blue-500 border-blue-500 text-white",
  UTILITIES: "bg-yellow-500 border-yellow-500 text-white",
  RENT: "bg-purple-500 border-purple-500 text-white",
  EQUIPMENT: "bg-orange-500 border-orange-500 text-white",
  MARKETING: "bg-pink-500 border-pink-500 text-white",
  MAINTENANCE: "bg-slate-500 border-slate-500 text-white",
  PROFESSIONAL: "bg-indigo-500 border-indigo-500 text-white",
  MISCELLANEOUS: "bg-gray-500 border-gray-500 text-white",
};

function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ExpenseWidget({
  businessSlug,
  initialTotal,
  initialExpenses,
}: {
  businessSlug: string;
  initialTotal: number;
  initialExpenses: ExpenseView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>(ExpenseCategory.SUPPLIES);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayLocalDate());
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setAmount("");
    setCategory(ExpenseCategory.SUPPLIES);
    setDescription("");
    setDate(todayLocalDate());
    setError(null);
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid amount greater than 0.");
      return;
    }

    startTransition(async () => {
      const result = await createExpense({
        businessSlug,
        amount: parsed,
        category,
        description: description.trim() || undefined,
        date: new Date(date + "T00:00:00"),
      });

      if (!result.success) {
        setError("error" in result ? (result.error ?? "Failed to log expense.") : "Failed to log expense.");
        return;
      }

      setOpen(false);
      resetForm();
      router.refresh();
    });
  }

  const categories = Object.values(ExpenseCategory);

  return (
    <>
      {/* Widget card */}
      <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-red-50 flex items-center justify-center">
              <Receipt className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-sm font-semibold text-foreground">Today&apos;s Expenses</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs gap-1.5 cursor-pointer"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Log
          </Button>
        </div>

        {/* Total */}
        <div className="mb-4">
          <p className="text-2xl font-bold tabular-nums text-foreground leading-none">
            {formatAmount(initialTotal)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {initialExpenses.length === 0
              ? "No expenses logged today"
              : `${initialExpenses.length} entr${initialExpenses.length === 1 ? "y" : "ies"} today`}
          </p>
        </div>

        {/* Recent entries */}
        {initialExpenses.length > 0 ? (
          <div className="space-y-2">
            {initialExpenses.slice(0, 3).map((expense) => {
              const Icon = CATEGORY_ICONS[expense.category];
              return (
                <div
                  key={expense.id}
                  className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2"
                >
                  <div className="h-7 w-7 rounded-lg bg-background border border-border flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-foreground truncate">
                      {EXPENSE_CATEGORY_LABELS[expense.category]}
                      {expense.description && (
                        <span className="font-normal text-muted-foreground">
                          {" "}· {expense.description}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(expense.date).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        timeZone: "Asia/Manila",
                      })}
                    </p>
                  </div>
                  <p className="text-[11px] font-bold text-foreground tabular-nums shrink-0">
                    {formatAmount(expense.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">
              No expenses logged today
            </p>
          </div>
        )}
      </div>

      {/* Log Expense Dialog */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Log Expense
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="expense-amount" className="text-xs font-semibold">
                Amount (₱) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="expense-amount"
                type="number"
                min="1"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                className="text-sm"
                autoFocus
              />
            </div>

            {/* Category picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <div className="grid grid-cols-4 gap-2">
                {categories.map((cat) => {
                  const Icon = CATEGORY_ICONS[cat];
                  const isSelected = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 transition-all duration-150 cursor-pointer",
                        isSelected
                          ? CATEGORY_COLORS_SELECTED[cat]
                          : CATEGORY_COLORS[cat],
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-[9px] font-semibold leading-tight text-center">
                        {EXPENSE_CATEGORY_LABELS[cat]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="expense-desc" className="text-xs font-semibold">
                Description{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="expense-desc"
                placeholder="e.g. Monthly water bill"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="expense-date" className="text-xs font-semibold">
                Date
              </Label>
              <Input
                id="expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                <X className="h-3.5 w-3.5 text-destructive shrink-0" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 cursor-pointer"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="flex-1 cursor-pointer"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Saving…
                  </>
                ) : (
                  "Log Expense"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
