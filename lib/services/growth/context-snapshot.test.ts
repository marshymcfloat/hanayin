import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  businessGrowthSettings: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  service: {
    findMany: vi.fn(),
  },
  business: {
    findUnique: vi.fn(),
  },
  booking: {
    findMany: vi.fn(),
  },
  seasonalCalendar: {
    findMany: vi.fn(),
  },
  growthContextSnapshot: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
}));

const fetchLocalityForCoordinatesMock = vi.hoisted(() => vi.fn());
const fetchWeatherSnapshotForCoordinatesMock = vi.hoisted(() => vi.fn());
const buildAcademicSeasonSignalsMock = vi.hoisted(() => vi.fn(() => []));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/growth/location-intelligence", () => ({
  buildAcademicSeasonSignals: buildAcademicSeasonSignalsMock,
  fetchLocalityForCoordinates: fetchLocalityForCoordinatesMock,
  fetchWeatherSnapshotForCoordinates: fetchWeatherSnapshotForCoordinatesMock,
}));

import { refreshGrowthContextSnapshot } from "@/lib/services/growth/context-snapshot";

function buildBusinessRecord(input?: {
  latitude?: number | null;
  longitude?: number | null;
}) {
  return {
    id: "biz_1",
    slug: "demo-spa",
    name: "Demo Spa",
    latitude:
      input && "latitude" in input ? input.latitude ?? null : 14.5547,
    longitude:
      input && "longitude" in input ? input.longitude ?? null : 121.0244,
    services: [{ id: 1, duration: 60, price: 700, category: "Spa" }],
    packages: [],
    employees: [{ id: 100 }],
    owners: [{ id: 200 }],
    business_hours: [
      {
        day_of_week: 1,
        category: "general",
        is_closed: false,
        open_time: "09:00",
        close_time: "18:00",
      },
    ],
  };
}

describe("refreshGrowthContextSnapshot", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    prismaMock.businessGrowthSettings.findUnique.mockResolvedValue({
      id: "growth_1",
      business_id: "biz_1",
      business_type: "SPA",
      weather_hooks_enabled: true,
    });
    prismaMock.business.findUnique.mockResolvedValue(buildBusinessRecord());
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.seasonalCalendar.findMany.mockResolvedValue([]);
    prismaMock.growthContextSnapshot.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "snap_1",
        ...data,
      }),
    );
    buildAcademicSeasonSignalsMock.mockReturnValue([]);

    fetchLocalityForCoordinatesMock.mockResolvedValue({
      displayName: "Makati, Metro Manila, NCR",
      city: "Makati",
      province: "Metro Manila",
      region: "NCR",
      countryCode: "PH",
    });
    fetchWeatherSnapshotForCoordinatesMock.mockResolvedValue({
      summary: "Rainy conditions today (78% rain chance).",
      condition: "RAINY",
      temperatureC: 27.1,
      precipitationProbability: 78,
      source: "open-meteo",
      observedAt: "2026-02-17T09:00:00+08:00",
    });
  });

  it("uses the business coordinates for locality and weather lookups", async () => {
    await refreshGrowthContextSnapshot("demo-spa");

    expect(fetchLocalityForCoordinatesMock).toHaveBeenCalledWith({
      latitude: 14.5547,
      longitude: 121.0244,
    });
    expect(fetchWeatherSnapshotForCoordinatesMock).toHaveBeenCalledWith({
      latitude: 14.5547,
      longitude: 121.0244,
    });
  });

  it("skips weather lookups without coordinates and records the missing-location reason", async () => {
    prismaMock.business.findUnique.mockResolvedValue(
      buildBusinessRecord({ latitude: null, longitude: null }),
    );

    await refreshGrowthContextSnapshot("demo-spa");

    expect(fetchLocalityForCoordinatesMock).not.toHaveBeenCalled();
    expect(fetchWeatherSnapshotForCoordinatesMock).not.toHaveBeenCalled();

    const createCall = prismaMock.growthContextSnapshot.create.mock.calls[0]?.[0];
    expect(createCall?.data?.weather_summary_json).toEqual({
      status: "unavailable",
      reason: "Business coordinates missing.",
    });
  });
});
