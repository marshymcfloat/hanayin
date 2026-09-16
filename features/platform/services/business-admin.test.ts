import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearDemoBusinessData: vi.fn(),
  ensureBusinessSubscription: vi.fn(),
  getPeriodEnd: vi.fn(),
  getServerSession: vi.fn(),
  logCreate: vi.fn(),
  revalidatePath: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  subscriptionInvoiceCount: vi.fn(),
  subscriptionUpdate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth/guards", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock("@/features/billing/subscription-service", () => ({
  assignReferralAttributionOnOnboarding: vi.fn(),
  DEFAULT_SUBSCRIPTION_PLAN_CODE: "STARTER_MONTHLY",
  ensureBusinessSubscription: mocks.ensureBusinessSubscription,
  ensureDefaultPlans: vi.fn(),
  ensureReferralCode: vi.fn(),
  getDefaultTrialMonths: vi.fn(() => 1),
  getPeriodEnd: mocks.getPeriodEnd,
  SUBSCRIPTION_PLAN_CODES: ["STARTER_MONTHLY", "PLUS_MONTHLY", "PRO_MONTHLY"],
}));
vi.mock("@/features/demo-trial/seed-demo-business", () => ({
  clearDemoBusinessData: mocks.clearDemoBusinessData,
}));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    businessSubscription: { update: mocks.subscriptionUpdate },
    subscriptionInvoice: { count: mocks.subscriptionInvoiceCount },
    platformActionLog: { create: mocks.logCreate },
  },
}));

import {
  clearDemoData,
  reactivateBusiness,
  suspendBusiness,
} from "./business-admin";

const businessId = "business_1";
const subscription = {
  id: "subscription_1",
  status: "SUSPENDED",
  plan: { billing_interval: "MONTHLY" },
};

describe("platform business administration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T04:00:00.000Z"));
    mocks.requirePlatformAdmin.mockResolvedValue({ success: true });
    mocks.getServerSession.mockResolvedValue({
      user: { id: "admin_1", contactNumber: "+639170000001" },
    });
    mocks.ensureBusinessSubscription.mockResolvedValue(subscription);
    mocks.subscriptionInvoiceCount.mockResolvedValue(0);
    mocks.subscriptionUpdate.mockResolvedValue({ id: subscription.id });
    mocks.logCreate.mockResolvedValue({ id: "log_1" });
    mocks.getPeriodEnd.mockReturnValue(new Date("2026-10-16T04:00:00.000Z"));
  });

  it("denies each workflow before persistence", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({
      success: false,
      error: "Forbidden",
    });

    await expect(suspendBusiness(businessId, "Billing hold")).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    await expect(reactivateBusiness(businessId)).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    await expect(clearDemoData(businessId)).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    expect(mocks.ensureBusinessSubscription).not.toHaveBeenCalled();
    expect(mocks.clearDemoBusinessData).not.toHaveBeenCalled();
  });

  it("suspends the subscription and records the reason", async () => {
    const result = await suspendBusiness(businessId, "Billing hold");

    expect(result).toEqual({ success: true, data: { id: subscription.id } });
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: subscription.id },
      data: {
        status: "SUSPENDED",
        suspended_at: new Date("2026-09-16T04:00:00.000Z"),
        grace_ends_at: null,
      },
    });
    expect(mocks.logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "BUSINESS_SUSPENDED",
        target_id: subscription.id,
        metadata: { reason: "Billing hold" },
      }),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/businesses");
  });

  it("rejects reactivation from an active state without writing", async () => {
    mocks.ensureBusinessSubscription.mockResolvedValue({
      ...subscription,
      status: "ACTIVE",
    });

    await expect(reactivateBusiness(businessId)).resolves.toEqual({
      success: false,
      error: "Cannot reactivate a subscription in status ACTIVE.",
    });
    expect(mocks.subscriptionInvoiceCount).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("rejects suspended subscriptions with unpaid invoices", async () => {
    mocks.subscriptionInvoiceCount.mockResolvedValue(2);

    await expect(reactivateBusiness(businessId)).resolves.toEqual({
      success: false,
      error: "Cannot reactivate while 2 unpaid invoice(s) exist. Settle or void them first.",
    });
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("reactivates an eligible subscription and resets its billing period", async () => {
    const periodEnd = new Date("2026-10-16T04:00:00.000Z");
    mocks.getPeriodEnd.mockReturnValue(periodEnd);

    const result = await reactivateBusiness(businessId);

    expect(result).toEqual({ success: true, data: { id: subscription.id } });
    expect(mocks.subscriptionInvoiceCount).toHaveBeenCalledWith({
      where: {
        business_subscription_id: subscription.id,
        status: { in: ["OPEN", "FAILED"] },
      },
    });
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        current_period_start: new Date("2026-09-16T04:00:00.000Z"),
        current_period_end: periodEnd,
        grace_ends_at: null,
        suspended_at: null,
        trial_ends_at: null,
      },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/businesses");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform");
  });

  it("clears demo data before logging success", async () => {
    const result = await clearDemoData(businessId);

    expect(result).toEqual({ success: true });
    expect(mocks.clearDemoBusinessData).toHaveBeenCalledWith(businessId);
    expect(mocks.logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DEMO_DATA_CLEARED",
        target_type: "Business",
        target_id: businessId,
      }),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/businesses");
  });
});
