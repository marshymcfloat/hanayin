import { PayrollError } from "./contracts";

export type WorkInterval = { startedAt: Date; endedAt: Date; breaks: { start: string; end: string }[] };
export function workMinutes(intervals: WorkInterval[], normalMinutes: number) {
  if (!Number.isFinite(normalMinutes) || normalMinutes < 0) throw new PayrollError("BLOCKED", "Review the normal shift hours.");
  const segments: { start: number; end: number }[] = [];
  const orderedIntervals = [...intervals].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  for (const [index, interval] of orderedIntervals.entries()) {
    if (!Number.isFinite(interval.startedAt.getTime()) || !Number.isFinite(interval.endedAt.getTime()) || interval.endedAt <= interval.startedAt || interval.endedAt.getTime() - interval.startedAt.getTime() > 24 * 3600000) throw new PayrollError("BLOCKED", "Work sessions must be valid shifts of at most 24 hours.");
    if (index && interval.startedAt < orderedIntervals[index - 1].endedAt) throw new PayrollError("BLOCKED", "Overlapping work sessions require review.");
    const breaks = interval.breaks.map(entry => ({ start: Date.parse(entry.start), end: Date.parse(entry.end) })).sort((a, b) => a.start - b.start);
    if (breaks.some((entry, index) => !Number.isFinite(entry.start) || !Number.isFinite(entry.end) || entry.end <= entry.start || entry.start < interval.startedAt.getTime() || entry.end > interval.endedAt.getTime() || (index > 0 && entry.start < breaks[index - 1].end))) throw new PayrollError("BLOCKED", "Review the work session's breaks.");
    let cursor = interval.startedAt.getTime();
    for (const pause of breaks) { if (pause.start > cursor) segments.push({ start: cursor, end: pause.start }); cursor = pause.end; }
    if (cursor < interval.endedAt.getTime()) segments.push({ start: cursor, end: interval.endedAt.getTime() });
  }
  let totalMs = 0;
  const normalMs = Math.round(normalMinutes * 60000);
  const byDay = new Map<string, { ordinaryMs: number; overtimeMs: number; nightOrdinaryMs: number; nightOvertimeMs: number }>();
  for (const segment of segments) {
    for (let cursor = segment.start; cursor < segment.end;) {
      const local = new Date(cursor + 8 * 3600000); const date = local.toISOString().slice(0, 10); const hour = local.getUTCHours();
      const nextBoundary = new Date(local); nextBoundary.setUTCHours(hour < 6 ? 6 : hour < 22 ? 22 : 24, 0, 0, 0);
      const ordinary = totalMs < normalMs;
      const end = Math.min(segment.end, nextBoundary.getTime() - 8 * 3600000, ordinary ? cursor + normalMs - totalMs : Infinity);
      const duration = end - cursor;
      const entry = byDay.get(date) ?? { ordinaryMs: 0, overtimeMs: 0, nightOrdinaryMs: 0, nightOvertimeMs: 0 };
      if (ordinary) entry.ordinaryMs += duration; else entry.overtimeMs += duration;
      if (hour >= 22 || hour < 6) { if (ordinary) entry.nightOrdinaryMs += duration; else entry.nightOvertimeMs += duration; }
      byDay.set(date, entry); totalMs += duration; cursor = end;
    }
  }
  const days = [...byDay].map(([date, duration]) => ({ date, ...duration, ordinary: duration.ordinaryMs / 60000, overtime: duration.overtimeMs / 60000, nightOrdinary: duration.nightOrdinaryMs / 60000, nightOvertime: duration.nightOvertimeMs / 60000 }));
  return { totalMs, total: totalMs / 60000, ordinary: Math.min(normalMs, totalMs) / 60000, overtime: Math.max(0, totalMs - normalMs) / 60000, ordinaryMs: Math.min(normalMs, totalMs), nightOrdinary: days.reduce((total, entry) => total + entry.nightOrdinary, 0), nightOvertime: days.reduce((total, entry) => total + entry.nightOvertime, 0), days };
}
