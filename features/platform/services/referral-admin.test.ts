import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assignReferralAttributionOnOnboarding: vi.fn(),
  qualifyAndRewardReferralForBusiness: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  referralAttributionFindMany: vi.fn(),
  referralAttributionUpdate: vi.fn(),
  referralLeadUpdate: vi.fn(),
  logPlatformAction: vi.fn(),
  revalidatePath: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/guards", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock("@/features/billing/subscription-service", () => ({
  assignReferralAttributionOnOnboarding:
    mocks.assignReferralAttributionOnOnboarding,
  qualifyAndRewardReferralForBusiness:
    mocks.qualifyAndRewardReferralForBusiness,
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn } }));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    referralAttribution: {
      findMany: mocks.referralAttributionFindMany,
      update: mocks.referralAttributionUpdate,
    },
    referralLead: { update: mocks.referralLeadUpdate },
  },
}));
vi.mock("./platform-action-log", () => ({
  logPlatformAction: mocks.logPlatformAction,
}));

import {
  assignReferralOnOnboarding,
  rejectReferralAttribution,
  runReferralRewardQualification,
  updateReferralLeadStatus,
} from "./referral-admin";

describe("platform referral administration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T04:00:00.000Z"));
    mocks.requirePlatformAdmin.mockResolvedValue({ success: true });
    mocks.logPlatformAction.mockResolvedValue(undefined);
  });

  it("assigns an onboarding referral to the requested business and audits it", async () => {
    const attribution = {
      id: "attribution_1",
      referred_business_id: "business_referred",
    };
    mocks.assignReferralAttributionOnOnboarding.mockResolvedValue(attribution);

    const result = await assignReferralOnOnboarding(
      "business_referred",
      "REFERRER-123",
    );

    expect(result).toEqual({ success: true, data: attribution });
    expect(mocks.assignReferralAttributionOnOnboarding).toHaveBeenCalledWith(
      "business_referred",
      "REFERRER-123",
    );
    expect(mocks.logPlatformAction).toHaveBeenCalledWith({
      action: "REFERRAL_ASSIGNED_ON_ONBOARDING",
      targetType: "ReferralAttribution",
      targetId: "attribution_1",
      businessId: "business_referred",
      metadata: { referralCode: "REFERRER-123" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/referrals");
  });

  it("qualifies each distinct referred business and isolates individual failures", async () => {
    mocks.referralAttributionFindMany.mockResolvedValue([
      { referred_business_id: "business_1" },
      { referred_business_id: "business_1" },
      { referred_business_id: "business_2" },
      { referred_business_id: "business_3" },
    ]);
    mocks.qualifyAndRewardReferralForBusiness.mockImplementation(
      async (businessId: string) => {
        if (businessId === "business_2") {
          throw new Error("invoice unavailable");
        }
      },
    );

    const result = await runReferralRewardQualification();

    expect(result).toEqual({ success: true, processed: 3, failures: 1 });
    expect(mocks.referralAttributionFindMany).toHaveBeenCalledWith({
      where: { status: { in: ["PENDING", "QUALIFIED"] } },
      select: { referred_business_id: true },
    });
    expect(mocks.qualifyAndRewardReferralForBusiness).toHaveBeenCalledTimes(3);
    expect(
      mocks.qualifyAndRewardReferralForBusiness.mock.calls.map(([id]) => id),
    ).toEqual(expect.arrayContaining(["business_1", "business_2", "business_3"]));
    expect(mocks.warn).toHaveBeenCalledWith(
      "[ReferralQualification] business failed",
      {
        businessId: "business_2",
        error: "invoice unavailable",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/referrals");
  });

  it("records a converted lead against the converted business", async () => {
    const lead = {
      id: "lead_1",
      status: "CONVERTED",
      converted_business_id: "business_converted",
    };
    mocks.referralLeadUpdate.mockResolvedValue(lead);

    const result = await updateReferralLeadStatus({
      leadId: "lead_1",
      status: "CONVERTED",
      convertedBusinessId: "business_converted",
    });

    expect(result).toEqual({ success: true, data: lead });
    expect(mocks.referralLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: {
        status: "CONVERTED",
        converted_business_id: "business_converted",
      },
    });
    expect(mocks.logPlatformAction).toHaveBeenCalledWith({
      action: "REFERRAL_LEAD_STATUS_UPDATED",
      targetType: "ReferralLead",
      targetId: "lead_1",
      businessId: "business_converted",
      metadata: { status: "CONVERTED" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/referrals");
  });

  it("clears a prior business association for non-converted lead statuses", async () => {
    const lead = {
      id: "lead_1",
      status: "REJECTED",
      converted_business_id: null,
    };
    mocks.referralLeadUpdate.mockResolvedValue(lead);

    await updateReferralLeadStatus({
      leadId: "lead_1",
      status: "REJECTED",
      convertedBusinessId: "business_stale",
    });

    expect(mocks.referralLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: { status: "REJECTED", converted_business_id: null },
    });
    expect(mocks.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "lead_1",
        businessId: null,
        metadata: { status: "REJECTED" },
      }),
    );
  });

  it("rejects an attribution with a deterministic timestamp and referred business audit", async () => {
    const attribution = {
      id: "attribution_1",
      status: "REJECTED",
      referred_business_id: "business_referred",
    };
    mocks.referralAttributionUpdate.mockResolvedValue(attribution);

    const result = await rejectReferralAttribution(
      "attribution_1",
      "Duplicate referral",
    );

    expect(result).toEqual({ success: true, data: attribution });
    expect(mocks.referralAttributionUpdate).toHaveBeenCalledWith({
      where: { id: "attribution_1" },
      data: {
        status: "REJECTED",
        rejected_at: new Date("2026-09-16T04:00:00.000Z"),
        rejection_reason: "Duplicate referral",
      },
    });
    expect(mocks.logPlatformAction).toHaveBeenCalledWith({
      action: "REFERRAL_ATTRIBUTION_REJECTED",
      targetType: "ReferralAttribution",
      targetId: "attribution_1",
      businessId: "business_referred",
      metadata: { reason: "Duplicate referral" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/referrals");
  });
});
