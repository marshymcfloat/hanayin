import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn(), defaults: vi.fn(), invoice: vi.fn(), cache: vi.fn(), event: vi.fn(), business: { findFirst: vi.fn() }, plan: { findUnique: vi.fn() }, upgrade: { findFirst: vi.fn(), create: vi.fn() }, payment: { findFirst: vi.fn(), updateMany: vi.fn(), findFirstOrThrow: vi.fn() }, transaction: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.resolve }));
vi.mock("@/features/billing/subscription-service", () => ({ SUBSCRIPTION_PLAN_CODES: ["STARTER_MONTHLY", "PLUS_MONTHLY", "PRO_MONTHLY"], ensureDefaultPlans: mocks.defaults, createInvoiceForSubscription: mocks.invoice }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: mocks.business, subscriptionPlan: mocks.plan, subscriptionPlanUpgradeRequest: mocks.upgrade, subscriptionInvoice: mocks.payment, $transaction: mocks.transaction } }));
vi.mock("@/lib/services/outbox", () => ({ publishEvent: mocks.event }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
import { createOwnerSubscriptionInvoiceAction, requestOwnerPlanUpgradeAction, submitManualPaymentReferenceAction } from "./subscription-owner";

const auth = () => ({ success: true, businessSlug: "demo-biz", session: { user: { id: "owner_user_1", role: "OWNER" } } });
const actor = () => ({ success: true, businessId: "biz_1", businessSlug: "demo-biz", userId: "owner_user_1", ownerId: 1, actorType: "OWNER", role: "OWNER" });
const business = () => ({ id: "biz_1", subscriptions: [{ id: "sub_1", plan_id: "plan_starter", plan: { id: "plan_starter", code: "STARTER_MONTHLY", price_amount: 149900 } }] });
const invoice = () => ({ id: "inv_1", status: "OPEN", business_id: "biz_1", metadata: { existing: "value" }, updated_at: new Date("2030-01-15T09:00:00Z"), amount_paid: 0, paid_at: null });
const payment = () => ({ invoiceId: "inv_1", paymentReference: "GCASH-REF-123" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(auth()); mocks.resolve.mockResolvedValue(actor()); mocks.defaults.mockResolvedValue(undefined);
  mocks.business.findFirst.mockResolvedValue(business());
  mocks.plan.findUnique.mockResolvedValue({ id: "plan_plus", code: "PLUS_MONTHLY", name: "Plus Monthly", price_amount: 249900, is_active: true });
  mocks.upgrade.findFirst.mockResolvedValue(null); mocks.upgrade.create.mockResolvedValue({ id: "req_1", status: "PENDING" });
  mocks.payment.findFirst.mockResolvedValue(invoice()); mocks.payment.updateMany.mockResolvedValue({ count: 1 }); mocks.payment.findFirstOrThrow.mockResolvedValue(invoice());
  mocks.invoice.mockResolvedValue(invoice()); mocks.event.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async callback => callback({ business: mocks.business, subscriptionPlan: mocks.plan, subscriptionPlanUpgradeRequest: mocks.upgrade, subscriptionInvoice: mocks.payment }));
});

describe("submitManualPaymentReferenceAction", () => {
  it("stores manual payment metadata and emits outbox event", async () => {
    const input = { ...payment(), amountCentavos: 400000, note: "Paid in full", proofUrl: "https://example.com/proof.png" };
    expect((await submitManualPaymentReferenceAction(input)).success).toBe(true);
    expect(mocks.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "inv_1", business_id: "biz_1", status: "OPEN", amount_paid: 0, paid_at: null, updated_at: invoice().updated_at, metadata: { equals: { existing: "value" } } }), data: { metadata: expect.objectContaining({ existing: "value", manual_payment_reference: input.paymentReference, manual_payment_amount_centavos: 400000, manual_payment_note: input.note, manual_payment_proof_url: input.proofUrl }) } }));
    expect(mocks.event).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ type: "MANUAL_PAYMENT_SUBMITTED", aggregateId: "inv_1", businessId: "biz_1", payload: expect.objectContaining({ paymentReference: input.paymentReference, submittedByUserId: "owner_user_1" }) }));
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    expect(mocks.cache).toHaveBeenCalledWith("/app/demo-biz/billing"); expect(mocks.cache).toHaveBeenCalledWith("/platform/invoices");
  });
  it("returns validation error when payment reference is missing", async () => {
    const result = await submitManualPaymentReferenceAction({ ...payment(), paymentReference: "" });
    expect(result.success).toBe(false); if (!result.success) expect(result.error.toLowerCase()).toContain("too small");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("returns forbidden when invoice does not belong to current business", async () => {
    mocks.payment.findFirst.mockResolvedValue(null);
    expect(await submitManualPaymentReferenceAction(payment())).toEqual({ success: false, error: "Invoice not found" });
    expect(mocks.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "inv_1", business_id: "biz_1", business_subscription: { business_id: "biz_1" } }) }));
    expect(mocks.payment.updateMany).not.toHaveBeenCalled(); expect(mocks.event).not.toHaveBeenCalled();
  });
  it("prevents duplicate manual payment submissions for the same invoice", async () => {
    mocks.payment.findFirst.mockResolvedValue({ ...invoice(), metadata: { manual_payment_submitted_at: "2030-01-15T09:30:00.000Z" } });
    expect(await submitManualPaymentReferenceAction(payment())).toEqual({ success: false, error: "Manual payment already submitted for this invoice. Wait for verification before sending another reference." });
    expect(mocks.payment.updateMany).not.toHaveBeenCalled(); expect(mocks.event).not.toHaveBeenCalled();
  });
  it.each(["DRAFT", "OPEN"])("permits %s invoices", async status => {
    mocks.payment.findFirst.mockResolvedValue({ ...invoice(), status }); expect((await submitManualPaymentReferenceAction(payment())).success).toBe(true);
  });
  it.each(["PAID", "VOID", "FAILED", "EXPIRED"])("rejects %s invoices before mutation", async status => {
    mocks.payment.findFirst.mockResolvedValue({ ...invoice(), status }); expect(await submitManualPaymentReferenceAction(payment())).toEqual({ success: false, error: "Manual payment can only be submitted for open invoices." }); expect(mocks.payment.updateMany).not.toHaveBeenCalled();
  });
  it.each([null, [], "old", 17])("accepts non-record metadata %j without copying its fields", async metadata => {
    mocks.payment.findFirst.mockResolvedValue({ ...invoice(), metadata }); expect((await submitManualPaymentReferenceAction(payment())).success).toBe(true);
    expect(mocks.payment.updateMany.mock.calls[0][0].data.metadata).toEqual({ manual_payment_reference: "GCASH-REF-123", manual_payment_submitted_at: expect.any(String) });
  });
  it.each(["", "  ", null, 1])("does not treat timestamp %j as a prior submission", async manual_payment_submitted_at => {
    mocks.payment.findFirst.mockResolvedValue({ ...invoice(), metadata: { manual_payment_submitted_at } }); expect((await submitManualPaymentReferenceAction(payment())).success).toBe(true);
  });
  it("deletes omitted optional payment metadata while retaining unrelated fields", async () => {
    mocks.payment.findFirst.mockResolvedValue({ ...invoice(), metadata: { keep: { deep: true }, manual_payment_amount_centavos: 22, manual_payment_note: "old", manual_payment_proof_url: "https://example.com/old" } });
    expect((await submitManualPaymentReferenceAction({ ...payment(), note: "  " })).success).toBe(true);
    expect(mocks.payment.updateMany.mock.calls[0][0].data.metadata).toEqual({ keep: { deep: true }, manual_payment_reference: "GCASH-REF-123", manual_payment_submitted_at: expect.any(String) });
  });
  it("rejects a late paid-state/metadata/concurrent-submit snapshot instead of emitting", async () => {
    mocks.payment.updateMany.mockResolvedValue({ count: 0 }); expect(await submitManualPaymentReferenceAction(payment())).toEqual({ success: false, error: "Unable to submit manual payment reference." }); expect(mocks.event).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("does not report success when the outbox write fails", async () => {
    mocks.event.mockRejectedValue(new Error("Private database detail")); expect(await submitManualPaymentReferenceAction(payment())).toEqual({ success: false, error: "Unable to submit manual payment reference." }); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("does not report success if the updated invoice read fails", async () => {
    mocks.payment.findFirstOrThrow.mockRejectedValue(new Error("Private read detail")); expect((await submitManualPaymentReferenceAction(payment())).success).toBe(false); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each([{ invoiceId: "x".repeat(201) }, { paymentReference: "x".repeat(121) }, { amountCentavos: -1 }, { amountCentavos: 1.5 }, { amountCentavos: 1_000_000_001 }, { note: "x".repeat(1001) }, { proofUrl: "bad" }])("rejects bounded invalid fields %j", async invalid => {
    expect((await submitManualPaymentReferenceAction({ ...payment(), ...invalid })).success).toBe(false); expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("requestOwnerPlanUpgradeAction", () => {
  it("creates a pending upgrade request for an owner", async () => {
    expect((await requestOwnerPlanUpgradeAction({ targetPlanCode: "PLUS_MONTHLY", note: "Need advanced reports" })).success).toBe(true);
    expect(mocks.upgrade.create).toHaveBeenCalledWith({ data: { business_id: "biz_1", business_subscription_id: "sub_1", requested_by_user_id: "owner_user_1", current_plan_id: "plan_starter", target_plan_id: "plan_plus", request_note: "Need advanced reports" } });
    expect(mocks.cache).toHaveBeenCalledWith("/app/demo-biz/billing"); expect(mocks.cache).toHaveBeenCalledWith("/platform"); expect(mocks.cache).toHaveBeenCalledWith("/platform/businesses");
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  });
  it("blocks creating another request when one is already pending", async () => {
    mocks.upgrade.findFirst.mockResolvedValue({ target_plan: { name: "Plus Monthly", code: "PLUS_MONTHLY" } });
    expect(await requestOwnerPlanUpgradeAction({ targetPlanCode: "PLUS_MONTHLY" })).toEqual({ success: false, error: "A pending upgrade request already exists for Plus Monthly (PLUS_MONTHLY)." }); expect(mocks.upgrade.create).not.toHaveBeenCalled();
  });
  it.each([null, { id: "biz_1", subscriptions: [] }])("rejects missing subscription workspace %j", async row => {
    mocks.business.findFirst.mockResolvedValue(row); expect((await requestOwnerPlanUpgradeAction({ targetPlanCode: "PLUS_MONTHLY" })).success).toBe(false); expect(mocks.upgrade.create).not.toHaveBeenCalled();
  });
  it("rejects the current plan", async () => {
    expect(await requestOwnerPlanUpgradeAction({ targetPlanCode: "STARTER_MONTHLY" })).toEqual({ success: false, error: "You are already on this plan." }); expect(mocks.plan.findUnique).not.toHaveBeenCalled();
  });
  it.each([null, { id: "plan_plus", is_active: false }])("rejects inactive/missing target %j", async plan => {
    mocks.plan.findUnique.mockResolvedValue(plan); expect(await requestOwnerPlanUpgradeAction({ targetPlanCode: "PLUS_MONTHLY" })).toEqual({ success: false, error: "Selected plan is not active." });
  });
  it.each([149900, 100])("rejects non-upgrade price %i", async price_amount => {
    mocks.plan.findUnique.mockResolvedValue({ is_active: true, price_amount }); expect((await requestOwnerPlanUpgradeAction({ targetPlanCode: "PLUS_MONTHLY" })).success).toBe(false); expect(mocks.upgrade.create).not.toHaveBeenCalled();
  });
  it("stores empty notes as null", async () => {
    expect((await requestOwnerPlanUpgradeAction({ targetPlanCode: "PLUS_MONTHLY", note: "  " })).success).toBe(true); expect(mocks.upgrade.create.mock.calls[0][0].data.request_note).toBeNull();
  });
  it.each([null, {}, { targetPlanCode: "NOPE" }, { targetPlanCode: "PLUS_MONTHLY", note: "x".repeat(1001) }])("rejects invalid upgrade %j before plan work", async input => {
    expect((await requestOwnerPlanUpgradeAction(input)).success).toBe(false); expect(mocks.defaults).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["defaults", "create", "transaction"])("returns safe %s failures without refresh", async failure => {
    if (failure === "defaults") mocks.defaults.mockRejectedValue(new Error("Private SQL")); if (failure === "create") mocks.upgrade.create.mockRejectedValue(new Error("Private SQL")); if (failure === "transaction") mocks.transaction.mockRejectedValue({ code: "P2034", message: "Private concurrency detail" });
    expect(await requestOwnerPlanUpgradeAction({ targetPlanCode: "PLUS_MONTHLY" })).toEqual({ success: false, error: "Unable to request plan upgrade." }); expect(mocks.cache).not.toHaveBeenCalled();
  });
});

describe("current-owner invoice delegation", () => {
  it("delegates only the tenant-derived subscription and preserves renewal reason default", async () => {
    expect(await createOwnerSubscriptionInvoiceAction()).toEqual({ success: true, data: { id: "inv_1", status: "OPEN" } }); expect(mocks.invoice).toHaveBeenCalledWith("sub_1", "OWNER_MANUAL_RENEWAL"); expect(mocks.cache).toHaveBeenCalledWith("/app/demo-biz/billing");
    expect(mocks.business.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "biz_1", slug: "demo-biz", owners: { some: { id: 1, user_id: "owner_user_1", business_id: "biz_1", user: { role: "OWNER" } } } }) }));
  });
  it("preserves a custom reason", async () => { await createOwnerSubscriptionInvoiceAction("MANUAL_REQUEST"); expect(mocks.invoice).toHaveBeenCalledWith("sub_1", "MANUAL_REQUEST"); });
  it.each(["", "x".repeat(121)])("rejects invalid reason %j", async reason => { expect((await createOwnerSubscriptionInvoiceAction(reason)).success).toBe(false); expect(mocks.invoice).not.toHaveBeenCalled(); });
  it.each([null, { subscriptions: [] }])("rejects missing subscription %j", async business => { mocks.business.findFirst.mockResolvedValue(business); expect(await createOwnerSubscriptionInvoiceAction()).toEqual({ success: false, error: "Subscription not found" }); expect(mocks.invoice).not.toHaveBeenCalled(); });
  it("returns a safe helper failure", async () => { mocks.invoice.mockRejectedValue(new Error("Private payment detail")); expect(await createOwnerSubscriptionInvoiceAction()).toEqual({ success: false, error: "Unable to create subscription invoice." }); });
});

describe.each([
  ["invoice", () => createOwnerSubscriptionInvoiceAction()],
  ["upgrade", () => requestOwnerPlanUpgradeAction({ targetPlanCode: "PLUS_MONTHLY" })],
  ["reference", () => submitManualPaymentReferenceAction(payment())],
] as const)("%s authorization and post-commit behavior", (_name, run) => {
  it("preserves auth denial", async () => { mocks.auth.mockResolvedValue({ success: false, error: "Unauthorized" }); expect(await run()).toEqual({ success: false, error: "Unauthorized" }); expect(mocks.resolve).not.toHaveBeenCalled(); });
  it.each(["EMPLOYEE", "PLATFORM_ADMIN"])("rejects authenticated %s before database work", async role => { mocks.auth.mockResolvedValue({ ...auth(), session: { user: { id: "owner_user_1", role } } }); expect((await run()).success).toBe(false); expect(mocks.resolve).not.toHaveBeenCalled(); });
  it("rejects a missing actor ID", async () => { mocks.auth.mockResolvedValue({ ...auth(), session: { user: { role: "OWNER" } } }); expect((await run()).success).toBe(false); expect(mocks.resolve).not.toHaveBeenCalled(); });
  it.each([{ success: false, error: "Forbidden" }, { ...actor(), actorType: "EMPLOYEE" }, { ...actor(), role: "EMPLOYEE" }])("rejects non-current-owner membership %j", async context => { mocks.resolve.mockResolvedValue(context); expect((await run()).success).toBe(false); expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.invoice).not.toHaveBeenCalled(); });
  it("does not apply a subscription write blocker", async () => { expect((await run()).success).toBe(true); expect(mocks.auth).toHaveBeenCalledWith(); });
  it("keeps committed success when every cache refresh throws", async () => { mocks.cache.mockImplementation(() => { throw new Error("Cache unavailable"); }); expect((await run()).success).toBe(true); });
  it("sanitizes auth/access exceptions", async () => { mocks.resolve.mockRejectedValue(new Error("Private SQL detail")); const result = await run(); expect(result.success).toBe(false); if (!result.success) expect(result.error).not.toContain("Private"); });
});

describe.each([
  ["upgrade", () => requestOwnerPlanUpgradeAction({ targetPlanCode: "PLUS_MONTHLY" })],
  ["reference", () => submitManualPaymentReferenceAction(payment())],
] as const)("%s transaction membership recheck", (_name, run) => {
  it.each([{ success: false, error: "Forbidden" }, { ...actor(), businessId: "foreign" }, { ...actor(), businessSlug: "foreign" }, { ...actor(), userId: "foreign-user" }, { ...actor(), ownerId: 2 }])("rejects revoked/replaced actor %j", async current => { mocks.resolve.mockResolvedValueOnce(actor()).mockResolvedValueOnce(current); expect(await run()).toEqual({ success: false, error: "Forbidden" }); expect(mocks.upgrade.create).not.toHaveBeenCalled(); expect(mocks.payment.updateMany).not.toHaveBeenCalled(); expect(mocks.event).not.toHaveBeenCalled(); });
});
