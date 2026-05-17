/**
 * Humanizes a list of `BusinessHours` rows into a one-line summary
 * suitable for the public booking greeting:
 *   "Mon–Sat · 9 AM – 6 PM"
 *   "Tue–Sun · Hours vary"
 *   "Open today · 9 AM – 6 PM"
 *
 * Rules:
 * - Considers only the GENERAL category (per-category hours are too
 *   noisy for a one-line subline).
 * - If every open day shares the same open/close, render a contiguous
 *   range. Otherwise fall back to "Hours vary".
 * - Sundays are 0, Saturdays are 6 (matches BusinessHours.day_of_week).
 */
export interface HoursRow {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
  category: string;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function summarizeBusinessHours(rows: HoursRow[]): string | null {
  const general = rows.filter(
    (r) => r.category.toLowerCase() === "general" && !r.is_closed,
  );
  if (general.length === 0) return null;

  // Group by (open_time, close_time) so we know if hours are uniform.
  const allSameHours = general.every(
    (r) =>
      r.open_time === general[0].open_time &&
      r.close_time === general[0].close_time,
  );

  // Sort days so we can detect a contiguous run for a clean "Mon–Sat"
  // summary, instead of listing every day individually.
  const days = [...new Set(general.map((r) => r.day_of_week))].sort(
    (a, b) => a - b,
  );

  const dayLabel = formatDayRange(days);
  if (!dayLabel) return null;
  if (!allSameHours) return `${dayLabel} · Hours vary`;
  const time = `${formatTime(general[0].open_time)} – ${formatTime(general[0].close_time)}`;
  return `${dayLabel} · ${time}`;
}

function formatDayRange(days: number[]): string | null {
  if (days.length === 0) return null;
  if (days.length === 7) return "Daily";

  // Detect a single contiguous run. Otherwise list days comma-separated.
  let contiguous = true;
  for (let i = 1; i < days.length; i++) {
    if (days[i] !== days[i - 1] + 1) {
      contiguous = false;
      break;
    }
  }

  if (contiguous && days.length >= 2) {
    return `${DAY_NAMES[days[0]]}–${DAY_NAMES[days[days.length - 1]]}`;
  }
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

function formatTime(hhmm: string): string {
  // hhmm = "09:00" / "18:30". Render in customer-friendly 12h form.
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${display} ${period}` : `${display}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Mean service duration across the catalog (in minutes). Returns null
 * if there are no services or every service has a null duration.
 */
export function averageServiceDuration(
  services: { duration: number | null }[],
): number | null {
  const durations = services
    .map((s) => s.duration)
    .filter((d): d is number => typeof d === "number" && d > 0);
  if (durations.length === 0) return null;
  const sum = durations.reduce((a, b) => a + b, 0);
  return Math.round(sum / durations.length);
}
