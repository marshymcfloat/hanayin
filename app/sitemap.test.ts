import { describe, expect, it, vi } from "vitest";

const connectionMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({
  connection: connectionMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: {
    business: {
      findMany: findManyMock,
    },
  },
}));

vi.mock("@/lib/site-url", () => ({
  getSiteUrl: vi.fn(() => "https://serviceflow.test"),
}));

import sitemap from "./sitemap";

describe("sitemap generation", () => {
  it("excludes facing routes for businesses without website entitlement", async () => {
    findManyMock.mockResolvedValue([
      {
        slug: "starter-biz",
        updated_at: new Date("2026-02-15T00:00:00.000Z"),
        subscriptions: [{ plan: { code: "STARTER_MONTHLY" } }],
        _count: { services: 1 },
      },
      {
        slug: "plus-biz",
        updated_at: new Date("2026-02-15T00:00:00.000Z"),
        subscriptions: [{ plan: { code: "PLUS_MONTHLY" } }],
        _count: { services: 2 },
      },
    ]);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);

    expect(urls).toContain("https://serviceflow.test/plus-biz");
    expect(urls).toContain("https://serviceflow.test/plus-biz/services");
    expect(urls).not.toContain("https://serviceflow.test/starter-biz");
    expect(urls).not.toContain("https://serviceflow.test/starter-biz/services");
  });
});

