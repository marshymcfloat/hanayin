import { prisma } from "@/prisma/prisma";
import type { OfferTypeLiteral } from "@/lib/services/growth/types";

const MANILA_TIMEZONE = "Asia/Manila";

export type MonthlyPlannerEventType =
  | "HOLIDAY"
  | "FESTIVAL"
  | "ACADEMIC"
  | "PAYDAY"
  | "LOCAL_EVENT"
  | "SEASONAL"
  | "ANNIVERSARY"
  | "WEEKEND";

export type MonthlyPlannerEvent = {
  id: string;
  date: Date;
  name: string;
  type: MonthlyPlannerEventType;
  suggestedActionTypes: OfferTypeLiteral[];
  existingCampaignId: string | null;
  existingCampaignStatus: string | null;
};

const ACTION_BY_EVENT_TYPE: Record<MonthlyPlannerEventType, OfferTypeLiteral[]> = {
  HOLIDAY: ["THEMED_PACKAGE", "CONTENT_POST"],
  FESTIVAL: ["THEMED_PACKAGE", "CONTENT_POST"],
  ACADEMIC: ["THEMED_PACKAGE", "CONTENT_POST"],
  SEASONAL: ["THEMED_PACKAGE", "CONTENT_POST"],
  LOCAL_EVENT: ["THEMED_PACKAGE", "CONTENT_POST"],
  PAYDAY: ["SOCIAL_REMINDER"],
  ANNIVERSARY: ["LOYALTY_REWARD", "THEMED_PACKAGE"],
  WEEKEND: ["SOCIAL_REMINDER", "CONTENT_POST"],
};

function getMonthRangePH(year: number, month: number) {
  const start = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+08:00`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+08:00`);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return { start, end };
}

function toPHDate(year: number, month: number, day: number) {
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+08:00`);
}

function getDayOfWeekPH(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE,
    weekday: "short",
  }).format(date);
}

function getMonthDayPH(date: Date) {
  return {
    month: Number.parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TIMEZONE, month: "2-digit" }).format(date),
      10,
    ),
    day: Number.parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TIMEZONE, day: "2-digit" }).format(date),
      10,
    ),
  };
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function classifyEventType(eventType: string): MonthlyPlannerEventType {
  const upper = eventType.toUpperCase();
  if (upper.includes("FESTIVAL")) return "FESTIVAL";
  if (upper.includes("ACADEMIC")) return "ACADEMIC";
  if (upper.includes("HOLIDAY")) return "HOLIDAY";
  if (upper.includes("PAYDAY")) return "PAYDAY";
  if (upper.includes("LOCAL")) return "LOCAL_EVENT";
  return "SEASONAL";
}

function getAcademicSeasons(month: number): { name: string; type: MonthlyPlannerEventType }[] {
  const seasons: { name: string; type: MonthlyPlannerEventType }[] = [];
  if (month >= 1 && month <= 3) seasons.push({ name: "Prom Season", type: "ACADEMIC" });
  if (month >= 3 && month <= 6) seasons.push({ name: "Graduation Season", type: "ACADEMIC" });
  if (month >= 6 && month <= 9) seasons.push({ name: "New Academic Year", type: "ACADEMIC" });
  return seasons;
}

export async function getMonthlyPlannerEvents(input: {
  businessId: string;
  businessSlug: string;
  businessCreatedAt: Date;
  year: number;
  month: number;
}): Promise<MonthlyPlannerEvent[]> {
  const { year, month } = input;
  const { start, end } = getMonthRangePH(year, month);
  const daysInMonth = getDaysInMonth(year, month);

  const [seasonalEvents, campaigns] = await Promise.all([
    prisma.seasonalCalendar.findMany({
      where: {
        country_code: "PH",
        is_active: true,
        event_date: { gte: start, lte: end },
      },
      select: {
        id: true,
        event_name: true,
        event_type: true,
        event_date: true,
      },
      orderBy: { event_date: "asc" },
    }),
    prisma.campaign.findMany({
      where: {
        business_id: input.businessId,
        created_at: { gte: start, lte: end },
      },
      select: {
        id: true,
        status: true,
        title: true,
        created_at: true,
        opportunity: {
          select: { type: true },
        },
      },
    }),
  ]);

  const events: MonthlyPlannerEvent[] = [];
  const campaignByDate = new Map<string, typeof campaigns[number]>();
  for (const campaign of campaigns) {
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TIMEZONE }).format(campaign.created_at);
    if (!campaignByDate.has(dateKey)) {
      campaignByDate.set(dateKey, campaign);
    }
  }

  function findCampaignForDate(date: Date) {
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TIMEZONE }).format(date);
    return campaignByDate.get(dateKey) || null;
  }

  // 1. Seasonal calendar events
  for (const event of seasonalEvents) {
    const type = classifyEventType(event.event_type);
    const campaign = findCampaignForDate(event.event_date);
    events.push({
      id: `seasonal-${event.id}`,
      date: event.event_date,
      name: event.event_name,
      type,
      suggestedActionTypes: ACTION_BY_EVENT_TYPE[type],
      existingCampaignId: campaign?.id || null,
      existingCampaignStatus: campaign?.status || null,
    });
  }

  // 2. Payday dates (15th and 30th)
  for (const day of [15, 30]) {
    if (day > daysInMonth) continue;
    const date = toPHDate(year, month, day);
    const campaign = findCampaignForDate(date);
    events.push({
      id: `payday-${year}-${month}-${day}`,
      date,
      name: day === 15 ? "Mid-Month Payday" : "End-Month Payday",
      type: "PAYDAY",
      suggestedActionTypes: ACTION_BY_EVENT_TYPE.PAYDAY,
      existingCampaignId: campaign?.id || null,
      existingCampaignStatus: campaign?.status || null,
    });
  }

  // 3. Academic seasons (show as first day of month if applicable)
  for (const season of getAcademicSeasons(month)) {
    const date = toPHDate(year, month, 1);
    events.push({
      id: `academic-${season.name.toLowerCase().replace(/\s+/g, "-")}-${year}-${month}`,
      date,
      name: season.name,
      type: season.type,
      suggestedActionTypes: ACTION_BY_EVENT_TYPE.ACADEMIC,
      existingCampaignId: null,
      existingCampaignStatus: null,
    });
  }

  // 4. Business anniversary
  const anniversaryMD = getMonthDayPH(input.businessCreatedAt);
  if (anniversaryMD.month === month && anniversaryMD.day <= daysInMonth) {
    const date = toPHDate(year, month, anniversaryMD.day);
    const campaign = findCampaignForDate(date);
    events.push({
      id: `anniversary-${year}-${month}`,
      date,
      name: "Business Anniversary",
      type: "ANNIVERSARY",
      suggestedActionTypes: ACTION_BY_EVENT_TYPE.ANNIVERSARY,
      existingCampaignId: campaign?.id || null,
      existingCampaignStatus: campaign?.status || null,
    });
  }

  // 5. Weekend prep dates (every Thursday)
  for (let day = 1; day <= daysInMonth; day++) {
    const date = toPHDate(year, month, day);
    const dow = getDayOfWeekPH(date);
    if (dow === "Thu") {
      events.push({
        id: `weekend-${year}-${month}-${day}`,
        date,
        name: "Weekend Prep",
        type: "WEEKEND",
        suggestedActionTypes: ACTION_BY_EVENT_TYPE.WEEKEND,
        existingCampaignId: null,
        existingCampaignStatus: null,
      });
    }
  }

  // Sort by date, deduplicate same-day same-type
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  const seen = new Set<string>();
  return events.filter((event) => {
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TIMEZONE }).format(event.date);
    const key = `${dateKey}-${event.type}-${event.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
