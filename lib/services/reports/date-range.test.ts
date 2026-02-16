import { describe, expect, it } from "vitest";

import { buildReportQueryString, parseReportDateRange, parseReportTab } from "./date-range";

describe("report date range parsing", () => {
  it("parses known tabs and falls back to overview", () => {
    expect(parseReportTab("revenue")).toBe("revenue");
    expect(parseReportTab("opportunity")).toBe("opportunity");
    expect(parseReportTab("not-a-tab")).toBe("overview");
  });

  it("builds today range with PH boundaries", () => {
    const range = parseReportDateRange({
      preset: "today",
      now: new Date("2026-02-15T10:30:00+08:00"),
    });

    expect(range.start).toBe("2026-02-15");
    expect(range.end).toBe("2026-02-15");
    expect(range.spanDays).toBe(1);
    expect(range.groupBy).toBe("day");
  });

  it("uses fallback when custom dates are invalid", () => {
    const range = parseReportDateRange({
      preset: "custom",
      start: "not-a-date",
      end: "still-not-a-date",
      now: new Date("2026-02-15T10:30:00+08:00"),
    });

    expect(range.preset).toBe("custom");
    expect(range.start).toBe("2026-01-17");
    expect(range.end).toBe("2026-02-15");
  });

  it("clamps custom range to 24 months", () => {
    const range = parseReportDateRange({
      preset: "custom",
      start: "2021-01-01",
      end: "2026-02-15",
      groupBy: "month",
      now: new Date("2026-02-15T10:30:00+08:00"),
    });

    expect(range.spanDays).toBe(730);
    expect(range.groupBy).toBe("month");
  });

  it("builds query string for tab navigation", () => {
    const range = parseReportDateRange({
      preset: "custom",
      start: "2026-01-01",
      end: "2026-01-15",
      groupBy: "week",
      now: new Date("2026-02-15T10:30:00+08:00"),
    });

    const query = buildReportQueryString({
      tab: "customers",
      range,
    });

    expect(query).toContain("tab=customers");
    expect(query).toContain("preset=custom");
    expect(query).toContain("start=2026-01-01");
    expect(query).toContain("end=2026-01-15");
    expect(query).toContain("groupBy=week");
  });
});
