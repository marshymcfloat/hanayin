import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePlatformAdminMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const ensureDefaultPlansMock = vi.hoisted(() => vi.fn());
const ensureBusinessSubscriptionMock = vi.hoisted(() => vi.fn());
const ensureReferralCodeMock = vi.hoisted(() => vi.fn());
const hashMock = vi.hoisted(() => vi.fn());
const getServerSessionMock = vi.hoisted(() => vi.fn());
const addMonthsMock = vi.hoisted(() => vi.fn((date: Date) => date));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  subscriptionPlan: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  businessSubscription: {
    update: vi.fn(),
  },
  subscriptionCreditLedger: {
    create: vi.fn(),
  },
  platformActionLog: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
  requireAuth: requireAuthMock,
}));

vi.mock("bcryptjs", () => ({
  hash: hashMock,
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/billing/subscription-service", () => ({
  SUBSCRIPTION_PLAN_CODES: ["STARTER_MONTHLY", "PLUS_MONTHLY", "PRO_MONTHLY"],
  DEFAULT_SUBSCRIPTION_PLAN_CODE: "STARTER_MONTHLY",
  addMonths: addMonthsMock,
  assignReferralAttributionOnOnboarding: vi.fn(),
  createCheckoutForInvoice: vi.fn(),
  createInvoiceForSubscription: vi.fn(),
  ensureBusinessSubscription: ensureBusinessSubscriptionMock,
  ensureDefaultPlans: ensureDefaultPlansMock,
  ensureReferralCode: ensureReferralCodeMock,
  getDefaultTrialMonths: vi.fn(() => 1),
  getPeriodEnd: vi.fn((date: Date) => date),
  getSubscriptionEnforcementMode: vi.fn(() => "OFF"),
  markInvoicePaid: vi.fn(),
  qualifyAndRewardReferralForBusiness: vi.fn(),
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
  supportsOnboardingApplicationModel: vi.fn(() => true),
}));

import {
  applyCreditAdjustmentAction,
  createBusinessWithSubscriptionAction,
  grantTrialMonthsAction,
  updateSubscriptionPlanAction,
} from "./platform-admin";

describe("platform-admin plan code defaults", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    requirePlatformAdminMock.mockResolvedValue({
      success: true,
      session: {
        user: {
          id: "platform_admin_1",
          email: "admin@serviceflow.test",
        },
      },
    });

    getServerSessionMock.mockResolvedValue({
      user: {
        id: "platform_admin_1",
        email: "admin@serviceflow.test",
      },
    });

    hashMock.mockResolvedValue("hashed-password");
    addMonthsMock.mockReset();
    addMonthsMock.mockImplementation((date: Date) => date);

    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "owner_user_1" }),
        },
        business: {
          create: vi.fn().mockResolvedValue({
            id: "biz_1",
            slug: "new-biz",
          }),
        },
      }),
    );

    ensureBusinessSubscriptionMock.mockResolvedValue({
      id: "sub_1",
      status: "TRIALING",
      trial_ends_at: new Date("2026-03-01T00:00:00.000Z"),
      current_period_end: new Date("2026-03-01T00:00:00.000Z"),
      plan_id: "plan_1",
      plan: { code: "STARTER_MONTHLY" },
    });
    ensureReferralCodeMock.mockResolvedValue({ id: "ref_code_1" });
    prismaMock.platformActionLog.create.mockResolvedValue({ id: "log_1" });
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue({
      id: "plan_1",
      code: "STARTER_MONTHLY",
      is_active: true,
      price_amount: 149_900,
    });
    prismaMock.subscriptionPlan.update.mockResolvedValue({
      id: "plan_1",
      code: "STARTER_MONTHLY",
      price_amount: 149_900,
      is_active: true,
    });
    prismaMock.businessSubscription.update.mockResolvedValue({ id: "sub_1" });
    prismaMock.subscriptionCreditLedger.create.mockResolvedValue({
      id: "credit_1",
      amount_total: 149_900,
      amount_remaining: 149_900,
    });
  });

  it("defaults planCode to STARTER_MONTHLY when omitted", async () => {
    const result = await createBusinessWithSubscriptionAction({
      businessName: "New Biz",
      businessSlug: "new-biz",
      initials: "NB",
      ownerName: "Owner One",
      ownerEmail: "owner@newbiz.test",
      ownerPassword: "password123",
      trialMonths: 1,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );

    expect(ensureBusinessSubscriptionMock).toHaveBeenCalledWith("biz_1", {
      planCode: "STARTER_MONTHLY",
      trialMonths: 1,
    });
  });

  it("rejects legacy PRO_ANNUAL planCode", async () => {
    await expect(
      createBusinessWithSubscriptionAction({
        businessName: "New Biz",
        businessSlug: "new-biz",
        initials: "NB",
        ownerName: "Owner One",
        ownerEmail: "owner@newbiz.test",
        ownerPassword: "password123",
        planCode: "PRO_ANNUAL",
      } as never),
    ).rejects.toThrow();
  });

  it("rejects inactive plan assignments", async () => {
    prismaMock.subscriptionPlan.findUnique.mockResolvedValueOnce({ is_active: false });

    const result = await createBusinessWithSubscriptionAction({
      businessName: "New Biz",
      businessSlug: "new-biz",
      initials: "NB",
      ownerName: "Owner One",
      ownerEmail: "owner@newbiz.test",
      ownerPassword: "password123",
      planCode: "PLUS_MONTHLY",
    });

    expect(result).toEqual({
      success: false,
      error: "Selected plan is not active",
    });
    expect(ensureBusinessSubscriptionMock).not.toHaveBeenCalled();
  });

  it("keeps legacy plans inactive when admin tries to activate", async () => {
    prismaMock.subscriptionPlan.findUnique.mockResolvedValueOnce({
      id: "legacy_plan_1",
      code: "PRO_ANNUAL",
    });
    prismaMock.subscriptionPlan.update.mockResolvedValueOnce({
      id: "legacy_plan_1",
      code: "PRO_ANNUAL",
      price_amount: 3_840_000,
      is_active: false,
    });

    const result = await updateSubscriptionPlanAction({
      planId: "legacy_plan_1",
      priceAmount: 3_840_000,
      isActive: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(prismaMock.subscriptionPlan.update).toHaveBeenCalledWith({
      where: { id: "legacy_plan_1" },
      data: {
        price_amount: 3_840_000,
        is_active: false,
      },
    });
  });

  it("rejects trial extension for non-trialing subscriptions", async () => {
    ensureBusinessSubscriptionMock.mockResolvedValueOnce({
      id: "sub_active_1",
      status: "ACTIVE",
      trial_ends_at: new Date("2026-03-01T00:00:00.000Z"),
      current_period_end: new Date("2026-03-01T00:00:00.000Z"),
    });

    const result = await grantTrialMonthsAction("biz_1", 1);

    expect(result).toEqual({
      success: false,
      error: "Trial months can only be granted to trialing subscriptions.",
    });
    expect(prismaMock.businessSubscription.update).not.toHaveBeenCalled();
  });

  it("extends trialing subscription when granting trial months", async () => {
    const trialEndsAt = new Date("2026-03-01T00:00:00.000Z");
    const currentPeriodEnd = new Date("2026-03-01T00:00:00.000Z");
    const nextTrialEndsAt = new Date("2026-04-01T00:00:00.000Z");
    const nextPeriodEnd = new Date("2026-04-01T00:00:00.000Z");

    ensureBusinessSubscriptionMock.mockResolvedValueOnce({
      id: "sub_trial_1",
      status: "TRIALING",
      trial_ends_at: trialEndsAt,
      current_period_end: currentPeriodEnd,
    });
    addMonthsMock
      .mockReturnValueOnce(nextTrialEndsAt)
      .mockReturnValueOnce(nextPeriodEnd);

    const result = await grantTrialMonthsAction("biz_1", 1);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(prismaMock.businessSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub_trial_1" },
      data: {
        status: "TRIALING",
        trial_ends_at: nextTrialEndsAt,
        current_period_end: nextPeriodEnd,
        grace_ends_at: null,
        suspended_at: null,
      },
    });
  });

  it("applies credit adjustment without mutating subscription status or dates", async () => {
    ensureBusinessSubscriptionMock.mockResolvedValueOnce({
      id: "sub_credit_1",
      plan_id: "plan_1",
    });
    prismaMock.subscriptionPlan.findUnique.mockResolvedValueOnce({
      price_amount: 149_900,
    });

    const result = await applyCreditAdjustmentAction(
      "biz_1",
      { months: 1 },
      "Manual admin credit",
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(prismaMock.subscriptionCreditLedger.create).toHaveBeenCalledWith({
      data: {
        business_subscription_id: "sub_credit_1",
        source: "ADMIN_ADJUSTMENT",
        amount_total: 149_900,
        amount_remaining: 149_900,
        description: "Manual admin credit",
      },
    });
    expect(prismaMock.businessSubscription.update).not.toHaveBeenCalled();
  });
});
