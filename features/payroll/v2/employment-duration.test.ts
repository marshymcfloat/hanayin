import { describe, expect, it } from "vitest";
import { calendarAge, calendarEmploymentDuration } from "./employment-duration";

describe("calendar benefit eligibility and service rounding", () => {
  it("does not grant age sixty before the actual birthday", () => {
    expect(calendarAge("1966-10-12", "2026-10-11")).toBe(59);
    expect(calendarAge("1966-10-12", "2026-10-12")).toBe(60);
  });
  it("requires five completed years rather than rounding eligibility up", () => {
    expect(calendarEmploymentDuration("2021-10-12", "2026-10-11")).toMatchObject({ completedYears: 4, roundedServiceYears: 5 });
    expect(calendarEmploymentDuration("2021-10-12", "2026-10-12").completedYears).toBe(5);
  });
  it("rounds service at the actual six-month anniversary", () => {
    expect(calendarEmploymentDuration("2020-01-12", "2025-07-11")).toMatchObject({ completedYears: 5, completedMonths: 65, roundedServiceYears: 5 });
    expect(calendarEmploymentDuration("2020-01-12", "2025-07-12")).toMatchObject({ completedYears: 5, completedMonths: 66, roundedServiceYears: 6 });
  });
  it("clamps missing month-end dates without drifting the original anniversary", () => {
    expect(calendarEmploymentDuration("2020-08-31", "2025-02-27").roundedServiceYears).toBe(4);
    expect(calendarEmploymentDuration("2020-08-31", "2025-02-28")).toMatchObject({ roundedServiceYears: 5, sixMonthAnniversary: "2025-02-28" });
    expect(calendarEmploymentDuration("2020-08-31", "2025-08-30").completedYears).toBe(4);
    expect(calendarEmploymentDuration("2020-08-31", "2025-08-31").completedYears).toBe(5);
  });
  it("requires explicit leap-day policy only at the ambiguous boundary", () => {
    expect(() => calendarAge("1964-02-29", "2025-02-28")).toThrow("anniversary policy");
    expect(calendarAge("1964-02-29", "2025-02-28", "FEBRUARY_28")).toBe(61);
    expect(calendarAge("1964-02-29", "2025-02-28", "MARCH_1")).toBe(60);
    expect(calendarAge("1964-02-29", "2025-03-01")).toBe(61);
    expect(calendarAge("1964-02-29", "2024-02-29")).toBe(60);
  });
  it("rejects invalid dates and negative service instead of silently normalizing", () => {
    expect(() => calendarAge("1964-02-30", "2026-10-12")).toThrow("valid calendar");
    expect(() => calendarEmploymentDuration("2026-10-12", "2026-10-11")).toThrow("cannot precede");
    expect(calendarEmploymentDuration(new Date("2020-01-12T00:00:00Z"), "2025-07-12").roundedServiceYears).toBe(6);
  });
});
