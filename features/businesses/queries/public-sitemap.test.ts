import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/prisma/prisma", () => ({
  prisma: {
    business: {
      findMany: findManyMock,
    },
  },
}));

import { listPublicBusinessSitemapEntries } from "./public-sitemap";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public business sitemap query", () => {
  it("queries only published businesses and returns an eligible public DTO", async () => {
    const updatedAt = new Date("2026-02-15T00:00:00.000Z");
    findManyMock.mockResolvedValue([
      {
        slug: "plus-biz",
        updated_at: updatedAt,
        subscriptions: [{ plan: { code: "PLUS_MONTHLY" } }],
        _count: { services: 2 },
      },
    ]);

    await expect(listPublicBusinessSitemapEntries()).resolves.toEqual([
      { slug: "plus-biz", updatedAt, hasServices: true },
    ]);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          subscriptions: {
            some: {
              status: { in: ["TRIALING", "ACTIVE", "GRACE_PERIOD"] },
            },
          },
        },
      }),
    );
  });

  it("excludes businesses whose plans do not publish a website", async () => {
    findManyMock.mockResolvedValue([
      {
        slug: "starter-biz",
        updated_at: new Date("2026-02-15T00:00:00.000Z"),
        subscriptions: [{ plan: { code: "STARTER_MONTHLY" } }],
        _count: { services: 1 },
      },
    ]);

    await expect(listPublicBusinessSitemapEntries()).resolves.toEqual([]);
  });

  it("returns an empty result when no published businesses exist", async () => {
    findManyMock.mockResolvedValue([]);

    await expect(listPublicBusinessSitemapEntries()).resolves.toEqual([]);
  });
});
