import { describe, expect, it, vi } from "vitest";

const connectionMock = vi.hoisted(() => vi.fn());
const listPublicBusinessSitemapEntriesMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({
  connection: connectionMock,
}));

vi.mock("@/features/businesses/queries/public-sitemap", () => ({
  listPublicBusinessSitemapEntries: listPublicBusinessSitemapEntriesMock,
}));

vi.mock("@/lib/site-url", () => ({
  getSiteUrl: vi.fn(() => "https://serviceflow.test"),
}));

import sitemap from "./sitemap";

describe("sitemap generation", () => {
  it("adds public business routes and omits reserved slugs", async () => {
    listPublicBusinessSitemapEntriesMock.mockResolvedValue([
      {
        slug: "about",
        updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        hasServices: true,
      },
      {
        slug: "plus-biz",
        updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        hasServices: true,
      },
    ]);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);

    expect(urls).toContain("https://serviceflow.test/plus-biz");
    expect(urls).toContain("https://serviceflow.test/plus-biz/services");
    expect(urls.filter((url) => url === "https://serviceflow.test/about")).toHaveLength(1);
    expect(urls).not.toContain("https://serviceflow.test/about/services");
  });
});
