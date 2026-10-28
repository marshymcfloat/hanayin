import { PayrollError } from "@/features/payroll/v2/contracts";

export type LeapDayAnniversary = "FEBRUARY_28" | "MARCH_1";
type CalendarDate = { year: number; month: number; date: number; iso: string };
function calendarDate(value: string | Date): CalendarDate {
  const iso = value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : typeof value === "string" ? value : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new PayrollError("INVALID_INPUT", "Enter a verified calendar date.");
  const parsed = new Date(iso + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) throw new PayrollError("INVALID_INPUT", "Enter a valid calendar date.");
  return { year: parsed.getUTCFullYear(), month: parsed.getUTCMonth(), date: parsed.getUTCDate(), iso };
}
function anniversary(start: CalendarDate, months: number, leapDay?: LeapDayAnniversary) {
  const target = new Date(start.iso + "T00:00:00Z"); target.setUTCDate(1); target.setUTCMonth(start.month + months);
  const last = new Date(target); last.setUTCMonth(target.getUTCMonth() + 1); last.setUTCDate(0);
  const lastDay = last.getUTCDate();
  // Month-end anniversaries clamp to the last valid date, always from the original anchor.
  const date = Math.min(start.date, lastDay);
  const leapBirthday = start.month === 1 && start.date === 29 && target.getUTCMonth() === 1 && lastDay === 28;
  target.setUTCDate(leapBirthday && leapDay === "MARCH_1" ? 29 : date);
  return target.toISOString().slice(0, 10);
}
export function calendarEmploymentDuration(startValue: string | Date, endValue: string | Date, leapDay?: LeapDayAnniversary) {
  const start = calendarDate(startValue); const end = calendarDate(endValue);
  if (end.iso < start.iso) throw new PayrollError("INVALID_INPUT", "The benefit date cannot precede employment or birth.");
  const februaryEnd = new Date(end.iso + "T00:00:00Z"); februaryEnd.setUTCMonth(2, 0);
  const lastFebruaryDay = februaryEnd.getUTCDate();
  if (!leapDay && start.month === 1 && start.date === 29 && end.month === 1 && end.date === 28 && lastFebruaryDay === 28) throw new PayrollError("BLOCKED", "A leap-day anniversary falls on this eligibility boundary. Verify the applicable anniversary policy independently.");
  let completedMonths = (end.year - start.year) * 12 + end.month - start.month;
  if (anniversary(start, completedMonths, leapDay) > end.iso) completedMonths--;
  completedMonths = Math.max(0, completedMonths);
  const completedYears = Math.floor(completedMonths / 12);
  const sixMonthAnniversary = anniversary(start, completedYears * 12 + 6, leapDay);
  return { completedYears, completedMonths, roundedServiceYears: completedYears + (end.iso >= sixMonthAnniversary ? 1 : 0), sixMonthAnniversary, monthEndConvention: "CLAMP_FROM_ORIGINAL_DATE" as const, leapDayPolicy: leapDay ?? "REVIEW_AMBIGUOUS_BOUNDARY" as const };
}
export function calendarAge(dateOfBirth: string | Date, asOf: string | Date, leapDay?: LeapDayAnniversary) {
  return calendarEmploymentDuration(dateOfBirth, asOf, leapDay).completedYears;
}
