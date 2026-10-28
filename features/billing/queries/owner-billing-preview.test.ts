import { describe, expect, it, vi } from "vitest";
import type { OwnerSubscriptionActor } from "@/features/billing/owner-subscription-access";
import type { Prisma } from "@/prisma/generated/prisma/client";

vi.mock("@/prisma/prisma", () => ({ prisma: {} }));
import { getOwnerBillingPreviewData } from "./owner-billing-preview";

const actor = { businessId: "business-a", businessSlug: "beautyfeel", userId: "owner-a", ownerId: 7 } as OwnerSubscriptionActor;

function database() {
  return {
    business: { findFirst: vi.fn().mockResolvedValue({ name: "BeautyFeel", referral_code: { code: "BF-REF" }, referral_attributions_as_referrer: [{ id: "ref-1", status: "ACTIVE", created_at: new Date("2026-09-01T00:00:00.000Z"), referred_business: { name: "Referred Salon" } }] }) },
    businessSubscription: { findFirst: vi.fn() },
    subscriptionPlan: { findMany: vi.fn().mockResolvedValue([{ code: "PRO_MONTHLY", name: "Pro", price_amount: 499900 }]) },
    subscriptionPlanUpgradeRequest: { findMany: vi.fn().mockResolvedValue([{ id: "request-1", status: "PENDING", created_at: new Date("2026-09-01T00:00:00.000Z"), reviewed_at: null, current_plan: { code: "STARTER_MONTHLY" }, target_plan: { code: "PLUS_MONTHLY" } }]), findFirst: vi.fn().mockResolvedValue({ id: "request-1", target_plan: { code: "PLUS_MONTHLY" } }) },
  };
}

describe("owner billing preview read", () => {
  it("does not initialize billing state on a read or disclose absent subscription fields", async () => {
    const db = database();
    db.businessSubscription.findFirst.mockResolvedValue(null);
    expect(await getOwnerBillingPreviewData(actor, db as unknown as Prisma.TransactionClient)).toEqual({
      businessName: "BeautyFeel", subscription: null, availableUpgradePlanNames: [], availableUpgradePlans: [], pendingUpgradeRequest: null, referral: null, invoices: [], upgradeRequests: [],
    });
    expect(db.business.findFirst.mock.calls[0][0].where).toEqual({
      id: "business-a", slug: "beautyfeel",
      owners: { some: { id: 7, user_id: "owner-a", business_id: "business-a", user: { role: "OWNER" } } },
    });
    expect(db.businessSubscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ business_id: "business-a" }) }));
    expect(db.subscriptionPlan.findMany).not.toHaveBeenCalled();
    expect(db.subscriptionPlanUpgradeRequest.findMany).not.toHaveBeenCalled();
  });

  it("returns narrow JSON-safe billing fields scoped to the verified business", async () => {
    const db = database();
    db.businessSubscription.findFirst.mockResolvedValue({
      status: "ACTIVE", current_period_end: new Date("2026-10-01T00:00:00.000Z"),
      plan: { name: "Starter", code: "STARTER_MONTHLY", price_amount: 10000 },
      credits: [{ amount_total: 2500 }],
      invoices: [{ id: "invoice-1", created_at: new Date("2026-09-01T00:00:00.000Z"), period_start: new Date("2026-09-01T00:00:00.000Z"), period_end: new Date("2026-10-01T00:00:00.000Z"), due_at: new Date("2026-09-01T00:00:00.000Z"), status: "PAID", amount_subtotal: 10000, amount_credit_applied: 2000, amount_due: 8000, amount_paid: 8000, paid_at: new Date("2026-09-02T00:00:00.000Z"), metadata: { secret: "private", manual_payment_reference: "REF-1", manual_payment_submitted_at: "2026-09-01T12:00:00.000Z" } }],
    });
    expect(await getOwnerBillingPreviewData(actor, db as unknown as Prisma.TransactionClient)).toEqual({
      businessName: "BeautyFeel",
      subscription: { planName: "Starter", planCode: "STARTER_MONTHLY", status: "ACTIVE", periodEnd: "2026-10-01T00:00:00.000Z", entitlements: expect.any(Object) },
      availableUpgradePlanNames: ["Pro"],
      availableUpgradePlans: [{ code: "PRO_MONTHLY", name: "Pro", priceAmount: 499900 }],
      pendingUpgradeRequest: { id: "request-1", targetPlanCode: "PLUS_MONTHLY" },
      referral: { code: "BF-REF", earnedCredits: 2500, attributions: [{ id: "ref-1", businessName: "Referred Salon", status: "ACTIVE", createdAt: "2026-09-01T00:00:00.000Z" }] },
      invoices: [{ id: "invoice-1", createdAt: "2026-09-01T00:00:00.000Z", periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z", dueAt: "2026-09-01T00:00:00.000Z", status: "PAID", amountSubtotal: 10000, amountCreditApplied: 2000, amountDue: 8000, amountPaid: 8000, paidAt: "2026-09-02T00:00:00.000Z", paymentReference: "REF-1", paymentSubmittedAt: "2026-09-01T12:00:00.000Z" }],
      upgradeRequests: [{ id: "request-1", currentPlanCode: "STARTER_MONTHLY", targetPlanCode: "PLUS_MONTHLY", status: "PENDING", createdAt: "2026-09-01T00:00:00.000Z", reviewedAt: null }],
    });
    expect(db.businessSubscription.findFirst.mock.calls[0][0].where.business).toEqual(db.business.findFirst.mock.calls[0][0].where);
    expect(db.businessSubscription.findFirst.mock.calls[0][0].select.invoices.where).toEqual({ business_id: "business-a" });
    expect(db.subscriptionPlanUpgradeRequest.findMany.mock.calls[0][0].where).toEqual({ business_id: "business-a" });
    expect(JSON.stringify(await getOwnerBillingPreviewData(actor, db as unknown as Prisma.TransactionClient))).not.toContain("private");
  });

  it("does not query subscription records without current owner membership", async () => {
    const db = database();
    db.business.findFirst.mockResolvedValue(null);
    expect(await getOwnerBillingPreviewData(actor, db as unknown as Prisma.TransactionClient)).toBeNull();
    expect(db.businessSubscription.findFirst).not.toHaveBeenCalled();
  });
});
