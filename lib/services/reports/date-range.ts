import {
  getCurrentDateTimePH,
  getEndOfDayPH,
  getStartOfDayPH,
  TIMEZONE_PH,
} from "@/lib/date-utils";
import type {
  CoreReportTab,
  ReportDateRange,
  ReportGroupBy,
  ReportRangePreset,
  ReportTab,
} from "@/lib/types/reports";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 730;

export const CORE_REPORT_TABS: CoreReportTab[] = [
  "overview",
  "revenue",
  "customers",
  "operations",
  "expenses",
];

export const ADVANCED_REPORT_TABS: Extract<
  ReportTab,
  "cohorts" | "attribution" | "opportunity"
>[] = ["cohorts", "attribution", "opportunity"];

const TAB_SET = new Set<ReportTab>([...CORE_REPORT_TABS, ...ADVANCED_REPORT_TABS]);
const GROUP_BY_SET = new Set<ReportGroupBy>(["day", "week", "month"]);

const PRESET_DAY_LENGTH: Record<Exclude<ReportRangePreset, "custom" | "mtd">, number> =
  {
    today: 1,
    "7d": 7,
    "30d": 30,
    "90d": 90,
  };

function toPhYmd(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_PH,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseDateInput(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const start = new Date(`${normalized}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  return {
    start,
    end: new Date(`${normalized}T23:59:59.999+08:00`),
  };
}

function getMtdStart(nowPH: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_PH,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(nowPH);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return new Date(`${year}-${month}-01T00:00:00+08:00`);
}

function formatRangeLabel(startAt: Date, endAt: Date, preset: ReportRangePreset) {
  if (preset === "today") return "Today";
  if (preset === "7d") return "Last 7 days";
  if (preset === "30d") return "Last 30 days";
  if (preset === "90d") return "Last 90 days";
  if (preset === "mtd") return "Month to date";

  const formatter = new Intl.DateTimeFormat("en-PH", {
    timeZone: TIMEZONE_PH,
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${formatter.format(startAt)} - ${formatter.format(endAt)}`;
}

function normalizeSpan(startAt: Date, endAt: Date) {
  const diff = endAt.getTime() - startAt.getTime();
  const spanDays = Math.floor(diff / DAY_MS) + 1;
  if (spanDays <= MAX_REPORT_DAYS) {
    return { startAt, endAt, spanDays };
  }

  const clampedStart = getStartOfDayPH(
    new Date(endAt.getTime() - (MAX_REPORT_DAYS - 1) * DAY_MS),
  );
  return {
    startAt: clampedStart,
    endAt,
    spanDays: MAX_REPORT_DAYS,
  };
}

function resolveDefaultGroupBy(spanDays: number): ReportGroupBy {
  if (spanDays <= 45) return "day";
  if (spanDays <= 180) return "week";
  return "month";
}

export function parseReportTab(rawTab: string | null | undefined): ReportTab {
  if (!rawTab) return "overview";
  return TAB_SET.has(rawTab as ReportTab) ? (rawTab as ReportTab) : "overview";
}

export function parseReportDateRange(input: {
  preset?: string | null;
  start?: string | null;
  end?: string | null;
  groupBy?: string | null;
  now?: Date;
}): ReportDateRange {
  const nowPH = input.now ?? getCurrentDateTimePH();
  const presetRaw = (input.preset || "30d").toLowerCase();
  const preset = (
    ["today", "7d", "30d", "90d", "mtd", "custom"] as ReportRangePreset[]
  ).includes(presetRaw as ReportRangePreset)
    ? (presetRaw as ReportRangePreset)
    : "30d";

  let startAt: Date;
  let endAt: Date;

  if (preset === "custom") {
    const parsedStart = parseDateInput(input.start);
    const parsedEnd = parseDateInput(input.end);

    if (parsedStart && parsedEnd) {
      startAt = parsedStart.start;
      endAt = parsedEnd.end;
    } else {
      const fallbackStart = getStartOfDayPH(new Date(nowPH.getTime() - 29 * DAY_MS));
      startAt = fallbackStart;
      endAt = getEndOfDayPH(nowPH);
    }
  } else if (preset === "mtd") {
    startAt = getMtdStart(nowPH);
    endAt = getEndOfDayPH(nowPH);
  } else {
    const days = PRESET_DAY_LENGTH[preset];
    startAt = getStartOfDayPH(new Date(nowPH.getTime() - (days - 1) * DAY_MS));
    endAt = getEndOfDayPH(nowPH);
  }

  if (startAt.getTime() > endAt.getTime()) {
    const swap = startAt;
    startAt = getStartOfDayPH(endAt);
    endAt = getEndOfDayPH(swap);
  }

  const normalized = normalizeSpan(startAt, endAt);
  const requestedGroupBy = input.groupBy?.toLowerCase();
  const groupBy =
    requestedGroupBy && GROUP_BY_SET.has(requestedGroupBy as ReportGroupBy)
      ? (requestedGroupBy as ReportGroupBy)
      : resolveDefaultGroupBy(normalized.spanDays);

  return {
    preset,
    start: toPhYmd(normalized.startAt),
    end: toPhYmd(normalized.endAt),
    startAt: normalized.startAt,
    endAt: normalized.endAt,
    spanDays: normalized.spanDays,
    label: formatRangeLabel(normalized.startAt, normalized.endAt, preset),
    groupBy,
    isCustom: preset === "custom",
  };
}

export function buildReportQueryString({
  tab,
  range,
}: {
  tab: ReportTab;
  range: Pick<ReportDateRange, "preset" | "start" | "end" | "groupBy">;
}) {
  const params = new URLSearchParams();
  params.set("tab", tab);
  params.set("preset", range.preset);
  params.set("groupBy", range.groupBy);
  if (range.preset === "custom") {
    params.set("start", range.start);
    params.set("end", range.end);
  }
  return params.toString();
}
