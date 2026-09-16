import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePlatformAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/guards", () => ({
  requirePlatformAdmin,
  requireAuth: vi.fn(),
}));
vi.mock("@/prisma/prisma", () => ({
  prisma: {},
  supportsOnboardingApplicationModel: vi.fn(() => true),
}));

import * as businessWorkflows from "./business-admin";
import * as impersonationWorkflows from "./impersonation-admin";
import * as invoiceWorkflows from "./invoice-admin";
import * as onboardingWorkflows from "./onboarding-admin";
import * as outboxWorkflows from "./outbox-admin";
import * as referralWorkflows from "./referral-admin";
import * as subscriptionWorkflows from "./subscription-admin";

describe("platform administration authorization", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset();
    requirePlatformAdmin.mockResolvedValue({
      success: false,
      error: "Forbidden",
    });
  });

  it("denies every privileged workflow before validation or persistence", async () => {
    const attempts = [
      () => businessWorkflows.createBusinessWithSubscription({} as never),
      () => subscriptionWorkflows.grantTrialMonths("business", 1),
      () =>
        referralWorkflows.assignReferralOnOnboarding("business", "referral"),
      () => invoiceWorkflows.createSubscriptionInvoice("subscription"),
      () =>
        subscriptionWorkflows.applyCreditAdjustment("business", {}, "reason"),
      () => businessWorkflows.suspendBusiness("business", "reason"),
      () => businessWorkflows.reactivateBusiness("business"),
      () =>
        subscriptionWorkflows.changeBusinessSubscriptionPlan(
          "business",
          "STARTER_MONTHLY",
        ),
      () =>
        subscriptionWorkflows.reviewSubscriptionPlanUpgradeRequest({} as never),
      () => referralWorkflows.runReferralRewardQualification(),
      () => subscriptionWorkflows.getSubscriptionEnforcementMode(),
      () => subscriptionWorkflows.updateSubscriptionPlan({} as never),
      () => referralWorkflows.updateReferralLeadStatus({} as never),
      () =>
        referralWorkflows.rejectReferralAttribution("attribution", "reason"),
      () => onboardingWorkflows.updateOnboardingApplicationStatus({} as never),
      () =>
        onboardingWorkflows.convertOnboardingApplicationToBusiness({} as never),
      () => onboardingWorkflows.resendMagicLink("business"),
      () => impersonationWorkflows.impersonateBusinessOwner("business"),
      () => subscriptionWorkflows.convertTrialToPaid({} as never),
      () => businessWorkflows.clearDemoData("business"),
      () => invoiceWorkflows.markInvoicePaidManually({} as never),
      () => outboxWorkflows.retryOutboxMessage("message"),
      () => outboxWorkflows.skipOutboxMessage({} as never),
    ];

    for (const attempt of attempts) {
      await expect(attempt()).resolves.toEqual({
        success: false,
        error: "Forbidden",
      });
    }
    expect(requirePlatformAdmin).toHaveBeenCalledTimes(attempts.length);
  });
});
