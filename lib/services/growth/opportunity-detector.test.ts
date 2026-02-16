import { describe, expect, it } from "vitest";

import { detectOpportunityCandidates } from "@/lib/services/growth/opportunity-detector";
import type { GrowthContextPayload } from "@/lib/services/growth/types";

function buildBaseContext(): GrowthContextPayload {
  return {
    businessSlug: "demo",
    businessName: "Demo Salon",
    businessType: "SALON",
    serviceCount: 8,
    packageCount: 2,
    providerCount: 3,
    averageServiceDurationMinutes: 60,
    averageServicePrice: 500,
    dailyCapacity: [
      {
        date: "2026-02-10",
        estimatedCapacitySlots: 10,
        bookedSlots: 9,
        openSlots: 1,
      },
    ],
    weather: {
      enabled: false,
    },
    seasonalitySignals: [],
  };
}

describe("detectOpportunityCandidates", () => {
  it("adds WEATHER_HOOK candidate when weather signal is directional", () => {
    const context = buildBaseContext();
    context.weather = {
      enabled: true,
      condition: "RAINY",
      summary: "Rainy conditions expected.",
      temperatureC: 27,
      precipitationProbability: 88,
      localityName: "Puerto Princesa",
      source: "open-meteo",
      observedAt: "2026-02-10T09:00:00+08:00",
    };

    const result = detectOpportunityCandidates({
      context,
      businessCreatedAt: new Date("2020-01-01T00:00:00+08:00"),
      now: new Date("2026-02-10T09:00:00+08:00"),
    });

    const weatherCandidate = result.find((entry) => entry.type === "WEATHER_HOOK");
    expect(weatherCandidate).toBeDefined();
    expect(weatherCandidate?.reason).toContain("Rainy conditions");
  });

  it("promotes local seasonal signals into HOLIDAY_SEASONAL candidate", () => {
    const context = buildBaseContext();
    context.seasonalitySignals = [
      "LOCAL_EVENT:City Foundation Day:2026-03-15",
    ];

    const result = detectOpportunityCandidates({
      context,
      businessCreatedAt: new Date("2020-01-01T00:00:00+08:00"),
      now: new Date("2026-03-10T10:00:00+08:00"),
    });

    const seasonalCandidate = result.find(
      (entry) => entry.type === "HOLIDAY_SEASONAL",
    );
    expect(seasonalCandidate).toBeDefined();
    expect(seasonalCandidate?.reason).toContain("Local demand signal");
    expect(seasonalCandidate?.metadata?.seasonalSignalType).toBe("LOCAL_EVENT");
  });

  it("uses student-friendly offer mix for academic season signals", () => {
    const context = buildBaseContext();
    context.seasonalitySignals = [
      "ACADEMIC:Graduation Season:2026-03-20",
    ];

    const result = detectOpportunityCandidates({
      context,
      businessCreatedAt: new Date("2020-01-01T00:00:00+08:00"),
      now: new Date("2026-03-10T10:00:00+08:00"),
    });

    const seasonalCandidate = result.find(
      (entry) => entry.type === "HOLIDAY_SEASONAL",
    );
    expect(seasonalCandidate).toBeDefined();
    expect(seasonalCandidate?.recommendedOfferTypes).toContain("STUDENT_PROMO");
    expect(seasonalCandidate?.metadata?.seasonalSignalType).toBe("ACADEMIC");
  });
});

