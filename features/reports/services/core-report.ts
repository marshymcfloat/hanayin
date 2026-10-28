import "server-only";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import { parseReportDateRange } from "@/lib/services/reports/date-range";
import { getCoreReportPayload } from "@/lib/services/reports/queries";
import { recordReportTelemetry } from "@/lib/services/reports/telemetry";
import type { CoreReportTab, ReportPayloadMap } from "@/lib/types/reports";
import type { ReportFilters } from "@/features/reports/schemas";

type OwnerContext = Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;

export async function getOwnerCoreReport<TTab extends CoreReportTab>(context: OwnerContext, tab: TTab, filters: ReportFilters) {
  if (context.actorType !== "OWNER") throw new Error("Forbidden");
  const range = parseReportDateRange(filters);
  const start = Date.now();
  const data = await getCoreReportPayload({ tab, businessId: context.businessId, range }) as ReportPayloadMap[TTab];
  await recordReportTelemetry({
    action: "REPORT_VIEW", actorId: context.userId, businessId: context.businessId,
    tab, preset: range.preset, rangeStart: range.start, rangeEnd: range.end,
    groupBy: range.groupBy, latencyMs: Date.now() - start, success: true,
  });
  return { success: true as const, tab, range, data };
}
