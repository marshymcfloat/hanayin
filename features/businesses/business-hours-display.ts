import type { BusinessHourInput } from "@/features/businesses/types/business-hours";

export function hoursSignature(hours: BusinessHourInput[]) {
  return JSON.stringify(hours.map(row => [row.category, row.day_of_week, row.open_time, row.close_time, row.is_closed]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

export function resolveHoursRow(hours: BusinessHourInput[], category: string, day: number) {
  const own = hours.find(row => row.day_of_week === day && row.category.toLowerCase() === category.toLowerCase());
  const fallback = hours.find(row => row.day_of_week === day && row.category.toLowerCase() === "general");
  return { row: own ?? fallback, inherited: !own && category.toLowerCase() !== "general" };
}

export function validHoursTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function operatingHours(open: string, close: string, enabled: boolean, allDay: boolean) {
  if (!enabled) return 0;
  if (allDay) return 24;
  if (!validHoursTime(open) || !validHoursTime(close) || open === close) return 0;
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return ((minutes(close) - minutes(open) + 1440) % 1440) / 60;
}

export function hoursInputError(open: string, close: string, enabled: boolean, allDay: boolean) {
  if (!enabled || allDay) return null;
  if (!validHoursTime(open) || !validHoursTime(close)) return "Enter both opening and closing times.";
  if (open === close) return "Choose Open 24 hours for an all-day schedule, or enter different times.";
  return null;
}

export function readableHoursTime(value: string) {
  if (!validHoursTime(value)) return value;
  const hour = Number(value.slice(0, 2));
  return `${hour % 12 || 12}:${value.slice(3)} ${hour < 12 ? "AM" : "PM"}`;
}
