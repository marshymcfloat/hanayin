// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwnerTenantWriteAccessMock = vi.hoisted(() => vi.fn());
const requireTenantAccessMock = vi.hoisted(() => vi.fn());
const refreshGrowthContextSnapshotMock = vi.hoisted(() => vi.fn());
const getBusinessEntitlementsBySlugMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/guards", () => ({
  requireOwnerTenantWriteAccess: requireOwnerTenantWriteAccessMock,
  requireTenantAccess: requireTenantAccessMock,
}));

vi.mock("@/lib/services/growth/context-snapshot", () => ({
  refreshGrowthContextSnapshot: refreshGrowthContextSnapshotMock,
  ensureBusinessGrowthSettings: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    growthContextSnapshot: { findFirst: vi.fn() },
    opportunity: { updateMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/services/growth/opportunity-detector", () => ({
  refreshOpportunitiesForSnapshot: vi.fn(),
}));

vi.mock("@/lib/services/growth/opportunities", () => ({
  getTodayOpportunityViews: vi.fn(),
}));

vi.mock("@/lib/services/growth/offer-generator", () => ({
  generateOfferFromOpportunity: vi.fn(),
}));

vi.mock("@/lib/services/growth/caption-generator", () => ({
  generateCaptionVariants: vi.fn(),
}));

vi.mock("@/lib/services/growth/image-prompt-generator", () => ({
  generateImagePromptVariants: vi.fn(),
}));

vi.mock("@/lib/services/growth/schedule-recommender", () => ({
  recommendPostingSchedule: vi.fn(),
}));

vi.mock("@/lib/services/growth/campaign-tracker", () => ({
  trackCampaignEvent: vi.fn(),
}));

vi.mock("@/features/billing/plan-entitlements", () => ({
  getBusinessEntitlementsBySlug: getBusinessEntitlementsBySlugMock,
}));

import { generateGrowthCampaignAction, refreshGrowthContextAction } from "./growth";

describe("growth server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: true,
      growth: true,
      social: false,
      ai: false,
    });
    requireOwnerTenantWriteAccessMock.mockResolvedValue({
      success: true,
      session: { user: { id: "owner-1" } },
      businessSlug: "demo",
    });
  });

  it("returns auth error when write access is denied", async () => {
    requireOwnerTenantWriteAccessMock.mockResolvedValue({
      success: false,
      error: "Forbidden",
    });

    const result = await refreshGrowthContextAction("demo");
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns snapshot id when refresh succeeds", async () => {
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: true,
      growth: true,
      social: false,
      ai: true,
    });
    refreshGrowthContextSnapshotMock.mockResolvedValue({
      snapshot: { id: "snap_1" },
    });

    const result = await refreshGrowthContextAction("demo");
    expect(result).toEqual({ success: true, snapshotId: "snap_1" });
  });

  it("blocks growth refresh for starter tier", async () => {
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: false,
      growth: false,
      social: false,
      ai: false,
    });

    const result = await refreshGrowthContextAction("demo");
    expect(result).toEqual({
      success: false,
      error: "Growth opportunities are available on Plus and Pro plans.",
    });
  });

  it("blocks AI campaign generation for plus tier", async () => {
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: true,
      growth: true,
      social: false,
      ai: false,
    });

    const result = await generateGrowthCampaignAction({
      businessSlug: "demo",
      opportunityId: "opp_1",
      selectedServiceIds: [1],
      selectedPackageIds: [],
    });

    expect(result).toEqual({
      success: false,
      error: "AI growth campaign generation is available on Pro.",
    });
  });
});
