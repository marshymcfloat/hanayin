import { describe, expect, it } from "vitest";
import { canPublishLinkedSocialPost, type OwnerSaleEventPreviewSocialPost } from "./owner-sale-event-preview";

const post: OwnerSaleEventPreviewSocialPost = {
  id: "post-1", title: "Offer", status: "READY", lastError: null, publishedAt: null,
  targets: [{ id: "target-1", platform: "FACEBOOK_PAGE", status: "SKIPPED", lastError: null }],
};

describe("linked sale-event post publishing", () => {
  it("allows only ready or draft posts without active delivery or failure", () => {
    expect(canPublishLinkedSocialPost(post)).toBe(true);
    expect(canPublishLinkedSocialPost({ ...post, status: "PUBLISHING" })).toBe(false);
    expect(canPublishLinkedSocialPost({ ...post, status: "PUBLISHED" })).toBe(false);
    expect(canPublishLinkedSocialPost({ ...post, targets: [{ ...post.targets[0], status: "QUEUED" }] })).toBe(false);
    expect(canPublishLinkedSocialPost({ ...post, targets: [{ ...post.targets[0], status: "PUBLISHING" }] })).toBe(false);
    expect(canPublishLinkedSocialPost({ ...post, targets: [{ ...post.targets[0], status: "FAILED" }] })).toBe(false);
  });
});
