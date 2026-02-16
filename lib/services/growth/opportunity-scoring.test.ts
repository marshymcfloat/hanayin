import { describe, expect, it } from "vitest";

import { computeOpportunityScore } from "@/lib/services/growth/opportunity-scoring";

describe("computeOpportunityScore", () => {
  it("applies weighted scoring", () => {
    const output = computeOpportunityScore({
      urgency: 1,
      impact: 0.5,
      confidence: 0.5,
      feasibility: 0.5,
    });

    expect(output.total).toBeCloseTo(0.675, 3);
  });

  it("clamps out-of-bound inputs", () => {
    const output = computeOpportunityScore({
      urgency: 2,
      impact: -1,
      confidence: 0.5,
      feasibility: 0.5,
    });

    expect(output.urgency).toBe(1);
    expect(output.impact).toBe(0);
  });
});

