import { describe, expect, it } from "vitest";
import {
  createOwnerPreviewQueryClient,
  OWNER_PREVIEW_CACHE_TIME,
  ownerPreviewKeys,
  ownerPreviewStaleTime,
} from "./owner-preview-query";

describe("owner preview query cache", () => {
  it("keeps inactive results for fifteen minutes and refetches stale data on focus", () => {
    const client = createOwnerPreviewQueryClient();
    expect(client.getDefaultOptions().queries?.gcTime).toBe(OWNER_PREVIEW_CACHE_TIME);
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(true);
    expect(ownerPreviewStaleTime.queue).toBe(10_000);
    expect(ownerPreviewStaleTime.socialPosts).toBe(30_000);
    expect(ownerPreviewStaleTime.dashboardAnalytics).toBe(60_000);
    expect(ownerPreviewStaleTime.catalog).toBe(120_000);
    client.clear();
  });

  it("isolates owner and business identities while supporting section and page invalidation", () => {
    const first = { userId: "owner-a", businessId: "business-a", businessSlug: "studio-a" };
    const otherOwner = { userId: "owner-b", businessId: "business-a", businessSlug: "studio-a" };
    const otherBusiness = { userId: "owner-a", businessId: "business-b", businessSlug: "studio-a" };
    const renamedBusiness = { ...first, businessSlug: "studio-renamed" };
    const client = createOwnerPreviewQueryClient();
    const firstKey = ownerPreviewKeys.section(first, "dashboard", "performance", { range: "month" });
    client.setQueryData(firstKey, { revenue: 100 });
    client.setQueryData(ownerPreviewKeys.section(first, "dashboard", "queue"), { count: 2 });

    expect(client.getQueryData(ownerPreviewKeys.section(otherOwner, "dashboard", "performance", { range: "month" }))).toBeUndefined();
    expect(client.getQueryData(ownerPreviewKeys.section(otherBusiness, "dashboard", "performance", { range: "month" }))).toBeUndefined();
    expect(client.getQueryData(ownerPreviewKeys.section(renamedBusiness, "dashboard", "performance", { range: "month" }))).toBeUndefined();

    const matches = client.getQueryCache().findAll({ queryKey: ownerPreviewKeys.page(first, "dashboard") });
    expect(matches).toHaveLength(2);
    expect(client.getQueryCache().findAll({ queryKey: ownerPreviewKeys.page(otherOwner, "dashboard") })).toHaveLength(0);
    expect(client.getQueryCache().findAll({ queryKey: ownerPreviewKeys.page(renamedBusiness, "dashboard") })).toHaveLength(0);
    client.clear();
  });
});
