import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  businessFindUnique: vi.fn(),
  businessFindMany: vi.fn(),
  serviceFindMany: vi.fn(),
  saleEventFindMany: vi.fn(),
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: {
    business: {
      findUnique: mocks.businessFindUnique,
      findMany: mocks.businessFindMany,
    },
    service: { findMany: mocks.serviceFindMany },
    saleEvent: { findMany: mocks.saleEventFindMany },
  },
}));

vi.mock("@/lib/site-url", () => ({
  toAbsoluteUrl: (path: string) => `https://serviceflow.test${path}`,
}));

import {
  buildLocalBusinessJsonLd,
  getPublicBusinessProfile,
  listPublicDirectoryBusinesses,
} from "./public-directory";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public business queries", () => {
  it("lists only non-suspended directory businesses", async () => {
    mocks.businessFindMany.mockResolvedValue([]);

    await listPublicDirectoryBusinesses();

    expect(mocks.businessFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          subscriptions: {
            some: { status: { notIn: ["SUSPENDED", "CANCELED"] } },
          },
        },
      }),
    );
  });

  it("scopes profile children to the resolved business and supplied clock", async () => {
    const now = new Date("2030-02-01T00:00:00.000Z");
    mocks.businessFindUnique.mockResolvedValue({
      id: "business-1",
      name: "Test Salon",
      slug: "test-salon",
      description: null,
      imageUrl: null,
      latitude: null,
      longitude: null,
      business_hours: [],
    });
    mocks.serviceFindMany.mockResolvedValue([]);
    mocks.saleEventFindMany.mockResolvedValue([]);

    await getPublicBusinessProfile("test-salon", now);

    expect(mocks.serviceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { business_id: "business-1" } }),
    );
    expect(mocks.saleEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          business_id: "business-1",
          start_date: { lte: now },
          end_date: { gte: now },
        }),
      }),
    );
  });
});

describe("LocalBusiness response mapping", () => {
  it("prefers general hours and preserves zero coordinates", () => {
    const result = buildLocalBusinessJsonLd({
      name: "Test Salon",
      slug: "test-salon",
      description: null,
      imageUrl: null,
      latitude: 0,
      longitude: 0,
      business_hours: [
        { category: "HAIR", day_of_week: 1, open_time: "08:00", close_time: "17:00" },
        { category: "GENERAL", day_of_week: 2, open_time: "09:00", close_time: "18:00" },
      ],
    });

    expect(result).toMatchObject({
      url: "https://serviceflow.test/test-salon",
      geo: { latitude: 0, longitude: 0 },
      openingHoursSpecification: [
        { dayOfWeek: "Tuesday", opens: "09:00", closes: "18:00" },
      ],
    });
  });
});
