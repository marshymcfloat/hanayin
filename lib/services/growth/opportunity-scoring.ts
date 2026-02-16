import type { OpportunityScoreBreakdown } from "@/lib/services/growth/types";

const SCORE_WEIGHTS = {
  urgency: 0.35,
  impact: 0.30,
  confidence: 0.20,
  feasibility: 0.15,
} as const;

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function computeOpportunityScore(input: {
  urgency: number;
  impact: number;
  confidence: number;
  feasibility: number;
}): OpportunityScoreBreakdown {
  const urgency = clamp01(input.urgency);
  const impact = clamp01(input.impact);
  const confidence = clamp01(input.confidence);
  const feasibility = clamp01(input.feasibility);

  const total =
    urgency * SCORE_WEIGHTS.urgency +
    impact * SCORE_WEIGHTS.impact +
    confidence * SCORE_WEIGHTS.confidence +
    feasibility * SCORE_WEIGHTS.feasibility;

  return {
    urgency,
    impact,
    confidence,
    feasibility,
    total: Number(total.toFixed(4)),
  };
}

