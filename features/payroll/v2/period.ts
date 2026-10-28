import { PayrollError } from "./contracts";
import { dateOnly } from "./schemas";

export function day(value: string) { return new Date(dateOnly.parse(value) + "T00:00:00Z"); }
export function phDay(value: Date) { return new Date(value.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
export function cutoff(value: string) { return new Date(day(value).getTime() + 16 * 3600000); }
export function days(start: string, end: string) {
  const result: string[] = [];
  for (let current = day(start); current <= day(end); current = new Date(current.getTime() + 86400000)) result.push(current.toISOString().slice(0, 10));
  return result;
}
export function validatePaymentSchedule(cadence: string, payDays: number[]) {
  if (cadence === "WEEKLY") return;
  const dates = [...new Set(payDays)].sort((a, b) => a - b);
  if (dates.length < 2 || dates.some((value, i) => i > 0 && value - dates[i - 1] > 16) || 31 - dates[dates.length - 1] + dates[0] > 16) {
    throw new PayrollError("INVALID_INPUT", "Pay dates must be at least twice monthly and no more than 16 days apart.");
  }
}
export function currentWorkPeriod(cadence: string, value: string) {
  const current = day(value);
  if (cadence === "WEEKLY") {
    const offset = (current.getUTCDay() + 6) % 7;
    return { start: new Date(current.getTime() - offset * 86400000).toISOString().slice(0, 10), end: value };
  }
  return { start: value.slice(0, 8) + (current.getUTCDate() <= 15 ? "01" : "16"), end: value };
}
export function taxPeriodKey(cadence: string, value: string) {
  if (cadence === "WEEKLY") return currentWorkPeriod(cadence, value).start;
  return value.slice(0, 7) + (day(value).getUTCDate() <= 15 ? "-H1" : "-H2");
}
