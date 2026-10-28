import type { CoreReportTab, ReportDateRange, ReportPayloadMap } from "@/lib/types/reports";

type JsonSafe<T> = T extends Date
  ? string
  : T extends Array<infer Item>
    ? JsonSafe<Item>[]
    : T extends object
      ? { [Key in keyof T]: JsonSafe<T[Key]> }
      : T;

export type OwnerPreviewReportDto = {
  [Tab in CoreReportTab]: {
    success: true;
    tab: Tab;
    range: JsonSafe<ReportDateRange>;
    data: JsonSafe<ReportPayloadMap[Tab]>;
  };
}[CoreReportTab];

export function toOwnerPreviewReportDto<Tab extends CoreReportTab>(result: {
  success: true;
  tab: Tab;
  range: ReportDateRange;
  data: ReportPayloadMap[Tab];
}): Extract<OwnerPreviewReportDto, { tab: Tab }> {
  return JSON.parse(JSON.stringify(result)) as Extract<OwnerPreviewReportDto, { tab: Tab }>;
}
