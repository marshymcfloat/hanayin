import { describe, expect, it } from "vitest";
import { hoursInputError, operatingHours, resolveHoursRow } from "./business-hours-display";

describe("business hours display", () => {
  it("counts all-day, closed, ordinary and split-day hours correctly", () => {
    expect(operatingHours("00:00", "00:00", true, true)).toBe(24);
    expect(operatingHours("00:00", "00:00", false, true)).toBe(0);
    expect(operatingHours("09:00", "17:30", true, false)).toBe(8.5);
    expect(operatingHours("22:00", "06:00", true, false)).toBe(8);
    expect(operatingHours("", "17:00", true, false)).toBe(0);
  });
  it("requires explicit all-day mode for equal times", () => {
    expect(hoursInputError("09:00", "09:00", true, false)).toContain("Open 24 hours");
    expect(hoursInputError("", "09:00", true, false)).toContain("both");
    expect(hoursInputError("00:00", "00:00", true, true)).toBeNull();
    expect(hoursInputError("", "", false, false)).toBeNull();
  });
  it("inherits defaults case-insensitively but respects explicit closures", () => {
    const general = { category: "GENERAL", day_of_week: 1, open_time: "00:00", close_time: "00:00", is_closed: false };
    expect(resolveHoursRow([general], "Hair", 1)).toEqual({ row: general, inherited: true });
    const closed = { ...general, category: "HAIR", is_closed: true };
    expect(resolveHoursRow([general, closed], "Hair", 1)).toEqual({ row: closed, inherited: false });
  });
});
