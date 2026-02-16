export type GrowthFlowName = "growth";
export type GrowthFlowStep = 1 | 2 | 3;
export type GrowthFlowSource = "dashboard" | "sale-events";

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export interface GrowthFlowContext {
  flow: GrowthFlowName;
  step: GrowthFlowStep;
  source?: GrowthFlowSource;
  opportunityId?: string;
  saleEventId?: number;
  socialPostId?: string;
}

function takeFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseGrowthFlowContext(
  searchParams?: SearchParamsRecord | null,
): GrowthFlowContext | undefined {
  if (!searchParams) return undefined;

  const flow = takeFirst(searchParams.flow);
  if (flow !== "growth") return undefined;

  const rawStep = takeFirst(searchParams.step);
  const parsedStep =
    rawStep === "1" || rawStep === "2" || rawStep === "3"
      ? (Number.parseInt(rawStep, 10) as GrowthFlowStep)
      : 1;

  const rawSource = takeFirst(searchParams.source);
  const source =
    rawSource === "dashboard" || rawSource === "sale-events"
      ? rawSource
      : undefined;

  const opportunityId = takeFirst(searchParams.opportunityId)?.trim() || undefined;
  const socialPostId = takeFirst(searchParams.socialPostId)?.trim() || undefined;

  const rawSaleEventId = takeFirst(searchParams.saleEventId);
  const saleEventIdParsed = rawSaleEventId
    ? Number.parseInt(rawSaleEventId, 10)
    : Number.NaN;
  const saleEventId =
    Number.isFinite(saleEventIdParsed) && saleEventIdParsed > 0
      ? saleEventIdParsed
      : undefined;

  return {
    flow: "growth",
    step: parsedStep,
    source,
    opportunityId,
    saleEventId,
    socialPostId,
  };
}

export function buildGrowthFlowQuery(
  input: Partial<GrowthFlowContext>,
): string {
  const params = new URLSearchParams();
  params.set("flow", "growth");
  if (input.step) {
    params.set("step", String(input.step));
  }
  if (input.source) {
    params.set("source", input.source);
  }
  if (input.opportunityId) {
    params.set("opportunityId", input.opportunityId);
  }
  if (typeof input.saleEventId === "number") {
    params.set("saleEventId", String(input.saleEventId));
  }
  if (input.socialPostId) {
    params.set("socialPostId", input.socialPostId);
  }
  return params.toString();
}
