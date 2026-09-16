"use server";

// Feature-owned Server Action boundary.

import { requireAuth } from "@/lib/auth/guards";
import { parseReportDateRange } from "@/lib/services/reports/date-range";
import { getCoreReportPayload } from "@/lib/services/reports/queries";
import { recordReportTelemetry } from "@/lib/services/reports/telemetry";
import type {
  CoreReportTab,
  ReportDateRange,
  ReportPayloadMap,
  ReportRangePreset,
} from "@/lib/types/reports";
import { prisma } from "@/prisma/prisma";

type ReportFilterInput = {
  preset?: ReportRangePreset;
  start?: string;
  end?: string;
  groupBy?: string;
};

type ReportActionError = {
  success: false;
  error: string;
};

type ReportActionSuccess<TTab extends CoreReportTab> = {
  success: true;
  tab: TTab;
  range: ReportDateRange;
  data: ReportPayloadMap[TTab];
};

type ReportActionResponse<TTab extends CoreReportTab> =
  | ReportActionError
  | ReportActionSuccess<TTab>;

async function resolveOwnerBusiness() {
  const auth = await requireAuth();
  if (!auth.success) {
    return { success: false as const, error: "Unauthorized" };
  }

  if (auth.session.user.role !== "OWNER") {
    return { success: false as const, error: "Forbidden" };
  }

  const business = await prisma.business.findUnique({
    where: {
      slug: auth.businessSlug,
    },
    select: {
      id: true,
      slug: true,
    },
  });

  if (!business) {
    return { success: false as const, error: "Business not found" };
  }

  return {
    success: true as const,
    actorId: auth.session.user.id,
    businessId: business.id,
    businessSlug: business.slug,
  };
}

async function getCoreReportAction<TTab extends CoreReportTab>({
  tab,
  filters,
}: {
  tab: TTab;
  filters?: ReportFilterInput;
}): Promise<ReportActionResponse<TTab>> {
  const owner = await resolveOwnerBusiness();
  if (!owner.success) {
    return owner;
  }

  const range = parseReportDateRange({
    preset: filters?.preset,
    start: filters?.start,
    end: filters?.end,
    groupBy: filters?.groupBy,
  });

  const start = Date.now();
  const data = (await getCoreReportPayload({
    tab,
    businessId: owner.businessId,
    range,
  })) as ReportPayloadMap[TTab];
  const latencyMs = Date.now() - start;

  await recordReportTelemetry({
    action: "REPORT_VIEW",
    actorId: owner.actorId,
    businessId: owner.businessId,
    tab,
    preset: range.preset,
    rangeStart: range.start,
    rangeEnd: range.end,
    groupBy: range.groupBy,
    latencyMs,
    success: true,
  });

  return {
    success: true,
    tab,
    range,
    data,
  };
}

export async function getOverviewReportAction(filters?: ReportFilterInput) {
  return getCoreReportAction({
    tab: "overview",
    filters,
  });
}

export async function getRevenueReportAction(filters?: ReportFilterInput) {
  return getCoreReportAction({
    tab: "revenue",
    filters,
  });
}

export async function getCustomersReportAction(filters?: ReportFilterInput) {
  return getCoreReportAction({
    tab: "customers",
    filters,
  });
}

export async function getOperationsReportAction(filters?: ReportFilterInput) {
  return getCoreReportAction({
    tab: "operations",
    filters,
  });
}
