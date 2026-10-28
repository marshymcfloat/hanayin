import { z } from "zod";

import { TIMEZONE_PH, getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";

export function currentAttendanceDatePH(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_PH,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const attendancePreviewDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid date");

export function attendancePreviewDayBounds(date: string) {
  const midday = new Date(`${date}T12:00:00+08:00`);
  return { start: getStartOfDayPH(midday), end: getEndOfDayPH(midday) };
}

export function shiftAttendanceDate(date: string, days: number): string {
  const value = attendancePreviewDateSchema.parse(date);
  const day = new Date(`${value}T12:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
