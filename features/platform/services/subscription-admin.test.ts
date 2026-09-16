import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInvoiceForSubscription: vi.fn(),
  ensureBusinessSubscription: vi.fn(),
  ensureDefaultPlans: vi.fn(),
  getPeriodEnd: vi.fn(),
  getServerSession: vi.fn(),
  logPlatformAction: vi.fn(),
  markInvoicePaid: vi.fn(),
  revalidatePath: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  planFindUnique: vi.fn(),
  subscriptionUpdate: vi.fn(),
  invoiceUpdate: vi.fn(),
  logCreate: vi.fn(),
  upgradeRequestFindUnique: vi.fn(),
  upgradeRequestUpdate: vi.fn(),
  transaction: vi.fn(),
  txSubscriptionFindUnique: vi.fn(),
  txSubscriptionUpdate: vi.fn(),
  txUpgradeRequestUpdate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth/guards", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock("@/features/billing/subscription-service", () => ({
  SUBSCRIPTION_PLAN_CODES: [
    "STARTER_MONTHLY",
    "PLUS_MONTHLY",
    "PRO_MONTHLY",
  ],
  addMonths: vi.fn((date: Date, months: number) => {
    const result = new Date(date);
    result.setUTCMonth(result.getUTCMonth() + months);
    return result;
  }),
  createInvoiceForSubscription: mocks.createInvoiceForSubscription,
  ensureBusinessSubscription: mocks.ensureBusinessSubscription,
  ensureDefaultPlans: mocks.ensureDefaultPlans,
  getPeriodEnd: mocks.getPeriodEnd,
  getSubscriptionEnforcementMode: vi.fn(() => "OFF"),
  markInvoicePaid: mocks.markInvoicePaid,
}));
vi.mock("./platform-action-log", () => ({
  logPlatformAction: mocks.logPlatformAction,
}));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    businessSubscription: { update: mocks.subscriptionUpdate },
    platformActionLog: { create: mocks.logCreate },
    subscriptionInvoice: { update: mocks.invoiceUpdate },
    subscriptionPlan: { findUnique: mocks.planFindUnique },
    subscriptionPlanUpgradeRequest: {
      findUnique: mocks.upgradeRequestFindUnique,
      update: mocks.upgradeRequestUpdate,
    },
  },
}));

import {
  changeBusinessSubscriptionPlan,
  convertTrialToPaid,
  reviewSubscriptionPlanUpgradeRequest,
} from "./subscription-admin";

const adminAuth = {
  success: true as const,
  session: { user: { id: "admin_1", contactNumber: "+639170000001" } },
};

const baseSubscription = {
  id: "subscription_1",
  plan_id: "plan_starter",
  status: "ACTIVE",
  current_period_start: new Date("2026-09-01T00:00:00.000Z"),
  current_period_end: new Date("2026-10-01T00:00:00.000Z"),
  plan: { code: "STARTER_MONTHLY", billing_interval: "MONTHLY" },
};

const baseRequest = {
  id: "request_1",
  status: "PENDING",
  business_subscription_id: "subscription_1",
  current_plan_id: "plan_starter",
  business: { id: "business_1", slug: "acme" },
  current_plan: { code: "STARTER_MONTHLY" },
  target_plan: { id: "plan_plus", code: "PLUS_MONTHLY", is_active: true },
};

describe("platform subscription administration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T04:00:00.000Z"));
    mocks.requirePlatformAdmin.mockResolvedValue(adminAuth);
    mocks.getServerSession.mockResolvedValue(adminAuth.session);
    mocks.ensureBusinessSubscription.mockResolvedValue(baseSubscription);
    mocks.ensureDefaultPlans.mockResolvedValue(undefined);
    mocks.getPeriodEnd.mockReturnValue(
      new Date("2026-10-16T04:00:00.000Z"),
    );
    mocks.planFindUnique.mockResolvedValue({
      id: "plan_plus",
      code: "PLUS_MONTHLY",
      is_active: true,
      billing_interval: "MONTHLY",
    });
    mocks.subscriptionUpdate.mockResolvedValue({
      ...baseSubscription,
      plan_id: "plan_plus",
      plan: { code: "PLUS_MONTHLY", billing_interval: "MONTHLY" },
    });
    mocks.createInvoiceForSubscription.mockResolvedValue({
      id: "invoice_1",
      amount_due: 149_900,
      amount_paid: 0,
    });
    mocks.markInvoicePaid.mockResolvedValue({ id: "invoice_1" });
    mocks.invoiceUpdate.mockResolvedValue({ id: "invoice_1" });
    mocks.upgradeRequestFindUnique.mockResolvedValue(baseRequest);
    mocks.txSubscriptionFindUnique.mockResolvedValue({
      id: "subscription_1",
      plan_id: "plan_starter",
    });
    mocks.txSubscriptionUpdate.mockResolvedValue({ id: "subscription_1" });
    mocks.txUpgradeRequestUpdate.mockResolvedValue({
      id: "request_1",
      status: "APPROVED",
    });
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          businessSubscription: {
            findUnique: mocks.txSubscriptionFindUnique,
            update: mocks.txSubscriptionUpdate,
          },
          subscriptionPlanUpgradeRequest: {
            update: mocks.txUpgradeRequestUpdate,
          },
        }),
    );
  });

  it("rejects an inactive target plan without changing the subscription", async () => {
    mocks.planFindUnique.mockResolvedValueOnce({
      id: "plan_plus",
      code: "PLUS_MONTHLY",
      is_active: false,
      billing_interval: "MONTHLY",
    });

    await expect(
      changeBusinessSubscriptionPlan("business_1", "PLUS_MONTHLY"),
    ).resolves.toEqual({
      success: false,
      error: "Selected plan is not active",
    });

    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.createInvoiceForSubscription).not.toHaveBeenCalled();
    expect(mocks.logPlatformAction).not.toHaveBeenCalled();
  });

  it("resets an active subscription period and invoices the new plan", async () => {
    const result = await changeBusinessSubscriptionPlan(
      "business_1",
      "PLUS_MONTHLY",
    );

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ plan_id: "plan_plus" }),
    });
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "subscription_1" },
      data: {
        plan_id: "plan_plus",
        current_period_start: new Date("2026-09-16T04:00:00.000Z"),
        current_period_end: new Date("2026-10-16T04:00:00.000Z"),
      },
      include: { plan: true },
    });
    expect(mocks.createInvoiceForSubscription).toHaveBeenCalledWith(
      "subscription_1",
      "PLAN_CHANGE",
    );
    expect(mocks.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BUSINESS_SUBSCRIPTION_PLAN_CHANGED",
        businessId: "business_1",
        metadata: expect.objectContaining({
          previousPlanCode: "STARTER_MONTHLY",
          nextPlanCode: "PLUS_MONTHLY",
          periodReset: true,
          invoiceId: "invoice_1",
        }),
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/invoices");
  });

  it("rejects missing, reviewed, and inactive-target upgrade requests before a transaction", async () => {
    mocks.upgradeRequestFindUnique.mockResolvedValueOnce(null);
    await expect(
      reviewSubscriptionPlanUpgradeRequest({
        requestId: "missing",
        decision: "APPROVE",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Upgrade request not found",
    });

    mocks.upgradeRequestFindUnique.mockResolvedValueOnce({
      ...baseRequest,
      status: "REJECTED",
    });
    await expect(
      reviewSubscriptionPlanUpgradeRequest({
        requestId: "request_1",
        decision: "APPROVE",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Upgrade request is already reviewed.",
    });

    mocks.upgradeRequestFindUnique.mockResolvedValueOnce({
      ...baseRequest,
      target_plan: { ...baseRequest.target_plan, is_active: false },
    });
    await expect(
      reviewSubscriptionPlanUpgradeRequest({
        requestId: "request_1",
        decision: "APPROVE",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Target plan is not active.",
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logPlatformAction).not.toHaveBeenCalled();
  });

  it("detects a stale subscription plan inside the approval transaction", async () => {
    mocks.txSubscriptionFindUnique.mockResolvedValueOnce({
      id: "subscription_1",
      plan_id: "plan_pro",
    });

    await expect(
      reviewSubscriptionPlanUpgradeRequest({
        requestId: "request_1",
        decision: "APPROVE",
      }),
    ).rejects.toThrow(
      "Subscription plan changed after request creation. Ask the owner to submit a new request.",
    );

    expect(mocks.txSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.txUpgradeRequestUpdate).not.toHaveBeenCalled();
    expect(mocks.logPlatformAction).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("approves the request and plan change atomically with reviewer state", async () => {
    const result = await reviewSubscriptionPlanUpgradeRequest({
      requestId: "request_1",
      decision: "APPROVE",
      reviewNote: "Verified payment history",
    });

    expect(result).toEqual({
      success: true,
      data: { id: "request_1", status: "APPROVED" },
    });
    expect(mocks.txSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "subscription_1" },
      data: { plan_id: "plan_plus" },
    });
    expect(mocks.txUpgradeRequestUpdate).toHaveBeenCalledWith({
      where: { id: "request_1" },
      data: {
        status: "APPROVED",
        review_note: "Verified payment history",
        reviewed_by_user_id: "admin_1",
        reviewed_at: new Date("2026-09-16T04:00:00.000Z"),
      },
    });
    expect(mocks.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SUBSCRIPTION_UPGRADE_REQUEST_APPROVED",
        businessId: "business_1",
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/acme/billing");
  });

  it("rejects paid conversion outside trialing without invoice writes", async () => {
    mocks.ensureBusinessSubscription.mockResolvedValueOnce({
      ...baseSubscription,
      status: "ACTIVE",
    });

    await expect(
      convertTrialToPaid({
        businessId: "business_1",
        paymentReference: "GCASH-001",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Subscription is in status ACTIVE, not TRIALING.",
    });

    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.createInvoiceForSubscription).not.toHaveBeenCalled();
    expect(mocks.markInvoicePaid).not.toHaveBeenCalled();
  });

  it("converts a trial, settles its invoice, and persists manual payment evidence", async () => {
    mocks.ensureBusinessSubscription.mockResolvedValueOnce({
      ...baseSubscription,
      status: "TRIALING",
    });
    mocks.subscriptionUpdate.mockResolvedValueOnce({
      id: "subscription_1",
      status: "ACTIVE",
    });

    const result = await convertTrialToPaid({
      businessId: "business_1",
      paymentReference: "  GCASH-001  ",
    });

    expect(result).toEqual({
      success: true,
      data: { id: "subscription_1", status: "ACTIVE" },
    });
    expect(mocks.markInvoicePaid).toHaveBeenCalledWith({
      invoiceId: "invoice_1",
      paidAmountCentavos: 149_900,
    });
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith({
      where: { id: "invoice_1" },
      data: {
        paid_at: new Date("2026-09-16T04:00:00.000Z"),
        metadata: {
          collection_mode: "MANUAL",
          payment_reference: "GCASH-001",
          marked_by_admin: "admin_1",
          marked_at: "2026-09-16T04:00:00.000Z",
          reason: "TRIAL_CONVERTED_TO_PAID",
        },
      },
    });
    expect(mocks.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TRIAL_CONVERTED_TO_PAID",
        metadata: {
          invoiceId: "invoice_1",
          paymentReference: "GCASH-001",
        },
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/invoices");
  });
});
