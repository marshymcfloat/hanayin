import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInvoiceForSubscription: vi.fn(),
  findInvoice: vi.fn(),
  findSubscription: vi.fn(),
  invoiceUpdate: vi.fn(),
  logPlatformAction: vi.fn(),
  markInvoicePaid: vi.fn(),
  publishEvent: vi.fn(),
  qualifyReferral: vi.fn(),
  revalidatePath: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/guards", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock("@/features/billing/subscription-service", () => ({
  createInvoiceForSubscription: mocks.createInvoiceForSubscription,
  markInvoicePaid: mocks.markInvoicePaid,
  qualifyAndRewardReferralForBusiness: mocks.qualifyReferral,
}));
vi.mock("@/lib/services/outbox", () => ({ publishEvent: mocks.publishEvent }));
vi.mock("./platform-action-log", () => ({
  logPlatformAction: mocks.logPlatformAction,
}));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    businessSubscription: { findFirst: mocks.findSubscription },
    subscriptionInvoice: {
      findUnique: mocks.findInvoice,
      update: mocks.invoiceUpdate,
    },
  },
}));

import {
  createSubscriptionInvoice,
  markInvoicePaidManually,
} from "./invoice-admin";

const adminAuth = {
  success: true as const,
  session: { user: { id: "admin_1" } },
};

const invoice = {
  id: "invoice_1",
  status: "OPEN",
  amount_due: 149_900,
  amount_paid: 0,
  business_id: "business_1",
  metadata: { source: "renewal" },
};

describe("platform invoice administration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T04:00:00.000Z"));
    mocks.requirePlatformAdmin.mockResolvedValue(adminAuth);
    mocks.createInvoiceForSubscription.mockResolvedValue({
      ...invoice,
      business_id: "business_1",
    });
    mocks.findInvoice.mockResolvedValue(invoice);
    mocks.markInvoicePaid.mockResolvedValue({ id: "invoice_1" });
    mocks.invoiceUpdate.mockResolvedValue({ ...invoice, status: "PAID" });
    mocks.qualifyReferral.mockResolvedValue(null);
    mocks.findSubscription.mockResolvedValue({
      current_period_end: new Date("2026-10-16T04:00:00.000Z"),
      plan: { code: "STARTER_MONTHLY" },
      business: { slug: "acme" },
    });
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ outboxMessage: { create: vi.fn() } }),
    );
    mocks.publishEvent.mockResolvedValue({ id: "event_1" });
  });

  it("creates an invoice with its reason, audit record, and invalidation", async () => {
    const result = await createSubscriptionInvoice(
      "subscription_1",
      "MANUAL_RENEWAL",
    );

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ id: "invoice_1" }),
    });
    expect(mocks.createInvoiceForSubscription).toHaveBeenCalledWith(
      "subscription_1",
      "MANUAL_RENEWAL",
    );
    expect(mocks.logPlatformAction).toHaveBeenCalledWith({
      action: "SUBSCRIPTION_INVOICE_CREATED",
      targetType: "SubscriptionInvoice",
      targetId: "invoice_1",
      businessId: "business_1",
      metadata: { reason: "MANUAL_RENEWAL" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/invoices");
  });

  it("rejects a missing invoice before payment state changes", async () => {
    mocks.findInvoice.mockResolvedValueOnce(null);

    await expect(
      markInvoicePaidManually({
        invoiceId: "missing",
        paymentReference: "GCASH-001",
      }),
    ).resolves.toEqual({ success: false, error: "Invoice not found" });

    expect(mocks.markInvoicePaid).not.toHaveBeenCalled();
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
    expect(mocks.qualifyReferral).not.toHaveBeenCalled();
    expect(mocks.logPlatformAction).not.toHaveBeenCalled();
  });

  it("settles payment, preserves metadata, publishes an event, and audits", async () => {
    const result = await markInvoicePaidManually({
      invoiceId: "invoice_1",
      paymentReference: "GCASH-001",
      paidAt: "2026-09-15T03:30:00.000Z",
    });

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ status: "PAID" }),
    });
    expect(mocks.markInvoicePaid).toHaveBeenCalledWith({
      invoiceId: "invoice_1",
      paidAmountCentavos: 149_900,
    });
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith({
      where: { id: "invoice_1" },
      data: {
        paid_at: new Date("2026-09-15T03:30:00.000Z"),
        metadata: {
          source: "renewal",
          collection_mode: "MANUAL",
          payment_reference: "GCASH-001",
          marked_by_admin: "admin_1",
          marked_at: "2026-09-16T04:00:00.000Z",
        },
      },
    });
    expect(mocks.qualifyReferral).toHaveBeenCalledWith("business_1");
    expect(mocks.publishEvent).toHaveBeenCalledWith(
      expect.anything(),
      {
        type: "SUBSCRIPTION_PAYMENT_CONFIRMED",
        aggregateType: "SubscriptionInvoice",
        aggregateId: "invoice_1",
        businessId: "business_1",
        payload: {
          invoiceId: "invoice_1",
          businessId: "business_1",
          businessSlug: "acme",
          planCode: "STARTER_MONTHLY",
          amountPaidCentavos: 149_900,
          periodEndsAt: "2026-10-16T04:00:00.000Z",
          confirmedAt: "2026-09-15T03:30:00.000Z",
        },
      },
    );
    expect(mocks.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SUBSCRIPTION_INVOICE_MARKED_PAID_MANUALLY",
        metadata: {
          paymentReference: "GCASH-001",
          paidAmountCentavos: 149_900,
          paidAt: "2026-09-15T03:30:00.000Z",
        },
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/referrals");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform");
  });

  it("uses the prior paid amount for a zero-due invoice", async () => {
    mocks.findInvoice.mockResolvedValueOnce({
      ...invoice,
      amount_due: 0,
      amount_paid: 42_500,
      metadata: null,
    });

    await markInvoicePaidManually({
      invoiceId: "invoice_1",
      paymentReference: "BANK-001",
    });

    expect(mocks.markInvoicePaid).toHaveBeenCalledWith({
      invoiceId: "invoice_1",
      paidAmountCentavos: 42_500,
    });
    expect(mocks.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ paidAmountCentavos: 42_500 }),
      }),
    );
  });

  it("keeps a successful payment when event publication fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.publishEvent.mockRejectedValueOnce(new Error("outbox unavailable"));

    await expect(
      markInvoicePaidManually({
        invoiceId: "invoice_1",
        paymentReference: "GCASH-001",
      }),
    ).resolves.toEqual({
      success: true,
      data: expect.objectContaining({ status: "PAID" }),
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[markInvoicePaidManuallyAction] Failed to publish SUBSCRIPTION_PAYMENT_CONFIRMED",
      expect.objectContaining({ invoiceId: "invoice_1" }),
    );
    expect(mocks.logPlatformAction).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/invoices");
  });
});
