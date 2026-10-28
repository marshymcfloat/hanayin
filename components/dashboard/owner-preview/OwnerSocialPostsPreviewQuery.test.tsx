import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { OwnerSocialPostsPreviewData } from "@/features/social/types/owner-social-post-preview";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";
import { hasPendingSocialDelivery, invalidateAfterSocialPostMutation, mergeSocialDeliveryStatuses } from "./OwnerSocialPostsPreviewQuery";

const identity: OwnerPreviewIdentity = {
  userId: "owner-1", businessId: "business-1", businessSlug: "beautyfeel", businessName: "BeautyFeel", ownerName: "Owner",
};

const data: OwnerSocialPostsPreviewData = {
  section: "social-posts",
  generatedAt: "2026-09-25T00:00:00.000Z",
  business: { slug: "beautyfeel", name: "BeautyFeel", imageUrl: null },
  metrics: { totalPosts: 1, drafts: 0, ready: 0, publishing: 1, published: 0, failed: 0 },
  connections: [], referenceAssets: [],
  posts: [{
    id: "post-1", title: "Offer", status: "PUBLISHING", caption: "Offer", hashtags: [], mediaUrl: null,
    lastError: null, createdAt: "2026-09-25T00:00:00.000Z", publishedAt: null, saleEvent: null, growth: null,
    targets: [{ id: "target-1", status: "QUEUED", lastError: null, publishedAt: null, remotePermalink: null,
      connection: { platform: "FACEBOOK_PAGE", displayName: "Page", status: "CONNECTED" } }],
  }],
};

describe("social preview delivery cache", () => {
  it("polls only while a visible post has a queued or publishing delivery", () => {
    expect(hasPendingSocialDelivery(data)).toBe(true);
    expect(hasPendingSocialDelivery({ ...data, posts: [{ ...data.posts[0], status: "PUBLISHED", targets: [{ ...data.posts[0].targets[0], status: "PUBLISHED" }] }] })).toBe(false);
  });

  it("merges only backend-confirmed delivery statuses and recomputes summary", () => {
    const unchanged = mergeSocialDeliveryStatuses(data, { generatedAt: data.generatedAt, posts: [{ id: "post-1", status: "PUBLISHING", lastError: null, publishedAt: null, targets: [{ id: "target-1", status: "QUEUED", lastError: null, publishedAt: null, remotePermalink: null }] }] });
    expect(unchanged).toBe(data);
    const latest = mergeSocialDeliveryStatuses(data, { generatedAt: "2026-09-25T01:00:00.000Z", posts: [{ id: "post-1", status: "PUBLISHED", lastError: null, publishedAt: "2026-09-25T01:00:00.000Z", targets: [{ id: "target-1", status: "PUBLISHED", lastError: null, publishedAt: "2026-09-25T01:00:00.000Z", remotePermalink: "https://example.test/post" }] }] });
    expect(latest.posts[0].status).toBe("PUBLISHED");
    expect(latest.posts[0].targets[0].remotePermalink).toBe("https://example.test/post");
    expect(latest.metrics).toMatchObject({ publishing: 0, published: 1 });
    expect(hasPendingSocialDelivery(latest)).toBe(false);
    const older = mergeSocialDeliveryStatuses(latest, { generatedAt: "2026-09-25T00:30:00.000Z", posts: [{ id: "post-1", status: "PUBLISHING", lastError: null, publishedAt: null, targets: [{ id: "target-1", status: "QUEUED", lastError: null, publishedAt: null, remotePermalink: null }] }] });
    expect(older).toBe(latest);
    const freshPage = { ...data, generatedAt: "2026-09-25T02:00:00.000Z" };
    expect(mergeSocialDeliveryStatuses(freshPage, { generatedAt: "2026-09-25T01:30:00.000Z", posts: [] })).toBe(freshPage);
  });

  it("invalidates only this owner's related pages", () => {
    const client = new QueryClient();
    for (const page of ["social-posts", "sale-events", "dashboard", "growth", "reports", "billing"]) {
      client.setQueryData(ownerPreviewKeys.section(identity, page, "page"), { page });
    }
    invalidateAfterSocialPostMutation(client, identity);
    for (const page of ["social-posts", "sale-events", "dashboard", "growth", "reports"]) {
      expect(client.getQueryState(ownerPreviewKeys.section(identity, page, "page"))?.isInvalidated).toBe(true);
    }
    expect(client.getQueryState(ownerPreviewKeys.section(identity, "billing", "page"))?.isInvalidated).toBe(false);
  });
});
