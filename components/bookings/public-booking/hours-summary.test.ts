import { describe, expect, it } from "vitest";
import {
  averageServiceDuration,
  summarizeBusinessHours,
  type HoursRow,
} from "./hours-summary";

function row(
  day: number,
  open = "09:00",
  close = "18:00",
  is_closed = false,
  category = "GENERAL",
): HoursRow {
  return { day_of_week: day, open_time: open, close_time: close, is_closed, category };
}

describe("summarizeBusinessHours", () => {
  it("renders a contiguous Mon–Sat range with shared hours", () => {
    const rows = [1, 2, 3, 4, 5, 6].map((d) => row(d));
    expect(summarizeBusinessHours(rows)).toBe("Mon–Sat · 9 AM – 6 PM");
  });

  it("renders 'Daily' when every day is open with shared hours", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6].map((d) => row(d, "10:00", "20:00"));
    expect(summarizeBusinessHours(rows)).toBe("Daily · 10 AM – 8 PM");
  });

  it("falls back to 'Hours vary' when open/close differ across open days", () => {
    const rows = [
      row(1, "09:00", "18:00"),
      row(2, "10:00", "17:30"),
      row(3, "09:00", "18:00"),
    ];
    expect(summarizeBusinessHours(rows)).toBe("Mon–Wed · Hours vary");
  });

  it("ignores rows in non-GENERAL categories", () => {
    const rows = [
      row(1, "09:00", "18:00"),
      row(1, "08:00", "20:00", false, "Spa"),
    ];
    expect(summarizeBusinessHours(rows)).toBe("Mon · 9 AM – 6 PM");
  });

  it("ignores closed days when picking the range", () => {
    const rows = [
      row(0, "09:00", "18:00", true), // Sunday closed
      row(1),
      row(2),
      row(3),
      row(4),
      row(5),
      row(6),
    ];
    expect(summarizeBusinessHours(rows)).toBe("Mon–Sat · 9 AM – 6 PM");
  });

  it("returns null when there are no GENERAL open days", () => {
    expect(summarizeBusinessHours([])).toBeNull();
    expect(summarizeBusinessHours([row(1, "09:00", "18:00", true)])).toBeNull();
  });

  it("formats half-hour close times correctly", () => {
    const rows = [1, 2, 3].map((d) => row(d, "09:00", "17:30"));
    expect(summarizeBusinessHours(rows)).toBe("Mon–Wed · 9 AM – 5:30 PM");
  });
});

describe("averageServiceDuration", () => {
  it("returns the rounded mean of positive durations", () => {
    expect(
      averageServiceDuration([
        { duration: 30 },
        { duration: 60 },
        { duration: 45 },
      ]),
    ).toBe(45);
  });

  it("ignores null and zero durations", () => {
    expect(
      averageServiceDuration([
        { duration: null },
        { duration: 0 },
        { duration: 60 },
      ]),
    ).toBe(60);
  });

  it("returns null when no service has a usable duration", () => {
    expect(averageServiceDuration([])).toBeNull();
    expect(
      averageServiceDuration([{ duration: null }, { duration: 0 }]),
    ).toBeNull();
  });
});
