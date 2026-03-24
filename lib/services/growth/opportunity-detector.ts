import { getCurrentDateTimePH } from "@/lib/date-utils";
import { computeOpportunityScore } from "@/lib/services/growth/opportunity-scoring";
import type {
  GrowthContextPayload,
  OfferTypeLiteral,
  OpportunityCandidate,
  OpportunityTypeLiteral,
} from "@/lib/services/growth/types";
import { prisma } from "@/prisma/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseDateKeyToPHDate(dateKey: string, hour = 0, minute = 0) {
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildCandidate(input: {
  type: OpportunityTypeLiteral;
  reason: string;
  timeWindowStart: Date;
  timeWindowEnd: Date;
  recommendedOfferTypes: OfferTypeLiteral[];
  urgency: number;
  impact: number;
  confidence: number;
  feasibility: number;
  metadata?: Record<string, unknown>;
}): OpportunityCandidate {
  const breakdown = computeOpportunityScore({
    urgency: input.urgency,
    impact: input.impact,
    confidence: input.confidence,
    feasibility: input.feasibility,
  });
  return {
    type: input.type,
    reason: input.reason,
    timeWindowStart: input.timeWindowStart,
    timeWindowEnd: input.timeWindowEnd,
    recommendedOfferTypes: input.recommendedOfferTypes,
    urgency: breakdown.urgency,
    impact: breakdown.impact,
    confidence: breakdown.confidence,
    feasibility: breakdown.feasibility,
    score: breakdown.total,
    metadata: input.metadata,
  };
}

function detectPaydayWindow(now: Date) {
  const dayOfMonth = Number.parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      day: "2-digit",
    }).format(now),
    10,
  );
  return dayOfMonth >= 14 && dayOfMonth <= 16 || dayOfMonth >= 29 || dayOfMonth <= 1;
}

function detectWeekendPrep(now: Date) {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
  }).format(now);
  return day === "Thu" || day === "Fri";
}

type ParsedSignal = {
  type: string;
  name: string;
  date: string;
};

function parseSeasonalitySignal(signal: string): ParsedSignal | null {
  const first = signal.indexOf(":");
  if (first < 0) return null;
  const second = signal.indexOf(":", first + 1);
  if (second < 0) return null;

  const type = signal.slice(0, first).trim();
  const name = signal.slice(first + 1, second).trim();
  const date = signal.slice(second + 1).trim();
  if (!type || !name || !date) return null;

  return { type: type.toUpperCase(), name, date };
}

function pickSeasonalSignal(signals: string[]) {
  const parsed = signals
    .map(parseSeasonalitySignal)
    .filter((value): value is ParsedSignal => Boolean(value));
  if (parsed.length === 0) return null;

  const priority = ["LOCAL_EVENT", "FESTIVAL", "ACADEMIC", "HOLIDAY", "SEASONAL"];
  for (const type of priority) {
    const matches = parsed
      .filter((entry) => entry.type === type)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (matches.length > 0) return matches[0];
  }

  return parsed[0];
}

function buildSeasonalReason(signal: ParsedSignal) {
  if (signal.type === "LOCAL_EVENT") {
    return `Local demand signal: ${signal.name} near ${signal.date}. Targeted promos can capture nearby traffic.`;
  }
  if (signal.type === "FESTIVAL") {
    return `Festival period detected (${signal.name} on ${signal.date}). Event-related looks/services can lift bookings.`;
  }
  if (signal.type === "ACADEMIC") {
    return `${signal.name} is active. Student and family-prep offers can improve conversion this season.`;
  }
  if (signal.type === "HOLIDAY") {
    return `Upcoming ${signal.name} on ${signal.date} can drive prep bookings.`;
  }
  return `${signal.name} seasonal window is active. Time-bound promos may perform better today.`;
}

function buildWeatherReason(condition: string, localityName?: string) {
  const place = localityName ? ` around ${localityName}` : "";
  if (condition === "STORM") {
    return `Storm risk detected${place}. Indoor comfort offers and flexible slots can improve same-day conversion.`;
  }
  if (condition === "RAINY") {
    return `Rainy conditions expected${place}. Convenience-focused promos can recover walk-in demand.`;
  }
  if (condition === "HOT") {
    return `Hot weather forecast${place}. Cooling and self-care offers can outperform regular messaging.`;
  }
  if (condition === "COOL") {
    return `Cool weather window${place}. Wellness and relaxation bundles are likely to resonate.`;
  }
  return null;
}

export function detectOpportunityCandidates(input: {
  context: GrowthContextPayload;
  businessCreatedAt: Date;
  now?: Date;
}): OpportunityCandidate[] {
  const now = input.now || getCurrentDateTimePH();
  const candidates: OpportunityCandidate[] = [];
  const today = input.context.dailyCapacity[0];
  const dateKey =
    today?.date ||
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);

  if (today && today.openSlots >= Math.max(3, Math.floor(today.estimatedCapacitySlots * 0.35))) {
    const ratio = today.estimatedCapacitySlots > 0
      ? today.openSlots / today.estimatedCapacitySlots
      : 0;
    candidates.push(
      buildCandidate({
        type: "SLOW_HOURS",
        reason: `You have ${today.openSlots} open slots today with lower occupancy than target.`,
        timeWindowStart: parseDateKeyToPHDate(today.date, 14, 0),
        timeWindowEnd: parseDateKeyToPHDate(today.date, 17, 0),
        recommendedOfferTypes: ["FLASH_DEAL", "LIMITED_SLOTS"],
        urgency: 0.95,
        impact: clamp(ratio, 0.4, 0.95),
        confidence: 0.75,
        feasibility: today.openSlots > 0 ? 0.95 : 0.3,
        metadata: {
          openSlots: today.openSlots,
          estimatedCapacitySlots: today.estimatedCapacitySlots,
          occupancyRatio: Number((1 - ratio).toFixed(2)),
        },
      }),
    );
  }

  if (detectPaydayWindow(now)) {
    candidates.push(
      buildCandidate({
        type: "PAYDAY_SPIKE",
        reason: "Payday window is active — customers have fresh budget. A timely reminder can drive bookings without discounts.",
        timeWindowStart: parseDateKeyToPHDate(dateKey, 10, 0),
        timeWindowEnd: parseDateKeyToPHDate(dateKey, 19, 0),
        recommendedOfferTypes: ["SOCIAL_REMINDER"],
        urgency: 0.88,
        impact: 0.9,
        confidence: 0.78,
        feasibility: today && today.openSlots > 0 ? 0.85 : 0.6,
      }),
    );
  }

  if (detectWeekendPrep(now)) {
    candidates.push(
      buildCandidate({
        type: "WEEKEND_PREP",
        reason: "Weekend prep window detected — Thu/Fri posting tends to pre-book weekend services. A reminder can fill slots at full price.",
        timeWindowStart: parseDateKeyToPHDate(dateKey, 19, 0),
        timeWindowEnd: parseDateKeyToPHDate(dateKey, 23, 0),
        recommendedOfferTypes: ["SOCIAL_REMINDER", "CONTENT_POST"],
        urgency: 0.8,
        impact: 0.86,
        confidence: 0.72,
        feasibility: 0.8,
      }),
    );
  }

  const weather = input.context.weather;
  if (weather?.enabled && weather.condition && weather.condition !== "CLEAR" && weather.condition !== "UNKNOWN") {
    const weatherReason = buildWeatherReason(weather.condition, weather.localityName);
    if (weatherReason) {
      const feasibilityBase = today && today.openSlots > 0 ? 0.84 : 0.62;
      const rainChance =
        typeof weather.precipitationProbability === "number"
          ? clamp(weather.precipitationProbability / 100, 0, 1)
          : null;
      const confidenceBase =
        weather.condition === "STORM" || weather.condition === "RAINY"
          ? 0.78
          : 0.72;
      const confidence = clamp(
        confidenceBase + (rainChance !== null ? rainChance * 0.1 : 0),
        0.65,
        0.9,
      );
      candidates.push(
        buildCandidate({
          type: "WEATHER_HOOK",
          reason: weatherReason,
          timeWindowStart: parseDateKeyToPHDate(dateKey, 10, 0),
          timeWindowEnd: parseDateKeyToPHDate(dateKey, 20, 0),
          recommendedOfferTypes:
            weather.condition === "STORM" || weather.condition === "RAINY"
              ? ["FLASH_DEAL", "SOCIAL_REMINDER"]
              : ["SOCIAL_REMINDER", "CONTENT_POST"],
          urgency: weather.condition === "STORM" ? 0.9 : 0.8,
          impact: weather.condition === "HOT" ? 0.78 : 0.82,
          confidence,
          feasibility: feasibilityBase,
          metadata: {
            weatherCondition: weather.condition,
            weatherSummary: weather.summary || null,
            temperatureC:
              typeof weather.temperatureC === "number"
                ? weather.temperatureC
                : null,
            precipitationProbability:
              typeof weather.precipitationProbability === "number"
                ? weather.precipitationProbability
                : null,
            localityName: weather.localityName || null,
          },
        }),
      );
    }
  }

  const seasonalSignal = pickSeasonalSignal(input.context.seasonalitySignals);
  if (seasonalSignal) {
    const seasonalReason = buildSeasonalReason(seasonalSignal);
    const isAcademic = seasonalSignal.type === "ACADEMIC";
    const isLocal = seasonalSignal.type === "LOCAL_EVENT" || seasonalSignal.type === "FESTIVAL";
    const feasibility = today && today.openSlots > 0 ? 0.86 : 0.66;
    candidates.push(
      buildCandidate({
        type: "HOLIDAY_SEASONAL",
        reason: seasonalReason,
        timeWindowStart: parseDateKeyToPHDate(dateKey, 9, 0),
        timeWindowEnd: parseDateKeyToPHDate(dateKey, 20, 0),
        recommendedOfferTypes: isAcademic
          ? ["THEMED_PACKAGE", "CONTENT_POST"]
          : ["THEMED_PACKAGE", "CONTENT_POST"],
        urgency: isLocal ? 0.82 : isAcademic ? 0.76 : 0.72,
        impact: isLocal ? 0.86 : isAcademic ? 0.82 : 0.78,
        confidence: isLocal ? 0.76 : isAcademic ? 0.74 : 0.69,
        feasibility,
        metadata: {
          seasonalSignalType: seasonalSignal.type,
          seasonalSignalName: seasonalSignal.name,
          seasonalSignalDate: seasonalSignal.date,
        },
      }),
    );
  }

  const createdMonthDay = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "2-digit",
    day: "2-digit",
  }).format(input.businessCreatedAt);
  const todayMonthDay = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (createdMonthDay === todayMonthDay) {
    candidates.push(
      buildCandidate({
        type: "ANNIVERSARY",
        reason: "Business anniversary window detected. Anniversary messaging can reactivate lapsed clients.",
        timeWindowStart: parseDateKeyToPHDate(dateKey, 11, 0),
        timeWindowEnd: parseDateKeyToPHDate(dateKey, 21, 0),
        recommendedOfferTypes: ["LOYALTY_REWARD", "THEMED_PACKAGE"],
        urgency: 0.65,
        impact: 0.72,
        confidence: 0.65,
        feasibility: 0.9,
      }),
    );
  }

  // Filter out opportunities whose window has already passed or is less than
  // 30 minutes away from ending — no point suggesting something that can't be acted on.
  const MIN_REMAINING_MS = 30 * 60 * 1000;
  const cutoff = new Date(now.getTime() + MIN_REMAINING_MS);

  return candidates
    .filter((c) => c.timeWindowEnd > cutoff)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export async function refreshOpportunitiesForSnapshot(input: {
  businessId: string;
  snapshotId: string;
  context: GrowthContextPayload;
  businessCreatedAt: Date;
  minimumConfidence: number;
}) {
  const now = getCurrentDateTimePH();
  await prisma.opportunity.updateMany({
    where: {
      business_id: input.businessId,
      status: "OPEN",
      time_window_end: {
        lt: now,
      },
    },
    data: {
      status: "EXPIRED",
    },
  });

  const candidates = detectOpportunityCandidates({
    context: input.context,
    businessCreatedAt: input.businessCreatedAt,
    now,
  }).filter((candidate) => candidate.confidence >= input.minimumConfidence);

  const created = [];
  for (const candidate of candidates.slice(0, 3)) {
    const opportunity = await prisma.opportunity.create({
      data: {
        business_id: input.businessId,
        snapshot_id: input.snapshotId,
        type: candidate.type,
        reason: candidate.reason,
        time_window_start: candidate.timeWindowStart,
        time_window_end: candidate.timeWindowEnd,
        urgency_score: candidate.urgency,
        impact_score: candidate.impact,
        confidence_score: candidate.confidence,
        feasibility_score: candidate.feasibility,
        total_score: candidate.score,
        recommended_offer_types: candidate.recommendedOfferTypes,
        metadata: candidate.metadata ? toInputJson(candidate.metadata) : undefined,
      },
    });
    created.push(opportunity);
  }

  return created;
}
