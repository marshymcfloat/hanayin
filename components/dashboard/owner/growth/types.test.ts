import { describe, expect, it } from "vitest";

import { buildGrowthFlowQuery, parseGrowthFlowContext } from "./types";

describe("growth flow context parsing", () => {
  it("parses valid growth flow query params", () => {
    const result = parseGrowthFlowContext({
      flow: "growth",
      step: "3",
      source: "sale-events",
      opportunityId: "opp_1",
      saleEventId: "42",
      socialPostId: "post_1",
    });

    expect(result).toEqual({
      flow: "growth",
      step: 3,
      source: "sale-events",
      opportunityId: "opp_1",
      saleEventId: 42,
      socialPostId: "post_1",
    });
  });

  it("returns undefined when flow is not growth", () => {
    const result = parseGrowthFlowContext({
      flow: "other",
      step: "1",
    });

    expect(result).toBeUndefined();
  });
});

describe("growth flow query builder", () => {
  it("builds expected query string", () => {
    const query = buildGrowthFlowQuery({
      step: 2,
      source: "dashboard",
      opportunityId: "opp_2",
      saleEventId: 55,
      socialPostId: "sp_2",
    });

    expect(query).toContain("flow=growth");
    expect(query).toContain("step=2");
    expect(query).toContain("source=dashboard");
    expect(query).toContain("opportunityId=opp_2");
    expect(query).toContain("saleEventId=55");
    expect(query).toContain("socialPostId=sp_2");
  });
});
