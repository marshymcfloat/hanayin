import { getCurrentDateTimePH, getStartOfDayPH } from "@/lib/date-utils";
import type {
  OpportunityTypeLiteral,
  PostingScheduleSuggestion,
} from "@/lib/services/growth/types";

function parseDateKey(date: Date, hour: number, minute = 0) {
  const base = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return new Date(`${base}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function getWeekday(date: Date) {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return new Date(`${key}T00:00:00+08:00`).getUTCDay();
}

function buildFallbackNextSlot(input: {
  opportunityType: OpportunityTypeLiteral;
  now: Date;
}) {
  const baseDay = getStartOfDayPH(input.now);
  const tomorrow = addDays(baseDay, 1);

  if (input.opportunityType === "PAYDAY_SPIKE") {
    return {
      timestamp: parseDateKey(tomorrow, 10, 0),
      reason: "Next best payday-style morning window (PH time).",
    };
  }

  if (input.opportunityType === "WEEKEND_PREP") {
    return {
      timestamp: parseDateKey(tomorrow, 12, 0),
      reason: "Next best weekend-prep noon window (PH time).",
    };
  }

  if (input.opportunityType === "SLOW_HOURS") {
    return {
      timestamp: parseDateKey(tomorrow, 11, 0),
      reason: "Current window passed. Next pre-window slot tomorrow (PH time).",
    };
  }

  return {
    timestamp: parseDateKey(tomorrow, 10, 0),
    reason: "Current window passed. Next recommended posting slot (PH time).",
  };
}

export function recommendPostingSchedule(input: {
  opportunityType: OpportunityTypeLiteral;
  opportunityWindowStart: Date;
  opportunityWindowEnd: Date;
  now?: Date;
}): PostingScheduleSuggestion[] {
  const now = input.now || getCurrentDateTimePH();
  const suggestions: PostingScheduleSuggestion[] = [];

  if (input.opportunityType === "PAYDAY_SPIKE") {
    const start = getStartOfDayPH(now);
    suggestions.push(
      { timestamp: parseDateKey(start, 10, 0), reason: "Payday morning attention window (10–11AM)." },
      { timestamp: parseDateKey(start, 17, 30), reason: "Payday after-work window (5–7PM)." },
    );
  }

  if (input.opportunityType === "WEEKEND_PREP") {
    const today = getStartOfDayPH(now);
    for (let i = 0; i < 5; i += 1) {
      const day = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      const weekday = getWeekday(day);
      if (weekday === 4) {
        suggestions.push({ timestamp: parseDateKey(day, 20, 0), reason: "Thursday night weekend-prep push." });
      }
      if (weekday === 5) {
        suggestions.push({ timestamp: parseDateKey(day, 12, 0), reason: "Friday noon booking-intent peak." });
      }
    }
  }

  if (input.opportunityType === "SLOW_HOURS") {
    const postTime = new Date(input.opportunityWindowStart.getTime() - 2 * 60 * 60 * 1000);
    suggestions.push({
      timestamp: postTime,
      reason: "Slow-hour promos convert best when posted 1–2 hours before window.",
    });
  }

  if (suggestions.length === 0) {
    suggestions.push(
      {
        timestamp: new Date(input.opportunityWindowStart.getTime() - 60 * 60 * 1000),
        reason: "Post 1 hour before suggested promo window.",
      },
      {
        timestamp: input.opportunityWindowStart,
        reason: "Reminder post at opportunity start.",
      },
    );
  }

  const deduped = new Map<number, PostingScheduleSuggestion>();
  for (const suggestion of suggestions) {
    if (suggestion.timestamp.getTime() <= now.getTime()) continue;
    const rounded = new Date(
      Math.floor(suggestion.timestamp.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000),
    );
    deduped.set(rounded.getTime(), { ...suggestion, timestamp: rounded });
  }

  const computed = Array.from(deduped.values())
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .slice(0, 3);

  if (computed.length > 0) {
    return computed;
  }

  // If all calculated timestamps are already in the past, always return
  // one PH-time fallback slot so UI never shows an empty schedule.
  return [buildFallbackNextSlot({ opportunityType: input.opportunityType, now })];
}
