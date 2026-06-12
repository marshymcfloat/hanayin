import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwnerTenantWriteAccessMock = vi.hoisted(() => vi.fn());
const requireTenantAccessMock = vi.hoisted(() => vi.fn());
const publishEventsMock = vi.hoisted(() => vi.fn());
const isSocialPublishingEnabledForBusinessMock = vi.hoisted(() => vi.fn());
const generateSocialCaptionDraftMock = vi.hoisted(() => vi.fn());
const getBusinessEntitlementsBySlugMock = vi.hoisted(() => vi.fn());
const generateAndUploadPromoImageMock = vi.hoisted(() => vi.fn());
const generateAndUploadOrganicImageMock = vi.hoisted(() => vi.fn());
const fetchReferenceImageBytesMock = vi.hoisted(() => vi.fn());
const isGeminiConfiguredMock = vi.hoisted(() => vi.fn());

const txMock = vi.hoisted(() => ({
  socialPost: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  socialPostTarget: {
    updateMany: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => unknown) =>
    callback(txMock),
  ),
  socialPost: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  brandAsset: {
    findFirst: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOwnerTenantWriteAccess: requireOwnerTenantWriteAccessMock,
  requireTenantAccess: requireTenantAccessMock,
}));

vi.mock("@/lib/features/social-publishing", () => ({
  isSocialPublishingEnabledForBusiness: isSocialPublishingEnabledForBusinessMock,
}));

vi.mock("@/lib/features/plan-entitlements", () => ({
  getBusinessEntitlementsBySlug: getBusinessEntitlementsBySlugMock,
}));

vi.mock("@/lib/services/outbox", () => ({
  publishEvent: vi.fn(),
  publishEvents: publishEventsMock,
}));

vi.mock("@/lib/services/social/caption-generator", () => ({
  generateSocialCaptionDraft: generateSocialCaptionDraftMock,
}));

vi.mock("@/lib/services/social/promo-image", () => ({
  generateAndUploadPromoImage: generateAndUploadPromoImageMock,
  generateAndUploadOrganicImage: generateAndUploadOrganicImageMock,
}));

vi.mock("@/lib/services/social/reference-image", () => ({
  fetchReferenceImageBytes: fetchReferenceImageBytesMock,
}));

vi.mock("@/lib/services/social/gemini-client", () => ({
  isGeminiConfigured: isGeminiConfiguredMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  generateSocialPostImageAction,
  publishSocialPostAction,
  regenerateSocialPostCaptionAction,
} from "./social";

describe("social server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => unknown) => callback(txMock),
    );
    isSocialPublishingEnabledForBusinessMock.mockReturnValue(true);
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: true,
      growth: true,
      social: true,
      ai: true,
    });
    requireOwnerTenantWriteAccessMock.mockResolvedValue({
      success: true,
      session: { user: { id: "owner_1" } },
      businessSlug: "demo",
    });
  });

  it("rejects social actions when the business is not on Pro", async () => {
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: true,
      growth: true,
      social: false,
      ai: false,
    });

    const result = await publishSocialPostAction({
      businessSlug: "demo",
      postId: "post_1",
    });

    expect(result).toEqual({
      success: false,
      error: "Social publishing is available on the Pro plan.",
    });
  });

  it("rejects social actions for Pro businesses outside the pilot", async () => {
    isSocialPublishingEnabledForBusinessMock.mockReturnValue(false);

    const result = await publishSocialPostAction({
      businessSlug: "demo",
      postId: "post_1",
    });

    expect(result).toEqual({
      success: false,
      error:
        "Social publishing is not enabled for this business yet. Contact support to join the pilot.",
    });
  });

  it("returns a clear error when post has no connected channels", async () => {
    txMock.socialPost.findFirst.mockResolvedValue({
      id: "post_1",
      business_id: "biz_1",
      status: "READY",
      media_url: null,
      targets: [],
    });

    const result = await publishSocialPostAction({
      businessSlug: "demo",
      postId: "post_1",
    });

    expect(result).toEqual({
      success: false,
      error:
        "No connected channels on this draft. Connect Facebook/Instagram or choose channels first.",
    });
    expect(txMock.socialPost.update).not.toHaveBeenCalled();
    expect(publishEventsMock).not.toHaveBeenCalled();
  });

  it("regenerates caption for a sale-event social draft", async () => {
    prismaMock.socialPost.findFirst.mockResolvedValue({
      id: "post_1",
      business: {
        slug: "demo",
        name: "BeautyFeel",
        description: "Salon in Quezon City",
      },
      sale_event: {
        title: "Holiday Stress-Off Package",
        description: "Limited slots",
        discount_type: "PERCENTAGE",
        discount_value: 15,
        start_date: new Date("2026-02-14T00:00:00.000Z"),
        end_date: new Date("2026-02-14T00:00:00.000Z"),
        applicable_services: [{ name: "Eyelash Perming", category: "Eyes" }],
        applicable_packages: [{ name: "Holiday Bundle" }],
      },
    });
    generateSocialCaptionDraftMock.mockResolvedValue({
      caption: "Fresh caption",
      hashtags: ["#ServiceFlow", "#GlowUp"],
    });

    const result = await regenerateSocialPostCaptionAction({
      businessSlug: "demo",
      postId: "post_1",
    });

    expect(result).toEqual({
      success: true,
      data: {
        caption: "Fresh caption",
        hashtags: ["#ServiceFlow", "#GlowUp"],
      },
    });
    expect(generateSocialCaptionDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessSlug: "demo",
        businessName: "BeautyFeel",
        saleTitle: "Holiday Stress-Off Package",
      }),
    );
  });

  it("returns a clear error when regenerating caption for manual drafts", async () => {
    prismaMock.socialPost.findFirst.mockResolvedValue({
      id: "post_1",
      business: {
        slug: "demo",
        name: "BeautyFeel",
        description: null,
      },
      sale_event: null,
    });

    const result = await regenerateSocialPostCaptionAction({
      businessSlug: "demo",
      postId: "post_1",
    });

    expect(result).toEqual({
      success: false,
      error: "Unable to regenerate social caption.",
    });
    expect(generateSocialCaptionDraftMock).not.toHaveBeenCalled();
  });

  describe("generateSocialPostImageAction reference handling", () => {
    it("errors when the selected reference asset is missing", async () => {
      prismaMock.brandAsset.findFirst.mockResolvedValue(null);

      const result = await generateSocialPostImageAction({
        businessSlug: "demo",
        postId: "post_1",
        referenceAssetId: "ref_missing",
      });

      expect(result).toEqual({
        success: false,
        error: "Reference image not found or was removed. Pick another.",
      });
      // Never proceeds to generation when the chosen reference is gone.
      expect(prismaMock.socialPost.findFirst).not.toHaveBeenCalled();
      expect(generateAndUploadOrganicImageMock).not.toHaveBeenCalled();
    });

    it("errors when the reference image cannot be fetched", async () => {
      prismaMock.brandAsset.findFirst.mockResolvedValue({
        url: "https://blob/ref.png",
        reference_subject: "STYLE",
      });
      fetchReferenceImageBytesMock.mockResolvedValue({
        ok: false,
        error: "boom",
      });

      const result = await generateSocialPostImageAction({
        businessSlug: "demo",
        postId: "post_1",
        referenceAssetId: "ref_1",
      });

      expect(result).toEqual({
        success: false,
        error: "Could not load the selected reference image. Try again.",
      });
      expect(generateAndUploadOrganicImageMock).not.toHaveBeenCalled();
    });

    it("passes a PERSON reference into organic generation", async () => {
      prismaMock.brandAsset.findFirst.mockResolvedValue({
        url: "https://blob/person.png",
        reference_subject: "PERSON",
      });
      fetchReferenceImageBytesMock.mockResolvedValue({
        ok: true,
        data: "BASE64DATA",
        mimeType: "image/png",
      });
      isGeminiConfiguredMock.mockReturnValue(true);
      prismaMock.socialPost.findFirst.mockResolvedValue({
        id: "post_1",
        title: "Meet our founder",
        caption_draft: "Say hi!",
        caption_final: null,
        business: { id: "biz_1", name: "BeautyFeel", slug: "demo" },
        sale_event: null,
      });
      generateAndUploadOrganicImageMock.mockResolvedValue(
        "https://blob/out.png",
      );

      const result = await generateSocialPostImageAction({
        businessSlug: "demo",
        postId: "post_1",
        referenceAssetId: "ref_1",
      });

      expect(result).toEqual({
        success: true,
        data: { mediaUrl: "https://blob/out.png", warning: null },
      });
      expect(generateAndUploadOrganicImageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          reference: {
            data: "BASE64DATA",
            mimeType: "image/png",
            subject: "PERSON",
          },
        }),
      );
    });

    it("warns when a PERSON reference is used but Gemini is not configured", async () => {
      prismaMock.brandAsset.findFirst.mockResolvedValue({
        url: "https://blob/person.png",
        reference_subject: "PERSON",
      });
      fetchReferenceImageBytesMock.mockResolvedValue({
        ok: true,
        data: "BASE64DATA",
        mimeType: "image/png",
      });
      isGeminiConfiguredMock.mockReturnValue(false);
      prismaMock.socialPost.findFirst.mockResolvedValue({
        id: "post_1",
        title: "Meet our founder",
        caption_draft: "Say hi!",
        caption_final: null,
        business: { id: "biz_1", name: "BeautyFeel", slug: "demo" },
        sale_event: null,
      });
      generateAndUploadOrganicImageMock.mockResolvedValue(
        "https://blob/out.png",
      );

      const result = await generateSocialPostImageAction({
        businessSlug: "demo",
        postId: "post_1",
        referenceAssetId: "ref_1",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.warning).toContain("GEMINI_KEY");
      }
    });
  });
});
