import { describe, expect, it } from "vitest";
import { attendancePreviewDateSchema, currentAttendanceDatePH, shiftAttendanceDate, attendancePreviewDayBounds } from "./owner-attendance-preview-date";

describe("attendance preview dates", () => {
  it("uses the Philippine calendar day", () => {
    expect(currentAttendanceDatePH(new Date("2026-09-27T17:00:00Z"))).toBe("2026-09-28");
  });

  it("rejects malformed and impossible dates", () => {
    for (const value of ["2026-02-30", "2026-13-01", "2026-9-1", "not-a-date"]) {
      expect(attendancePreviewDateSchema.safeParse(value).success).toBe(false);
    }
    expect(attendancePreviewDateSchema.safeParse("2026-09-27").success).toBe(true);
  });

  it("moves calendar days across month, year, and leap-day boundaries", () => {
    expect(shiftAttendanceDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftAttendanceDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftAttendanceDate("2026-02-28", 1)).toBe("2026-03-01");
    expect(() => shiftAttendanceDate("2026-02-30", 1)).toThrow();
    expect(attendancePreviewDayBounds("2026-01-01")).toEqual({ start: new Date("2025-12-31T16:00:00Z"), end: new Date("2026-01-01T15:59:59.999Z") });
  });
});
