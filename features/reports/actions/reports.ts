"use server";

import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { reportFiltersSchema } from "@/features/reports/schemas";
import { getOwnerCoreReport } from "@/features/reports/services/core-report";
import type { CoreReportTab, ReportRangePreset } from "@/lib/types/reports";

type ReportFilterInput = { preset?: ReportRangePreset; start?: string; end?: string; groupBy?: string };

async function getCoreReportAction<TTab extends CoreReportTab>(tab: TTab, filters?: ReportFilterInput) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return { success: false as const, error: "Unauthorized" };
    if (auth.session.user.role !== "OWNER") return { success: false as const, error: "Forbidden" };
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success || context.actorType !== "OWNER") return { success: false as const, error: "Forbidden" };
    const validation = reportFiltersSchema.safeParse(filters);
    if (!validation.success) return { success: false as const, error: "Invalid input" };
    return await getOwnerCoreReport(context, tab, validation.data);
  } catch {
    return { success: false as const, error: "Unable to load report." };
  }
}

export async function getOverviewReportAction(filters?: ReportFilterInput) {
  return getCoreReportAction("overview", filters);
}

export async function getRevenueReportAction(filters?: ReportFilterInput) {
  return getCoreReportAction("revenue", filters);
}

export async function getCustomersReportAction(filters?: ReportFilterInput) {
  return getCoreReportAction("customers", filters);
}

export async function getOperationsReportAction(filters?: ReportFilterInput) {
  return getCoreReportAction("operations", filters);
}

export async function getExpensesReportAction(filters?: ReportFilterInput) {
  return getCoreReportAction("expenses", filters);
}
