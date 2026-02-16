import { logger } from "@/lib/logger";
import { prisma } from "@/prisma/prisma";

type ReportTelemetryAction = "REPORT_VIEW" | "REPORT_EXPORT";

export async function recordReportTelemetry(params: {
  action: ReportTelemetryAction;
  businessId: string;
  actorId?: string | null;
  tab: string;
  preset: string;
  rangeStart: string;
  rangeEnd: string;
  groupBy: string;
  latencyMs: number;
  success?: boolean;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        entity_type: "Report",
        entity_id: params.tab,
        action: params.action,
        actor_id: params.actorId ?? null,
        actor_type: "USER",
        business_id: params.businessId,
        changes: {
          tab: params.tab,
          preset: params.preset,
          rangeStart: params.rangeStart,
          rangeEnd: params.rangeEnd,
          groupBy: params.groupBy,
          latencyMs: params.latencyMs,
          success: params.success ?? true,
          ...(params.metadata ?? {}),
        },
      },
    });
  } catch (error) {
    logger.warn("[Reports] Failed to record report telemetry", {
      action: params.action,
      businessId: params.businessId,
      tab: params.tab,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
