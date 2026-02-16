import { describe, expect, it } from "vitest";

import { recommendPostingSchedule } from "@/lib/services/growth/schedule-recommender";

describe("recommendPostingSchedule", () => {
  it("returns payday windows", () => {
    const now = new Date("2026-01-15T08:00:00+08:00");
    const schedule = recommendPostingSchedule({
      opportunityType: "PAYDAY_SPIKE",
      opportunityWindowStart: new Date("2026-01-15T10:00:00+08:00"),
      opportunityWindowEnd: new Date("2026-01-15T19:00:00+08:00"),
      now,
    });

    expect(schedule.length).toBeGreaterThan(0);
    expect(schedule[0].reason.toLowerCase()).toContain("payday");
  });

  it("posts before slow-hour window", () => {
    const schedule = recommendPostingSchedule({
      opportunityType: "SLOW_HOURS",
      opportunityWindowStart: new Date("2026-01-17T14:00:00+08:00"),
      opportunityWindowEnd: new Date("2026-01-17T17:00:00+08:00"),
      now: new Date("2026-01-17T09:00:00+08:00"),
    });

    expect(schedule[0]?.timestamp.toISOString()).toBe(
      new Date("2026-01-17T12:00:00+08:00").toISOString(),
    );
  });

  it("returns a PH fallback slot when computed times are already in the past", () => {
    const schedule = recommendPostingSchedule({
      opportunityType: "SLOW_HOURS",
      opportunityWindowStart: new Date("2026-02-14T14:00:00+08:00"),
      opportunityWindowEnd: new Date("2026-02-14T17:00:00+08:00"),
      now: new Date("2026-02-14T15:20:00+08:00"),
    });

    expect(schedule.length).toBeGreaterThan(0);
    expect(schedule[0]!.timestamp.getTime()).toBeGreaterThan(
      new Date("2026-02-14T15:20:00+08:00").getTime(),
    );
    expect(schedule[0]!.reason.toLowerCase()).toContain("ph");
  });
});
