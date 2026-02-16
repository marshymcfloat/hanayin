import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwnerTenantWriteAccessMock = vi.hoisted(() => vi.fn());
const requireTenantAccessMock = vi.hoisted(() => vi.fn());
const getBusinessEntitlementsBySlugMock = vi.hoisted(() => vi.fn());
const isSocialPublishingEnabledForBusinessMock = vi.hoisted(() => vi.fn());

const txMock = vi.hoisted(() => ({
  saleEvent: {
    create: vi.fn(),
  },
  socialPost: {
    create: vi.fn(),
  },
  socialPostTarget: {
    createMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
  },
  socialConnection: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => unknown) =>
    callback(txMock),
  ),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOwnerTenantWriteAccess: requireOwnerTenantWriteAccessMock,
  requireTenantAccess: requireTenantAccessMock,
}));

vi.mock("@/lib/features/plan-entitlements", () => ({
  getBusinessEntitlementsBySlug: getBusinessEntitlementsBySlugMock,
}));

vi.mock("@/lib/features/social-publishing", () => ({
  isSocialPublishingEnabledForBusiness: isSocialPublishingEnabledForBusinessMock,
}));

vi.mock("@/lib/services/social/caption-generator", () => ({
  generateSocialCaptionDraft: vi.fn(),
}));

vi.mock("@/lib/services/social/promo-image", () => ({
  generateAndUploadPromoImage: vi.fn(),
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { createSaleEvent } from "./sale-event";

describe("sale-event server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => unknown) => callback(txMock),
    );
    requireOwnerTenantWriteAccessMock.mockResolvedValue({
      success: true,
      session: { user: { id: "owner_1" } },
      businessSlug: "demo",
    });
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: true,
      growth: true,
      social: true,
      ai: true,
    });
    isSocialPublishingEnabledForBusinessMock.mockReturnValue(true);
    prismaMock.business.findUnique.mockResolvedValue({
      id: "biz_1",
      name: "Demo Biz",
      description: null,
      services: [{ name: "Service A", category: "General" }],
      packages: [],
    });
    txMock.saleEvent.create.mockResolvedValue({ id: 1 });
  });

  it("creates a core sale event without social draft on starter/plus/pro", async () => {
    const result = await createSaleEvent({
      businessSlug: "demo",
      title: "Promo",
      startDate: new Date("2026-02-16T00:00:00.000Z"),
      endDate: new Date("2026-02-20T00:00:00.000Z"),
      discountType: "PERCENTAGE",
      discountValue: 10,
      serviceIds: [1],
      packageIds: [],
      createSocialDraft: false,
    });

    expect(result).toEqual({ success: true });
    expect(txMock.saleEvent.create).toHaveBeenCalled();
  });

  it("rejects social draft creation for non-pro plans", async () => {
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: true,
      growth: true,
      social: false,
      ai: false,
    });

    const result = await createSaleEvent({
      businessSlug: "demo",
      title: "Promo",
      startDate: new Date("2026-02-16T00:00:00.000Z"),
      endDate: new Date("2026-02-20T00:00:00.000Z"),
      discountType: "PERCENTAGE",
      discountValue: 10,
      serviceIds: [1],
      packageIds: [],
      createSocialDraft: true,
      targetPlatforms: ["FACEBOOK_PAGE"],
    });

    expect(result).toEqual({
      success: false,
      error: "Social publishing is available on the Pro plan.",
    });
  });
});
