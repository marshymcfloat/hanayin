import { authOptions } from "@/lib/next auth/options";
import { serializeReportCsv } from "@/lib/services/reports/csv";
import { parseReportDateRange } from "@/lib/services/reports/date-range";
import { getCoreReportPayload } from "@/lib/services/reports/queries";
import { recordReportTelemetry } from "@/lib/services/reports/telemetry";
import type { CoreReportTab } from "@/lib/types/reports";
import { prisma } from "@/prisma/prisma";
import { getServerSession } from "next-auth";

const CORE_TAB_SET = new Set<CoreReportTab>([
  "overview",
  "revenue",
  "customers",
  "operations",
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

  if (!rawTab || !CORE_TAB_SET.has(rawTab as CoreReportTab)) {
    return getErrorResponse("Invalid tab. Only core report tabs support CSV export.", 400);
  }
  const tab = rawTab as CoreReportTab;

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

  const business = await prisma.business.findUnique({
    where: {
      slug: businessSlug,
    },
    select: {
      id: true,
    },
  });

  if (!business) {
    return getErrorResponse("Business not found.", 404);
  }

  const range = parseReportDateRange({
    preset: url.searchParams.get("preset"),
    start: url.searchParams.get("start"),
    end: url.searchParams.get("end"),
    groupBy: url.searchParams.get("groupBy"),
  });

  const requestStart = Date.now();
  const payload = await getCoreReportPayload({
    tab,
    businessId: business.id,
    range,
  });
  const csvContent = serializeReportCsv(tab, payload);
  const latencyMs = Date.now() - requestStart;

  await recordReportTelemetry({
    action: "REPORT_EXPORT",
    actorId: session.user.id,
    businessId: business.id,
    tab,
    preset: range.preset,
    rangeStart: range.start,
    rangeEnd: range.end,
    groupBy: range.groupBy,
    latencyMs,
    success: true,
  });

  const safeSlug = businessSlug.replace(/[^a-zA-Z0-9_-]/g, "-");
  const fileName = `${safeSlug}-${tab}-${range.start}-to-${range.end}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
