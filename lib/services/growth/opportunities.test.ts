import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentDateTimePHMock = vi.hoisted(() => vi.fn());
const getStartOfDayPHMock = vi.hoisted(() => vi.fn());
const getEndOfDayPHMock = vi.hoisted(() => vi.fn());
const recommendPostingScheduleMock = vi.hoisted(() => vi.fn());
const opportunityFindManyMock = vi.hoisted(() => vi.fn());
const campaignFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/date-utils", () => ({
  getCurrentDateTimePH: getCurrentDateTimePHMock,
  getStartOfDayPH: getStartOfDayPHMock,
  getEndOfDayPH: getEndOfDayPHMock,
}));

vi.mock("@/lib/services/growth/schedule-recommender", () => ({
  recommendPostingSchedule: recommendPostingScheduleMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: {
    opportunity: {
      findMany: opportunityFindManyMock,
    },
    campaign: {
      findMany: campaignFindManyMock,
    },
  },
}));

import { getTodayOpportunityViews } from "@/lib/services/growth/opportunities";

describe("getTodayOpportunityViews", () => {
  const now = new Date("2026-02-18T08:00:00+08:00");
  const start = new Date("2026-02-18T00:00:00+08:00");
  const end = new Date("2026-02-18T23:59:59+08:00");

  beforeEach(() => {
    vi.resetAllMocks();

    getCurrentDateTimePHMock.mockReturnValue(now);
    getStartOfDayPHMock.mockReturnValue(start);
    getEndOfDayPHMock.mockReturnValue(end);
    recommendPostingScheduleMock.mockReturnValue([
      { timestamp: new Date("2026-02-18T12:00:00+08:00"), reason: "Test slot" },
    ]);
  });

  it("suppresses opportunities already covered by an active campaign type", async () => {
    opportunityFindManyMock.mockResolvedValue([
      {
        id: "opp_slow",
        type: "SLOW_HOURS",
        reason: "Slow hours",
        urgency_score: 0.9,
        confidence_score: 0.75,
        total_score: 0.91,
        time_window_start: new Date("2026-02-18T14:00:00+08:00"),
        time_window_end: new Date("2026-02-18T17:00:00+08:00"),
        recommended_offer_types: ["FLASH_DEAL", "LIMITED_SLOTS"],
        metadata: { openSlots: 45 },
      },
      {
        id: "opp_payday",
        type: "PAYDAY_SPIKE",
        reason: "Payday",
        urgency_score: 0.88,
        confidence_score: 0.78,
        total_score: 0.89,
        time_window_start: new Date("2026-02-18T10:00:00+08:00"),
        time_window_end: new Date("2026-02-18T19:00:00+08:00"),
        recommended_offer_types: ["PAYDAY_PROMO"],
        metadata: null,
      },
    ]);
    campaignFindManyMock.mockResolvedValue([
      {
        opportunity: {
          type: "SLOW_HOURS",
        },
      },
    ]);

    const result = await getTodayOpportunityViews("biz_1");

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("opp_payday");
    expect(result[0]?.type).toBe("PAYDAY_SPIKE");
  });

  it("returns opportunities normally when there is no active overlap", async () => {
    opportunityFindManyMock.mockResolvedValue([
      {
        id: "opp_slow",
        type: "SLOW_HOURS",
        reason: "Slow hours",
        urgency_score: 0.9,
        confidence_score: 0.75,
        total_score: 0.91,
        time_window_start: new Date("2026-02-18T14:00:00+08:00"),
        time_window_end: new Date("2026-02-18T17:00:00+08:00"),
        recommended_offer_types: ["FLASH_DEAL"],
        metadata: null,
      },
    ]);
    campaignFindManyMock.mockResolvedValue([]);

    const result = await getTodayOpportunityViews("biz_1");

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("SLOW_HOURS");
    expect(recommendPostingScheduleMock).toHaveBeenCalledTimes(1);
  });
});
