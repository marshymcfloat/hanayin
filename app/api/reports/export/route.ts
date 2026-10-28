import { authOptions } from "@/features/auth/auth-options";
import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import { serializeReportCsv } from "@/lib/services/reports/csv";
import { parseReportDateRange } from "@/lib/services/reports/date-range";
import { getAdvancedReportPayload, getCoreReportPayload } from "@/lib/services/reports/queries";
import { recordReportTelemetry } from "@/lib/services/reports/telemetry";
import { serializeReportXlsx } from "@/lib/services/reports/xlsx";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import type {
  AdvancedReportTab,
  CoreReportTab,
  ReportPayloadMap,
  ReportTab,
} from "@/lib/types/reports";
import { getServerSession } from "next-auth";

const CORE_TAB_SET = new Set<CoreReportTab>([
  "overview",
  "revenue",
  "customers",
  "operations",
]);
const ADVANCED_TAB_SET = new Set<AdvancedReportTab>([
  "cohorts",
  "attribution",
  "opportunity",
]);

function getErrorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const businessSlug = url.searchParams.get("businessSlug");
  const rawTab = url.searchParams.get("tab");

  if (!businessSlug) {
    return getErrorResponse("Missing businessSlug query parameter.", 400);
  }

  const isCoreTab = rawTab ? CORE_TAB_SET.has(rawTab as CoreReportTab) : false;
  const isAdvancedTab = rawTab ? ADVANCED_TAB_SET.has(rawTab as AdvancedReportTab) : false;
  if (!rawTab || (!isCoreTab && !isAdvancedTab)) {
    return getErrorResponse("Invalid tab. Unsupported report tab.", 400);
  }
  const tab = rawTab as ReportTab;
  const rawFormat = url.searchParams.get("format");
  if (rawFormat && rawFormat !== "csv" && rawFormat !== "xlsx") {
    return getErrorResponse("Invalid format. Supported formats are csv and xlsx.", 400);
  }
  const format = rawFormat === "xlsx" ? "xlsx" : "csv";
  if (format === "csv" && isAdvancedTab) {
    return getErrorResponse("CSV export is available for core tabs only.", 400);
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return getErrorResponse("Unauthorized.", 401);
  }

  if (session.user.role !== "OWNER") {
    return getErrorResponse("Forbidden.", 403);
  }

  if (session.user.businessSlug !== businessSlug) {
    return getErrorResponse("Forbidden.", 403);
  }

  const context = await resolveTenantActorContext(businessSlug, session.user.id);
  if (!context.success || context.actorType !== "OWNER") {
    return getErrorResponse("Forbidden.", 403);
  }

  const entitlements = isAdvancedTab
    ? await getBusinessEntitlementsBySlug(businessSlug)
    : null;
  if (isAdvancedTab && !entitlements?.reportsAdvanced) {
    return getErrorResponse("Forbidden. Advanced reports are not enabled for this business.", 403);
  }

  const range = parseReportDateRange({
    preset: url.searchParams.get("preset"),
    start: url.searchParams.get("start"),
    end: url.searchParams.get("end"),
    groupBy: url.searchParams.get("groupBy"),
  });

  const requestStart = Date.now();
  const payload = isCoreTab
    ? await getCoreReportPayload({
        tab: tab as CoreReportTab,
        businessId: context.businessId,
        range,
      })
    : await getAdvancedReportPayload({
        tab: tab as AdvancedReportTab,
        businessId: context.businessId,
        range,
      });
  const responseBody =
    format === "xlsx"
      ? new Uint8Array(serializeReportXlsx(tab, payload))
      : serializeReportCsv(
          tab as CoreReportTab,
          payload as ReportPayloadMap[CoreReportTab],
        );
  const latencyMs = Date.now() - requestStart;

  await recordReportTelemetry({
    action: "REPORT_EXPORT",
    actorId: session.user.id,
    businessId: context.businessId,
    tab,
    preset: range.preset,
    rangeStart: range.start,
    rangeEnd: range.end,
    groupBy: range.groupBy,
    latencyMs,
    success: true,
    metadata: {
      format,
    },
  });

  const safeSlug = businessSlug.replace(/[^a-zA-Z0-9_-]/g, "-");
  const fileName = `${safeSlug}-${tab}-${range.start}-to-${range.end}.${format}`;

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type":
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
