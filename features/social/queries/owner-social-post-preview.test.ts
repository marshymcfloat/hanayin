import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  business: vi.fn(),
  posts: vi.fn(),
  connections: vi.fn(),
  assets: vi.fn(),
}));

vi.mock("@/lib/auth/staff-access", () => ({
  resolveTenantActorContext: mocks.actor,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: {
    business: { findFirst: mocks.business },
    socialPost: { findMany: mocks.posts },
    socialConnection: { findMany: mocks.connections },
    brandAsset: { findMany: mocks.assets },
  },
}));

import {
  resolveOwnerSocialPostDeliveryPreview,
  resolveOwnerSocialPostsPreviewReadModel,
  toOwnerSocialPostPreviewDto,
  type OwnerSocialPostPreviewQueryRow,
} from "./owner-social-post-preview";

const row: OwnerSocialPostPreviewQueryRow = {
  id: "post-1",
  title: "Rainy day reset",
  status: "FAILED",
  caption_draft: "A calm reset.",
  caption_final: "  A calm reset for rainy days.  ",
  hashtags: ["#reset"],
  media_url: "https://cdn.example.test/post.jpg",
  last_error: "Provider timeout",
  created_at: new Date("2026-09-20T00:00:00.000Z"),
  published_at: null,
  sale_event: {
    title: "Rainy day offer",
    description: "A quiet reset",
    discount_type: "PERCENTAGE",
    discount_value: 15,
    start_date: new Date("2026-09-20T00:00:00.000Z"),
    end_date: new Date("2026-09-30T00:00:00.000Z"),
  },
  growth_campaigns: [
    {
      opportunity_snapshot: {
        creativeContext: {
          version: 1,
          anchor: "RAINY_SEASON_COMFORT",
          anchorLabel: "Rainy-season comfort",
          requiredContext: "Show rainy weather.",
          audience: "Local clients",
        },
      },
    },
  ],
  targets: [
    {
      id: "target-1",
      status: "FAILED",
      last_error: "Provider timeout",
      published_at: null,
      remote_permalink: null,
      social_connection: {
        platform: "FACEBOOK_PAGE",
        display_name: "Studio page",
        status: "CONNECTED",
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    success: true,
    actorType: "OWNER",
    ownerId: 7,
    businessId: "business-1",
    businessSlug: "studio-luna",
  });
  mocks.business.mockResolvedValue({
    id: "business-1",
    slug: "studio-luna",
    name: "Studio Luna",
    imageUrl: null,
  });
  mocks.posts.mockResolvedValue([row]);
  mocks.connections.mockResolvedValue([
    { id: "connection-1", platform: "FACEBOOK_PAGE", display_name: "Studio page", status: "CONNECTED" },
  ]);
  mocks.assets.mockResolvedValue([]);
});

describe("owner social posts preview query", () => {
  it("maps backend lifecycle, sale, growth, and target data without provider secrets", () => {
    const dto = toOwnerSocialPostPreviewDto(row);

    expect(dto).toMatchObject({
      id: "post-1",
      status: "FAILED",
      caption: "A calm reset for rainy days.",
      saleEvent: { title: "Rainy day offer", discountValue: 15 },
      growth: { anchorLabel: "Rainy-season comfort", audience: "Local clients" },
      targets: [{ connection: { displayName: "Studio page", status: "CONNECTED" } }],
    });
    expect(JSON.stringify(dto)).not.toContain("access_token");
    expect(JSON.stringify(dto)).not.toContain("secret");
    expect(dto.createdAt).toBe("2026-09-20T00:00:00.000Z");
  });

  it("requires the verified owner context and scopes every read to that business", async () => {
    const result = await resolveOwnerSocialPostsPreviewReadModel("studio-luna", "owner-1");

    expect(result.success).toBe(true);
    expect(mocks.actor).toHaveBeenCalledWith("studio-luna", "owner-1");
    expect(mocks.business).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "business-1",
        slug: "studio-luna",
        owners: { some: { id: 7, user_id: "owner-1" } },
      }),
    }));
    expect(mocks.posts).toHaveBeenCalledWith(expect.objectContaining({
      where: { business_id: "business-1" },
    }));
    expect(mocks.connections).toHaveBeenCalledWith(expect.objectContaining({
      where: { business_id: "business-1" },
    }));
  });

  it("returns a safe permission result for a non-owner or foreign tenant", async () => {
    mocks.actor.mockResolvedValue({ success: false, error: "Forbidden" });

    await expect(
      resolveOwnerSocialPostsPreviewReadModel("studio-luna", "employee-1"),
    ).resolves.toEqual({
      success: false,
      reason: "FORBIDDEN",
      error: "You do not have access to this owner preview.",
    });
    expect(mocks.business).not.toHaveBeenCalled();
  });

  it("preserves empty and load-failure states without inventing posts", async () => {
    mocks.posts.mockResolvedValue([]);
    const empty = await resolveOwnerSocialPostsPreviewReadModel("studio-luna", "owner-1");
    expect(empty.success && empty.data.posts).toEqual([]);

    mocks.posts.mockRejectedValue(new Error("database failure"));
    await expect(
      resolveOwnerSocialPostsPreviewReadModel("studio-luna", "owner-1"),
    ).resolves.toMatchObject({ success: false, reason: "LOAD_FAILED" });
  });

  it("reads only delivery state for a verified owner and refuses revoked membership", async () => {
    mocks.posts.mockResolvedValueOnce([row]);
    const result = await resolveOwnerSocialPostDeliveryPreview("studio-luna", "owner-1");
    expect(result.success).toBe(true);
    expect(mocks.posts).toHaveBeenCalledWith(expect.objectContaining({
      where: { business_id: "business-1" },
      select: expect.objectContaining({
        id: true,
        status: true,
        targets: expect.objectContaining({ select: expect.objectContaining({ status: true }) }),
      }),
    }));
    if (result.success) expect(result.data.posts[0]).toMatchObject({ id: "post-1", status: "FAILED", targets: [{ id: "target-1", status: "FAILED" }] });

    mocks.actor.mockResolvedValueOnce({ success: false, error: "Revoked" });
    mocks.posts.mockClear();
    await expect(resolveOwnerSocialPostDeliveryPreview("studio-luna", "owner-1")).resolves.toMatchObject({ success: false, reason: "FORBIDDEN" });
    expect(mocks.posts).not.toHaveBeenCalled();
  });
});
