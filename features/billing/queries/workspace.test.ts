import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), business: vi.fn(), subscription: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireTenantAccess: mocks.auth }));
vi.mock("@/features/billing/owner-subscription-access", () => ({
  resolveOwnerSubscriptionActor: mocks.actor,
  ownerSubscriptionBusinessFilter: (actor: { businessId: string; businessSlug: string }) => ({ id: actor.businessId, slug: actor.businessSlug }),
}));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.business }, businessSubscription: { findFirst: mocks.subscription } } }));
vi.mock("@/features/billing/subscription-service", () => ({
  SUBSCRIPTION_PLAN_CODES: [],
}));
import { getBillingWorkspaceData, getManualPaymentMetadata } from "@/features/billing/queries/workspace";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, session: { user: { id: "owner-1", role: "OWNER" } } });
  mocks.actor.mockResolvedValue({ businessId: "business-1", businessSlug: "demo", userId: "owner-1", ownerId: 1 });
});

describe("billing workspace", () => {
  it("does not initialize billing or read data for denied tenants", async () => {
    mocks.auth.mockResolvedValue({ success: false });
    expect(await getBillingWorkspaceData("other")).toBeNull();
    expect(mocks.business).not.toHaveBeenCalled();
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it("does not write on read when the business is missing", async () => {
    mocks.business.mockResolvedValue(null);
    expect(await getBillingWorkspaceData("missing")).toBeNull();
    expect(mocks.subscription).not.toHaveBeenCalled();
    expect(mocks.business).toHaveBeenCalledWith({ where: { id: "business-1", slug: "demo" }, select: { id: true, name: true } });
  });
  it("rejects employees and revoked owners before billing reads", async () => {
    mocks.auth.mockResolvedValueOnce({ success: true, session: { user: { id: "employee-1", role: "EMPLOYEE" } } });
    expect(await getBillingWorkspaceData("demo")).toBeNull();
    mocks.actor.mockResolvedValueOnce(null);
    expect(await getBillingWorkspaceData("demo")).toBeNull();
    expect(mocks.business).not.toHaveBeenCalled();
    expect(mocks.subscription).not.toHaveBeenCalled();
  });
  it("does not create a missing subscription during a read", async () => {
    mocks.business.mockResolvedValue({ id: "business-1", name: "Demo" });
    mocks.subscription.mockResolvedValue(null);
    expect(await getBillingWorkspaceData("demo")).toBeNull();
    expect(mocks.subscription).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ business_id: "business-1", business: expect.objectContaining({ id: "business-1", slug: "demo" }) }), include: expect.objectContaining({ invoices: expect.objectContaining({ where: { business_id: "business-1" } }) }) }));
  });
  it("maps only valid manual-payment metadata values", () => {
    expect(getManualPaymentMetadata(null).reference).toBeUndefined();
    expect(getManualPaymentMetadata([]).amountCentavos).toBeUndefined();
    expect(getManualPaymentMetadata({ manual_payment_reference: "  ", manual_payment_amount_centavos: Infinity })).toMatchObject({ reference: undefined, amountCentavos: undefined });
    expect(getManualPaymentMetadata({ manual_payment_reference: "REF-1", manual_payment_amount_centavos: 12500, manual_payment_note: "paid" })).toMatchObject({ reference: "REF-1", amountCentavos: 12500, note: "paid" });
  });
});
