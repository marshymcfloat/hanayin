import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), business: vi.fn(), plans: vi.fn(), subscription: vi.fn(), referral: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireTenantAccess: mocks.auth }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.business } } }));
vi.mock("@/features/billing/subscription-service", () => ({
  ensureDefaultPlans: mocks.plans, ensureBusinessSubscription: mocks.subscription,
  ensureReferralCode: mocks.referral, SUBSCRIPTION_PLAN_CODES: [],
}));
import { getBillingWorkspaceData, getManualPaymentMetadata } from "@/features/billing/queries/workspace";

beforeEach(() => { vi.resetAllMocks(); });

describe("billing workspace", () => {
  it("does not initialize billing or read data for denied tenants", async () => {
    mocks.auth.mockResolvedValue({ success: false });
    expect(await getBillingWorkspaceData("other")).toBeNull();
    expect(mocks.plans).not.toHaveBeenCalled();
    expect(mocks.business).not.toHaveBeenCalled();
    expect(mocks.subscription).not.toHaveBeenCalled();
    expect(mocks.referral).not.toHaveBeenCalled();
  });
  it("does not initialize a subscription for a missing business", async () => {
    mocks.auth.mockResolvedValue({ success: true });
    mocks.business.mockResolvedValue(null);
    expect(await getBillingWorkspaceData("missing")).toBeNull();
    expect(mocks.subscription).not.toHaveBeenCalled();
    expect(mocks.referral).not.toHaveBeenCalled();
  });
  it("maps only valid manual-payment metadata values", () => {
    expect(getManualPaymentMetadata(null).reference).toBeUndefined();
    expect(getManualPaymentMetadata([]).amountCentavos).toBeUndefined();
    expect(getManualPaymentMetadata({ manual_payment_reference: "  ", manual_payment_amount_centavos: Infinity })).toMatchObject({ reference: undefined, amountCentavos: undefined });
    expect(getManualPaymentMetadata({ manual_payment_reference: "REF-1", manual_payment_amount_centavos: 12500, manual_payment_note: "paid" })).toMatchObject({ reference: "REF-1", amountCentavos: 12500, note: "paid" });
  });
});
