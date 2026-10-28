import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { resolveOwnerSubscriptionActor, type OwnerSubscriptionActor } from "@/features/billing/owner-subscription-access";
import { requestOwnerPlanUpgrade, submitOwnerManualPayment } from "@/features/billing/services/owner-subscription";
import type { OwnerPlanUpgradeInput } from "@/features/billing/owner-subscription-schemas";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";

const controls = vi.hoisted(() => ({ failWrite: false, writeReached: false, failEvent: false, eventReached: false, afterInvoiceRead: null as null | (() => Promise<void>), afterPendingRead: null as null | (() => Promise<void>) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: vi.fn() }));
vi.mock("@/features/billing/subscription-service", async original => {
  const actual = await original<typeof import("@/features/billing/subscription-service")>();
  return { ...actual, ensureDefaultPlans: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("@/lib/services/outbox", async original => {
  const actual = await original<typeof import("@/lib/services/outbox")>();
  return { ...actual, publishEvent: async (...args: Parameters<typeof actual.publishEvent>) => {
    const result = await actual.publishEvent(...args);
    if (controls.failEvent) { controls.eventReached = true; throw new Error("Fixture post-outbox-insert failure"); }
    return result;
  } };
});
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, {
    get(client, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) => client.$transaction(tx => work(new Proxy(tx, {
        get(transaction, member) {
          if (member === "subscriptionInvoice") return new Proxy(transaction.subscriptionInvoice, {
            get(model, operation) {
              if (operation === "findFirst") return async (args: Prisma.SubscriptionInvoiceFindFirstArgs) => { const result = await model.findFirst(args); if (args.select?.metadata && controls.afterInvoiceRead) await controls.afterInvoiceRead(); return result; };
              if (operation === "updateMany") return async (args: Prisma.SubscriptionInvoiceUpdateManyArgs) => { const result = await model.updateMany(args); if (controls.failWrite) { controls.writeReached = true; throw new Error("Fixture post-metadata-write failure"); } return result; };
              const value = Reflect.get(model, operation); return typeof value === "function" ? value.bind(model) : value;
            },
          });
          if (member === "subscriptionPlanUpgradeRequest") return new Proxy(transaction.subscriptionPlanUpgradeRequest, {
            get(model, operation) {
              if (operation === "findFirst") return async (args: Prisma.SubscriptionPlanUpgradeRequestFindFirstArgs) => { const result = await model.findFirst(args); if (controls.afterPendingRead) await controls.afterPendingRead(); return result; };
              if (operation === "create") return async (args: Prisma.SubscriptionPlanUpgradeRequestCreateArgs) => { const result = await model.create(args); if (controls.failWrite) { controls.writeReached = true; throw new Error("Fixture post-upgrade-insert failure"); } return result; };
              const value = Reflect.get(model, operation); return typeof value === "function" ? value.bind(model) : value;
            },
          });
          return Reflect.get(transaction, member);
        },
      })), options);
      const value = Reflect.get(client, key); return typeof value === "function" ? value.bind(client) : value;
    },
  }) };
});
requireTestDatabase();

const now = new Date("2030-01-15T09:00:00Z");
const factory = createSharedWorkflowFactory({ namespace: "integration-owner-subscription", now });
const business = factory.business(); const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const user = factory.user({ contactNumber: "fixture-owner-subscription" });
const subscriptionId = `${business.id}-sub`; const foreignSubscriptionId = `${foreign.id}-sub`; const invoiceId = `${business.id}-invoice`;
const currentPlanId = `${business.id}-current-plan`; const targetPlanId = `${business.id}-target-plan`; const targetCode = `${business.id}-target`;
const planIds = [currentPlanId, targetPlanId]; const tenantIds = [business.id, foreign.id];
let ownerId: number; let actor: OwnerSubscriptionActor;
const input = () => ({ invoiceId, paymentReference: "FIXTURE-REFERENCE", amountCentavos: 1000, note: "Fixture note", proofUrl: "https://example.test/proof.png" });
// Isolated plan codes avoid mutating the default plan catalog; schemas are covered by unit tests.
const upgrade = () => ({ targetPlanCode: targetCode, note: "Fixture upgrade" } as OwnerPlanUpgradeInput);
const invoice = () => prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
const events = () => prisma.outboxMessage.findMany({ where: { business_id: { in: tenantIds } } });
const requests = () => prisma.subscriptionPlanUpgradeRequest.findMany({ where: { business_id: { in: tenantIds } } });
async function cleanup() {
  try { await prisma.business.deleteMany({ where: { id: { in: tenantIds } } }); }
  finally { try { await prisma.user.deleteMany({ where: { id: user.id } }); } finally { await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } }); } }
}
async function denial(command: "reference" | "upgrade") {
  const before = await invoice();
  const result = command === "reference" ? await submitOwnerManualPayment(actor, input()) : await requestOwnerPlanUpgrade(actor, upgrade());
  expect(result.success).toBe(false); expect(await invoice()).toEqual(before); expect(await events()).toHaveLength(0); expect(await requests()).toHaveLength(0);
}

describe("owner subscription commands on guarded disposable PostgreSQL", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    try {
      await cleanup();
      for (const tenant of [business, foreign]) await prisma.business.create({ data: { id: tenant.id, slug: tenant.slug, name: tenant.name, initials: tenant.initials } });
      await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: "OWNER" } });
      ownerId = (await prisma.owner.create({ data: { user_id: user.id, business_id: business.id } })).id;
      await prisma.subscriptionPlan.create({ data: { id: currentPlanId, code: `${business.id}-current`, name: "Fixture current", billing_interval: "MONTHLY", price_amount: 1000 } });
      await prisma.subscriptionPlan.create({ data: { id: targetPlanId, code: targetCode, name: "Fixture target", billing_interval: "MONTHLY", price_amount: 2000 } });
      for (const [id, business_id] of [[subscriptionId, business.id], [foreignSubscriptionId, foreign.id]]) await prisma.businessSubscription.create({ data: { id, business_id, plan_id: currentPlanId, current_period_start: now, current_period_end: new Date(now.getTime() + 86400000), status: "SUSPENDED" } });
      await prisma.subscriptionInvoice.create({ data: { id: invoiceId, business_id: business.id, business_subscription_id: subscriptionId, plan_id: currentPlanId, period_start: now, period_end: new Date(now.getTime() + 86400000), due_at: now, amount_subtotal: 1000, amount_due: 1000, metadata: { keep: "fixture" } } });
      const resolved = await resolveOwnerSubscriptionActor(business.slug, user.id); if (!resolved) throw new Error("Fixture actor missing"); actor = resolved;
    } catch (error) { await cleanup(); throw error; }
  });
  beforeEach(async () => {
    controls.failWrite = false; controls.writeReached = false; controls.failEvent = false; controls.eventReached = false; controls.afterInvoiceRead = null; controls.afterPendingRead = null;
    await prisma.outboxMessage.deleteMany({ where: { business_id: { in: tenantIds } } }); await prisma.subscriptionPlanUpgradeRequest.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.user.update({ where: { id: user.id }, data: { role: "OWNER" } }); await prisma.owner.update({ where: { id: ownerId }, data: { business_id: business.id } });
    await prisma.subscriptionPlan.update({ where: { id: targetPlanId }, data: { is_active: true, price_amount: 2000 } });
    await prisma.subscriptionInvoice.update({ where: { id: invoiceId }, data: { status: "OPEN", business_id: business.id, business_subscription_id: subscriptionId, metadata: { keep: "fixture" }, amount_paid: 0, paid_at: null } });
  });
  afterAll(async () => { controls.afterInvoiceRead = null; controls.afterPendingRead = null; controls.failWrite = false; controls.failEvent = false; try { await cleanup(); } finally { vi.useRealTimers(); await prisma.$disconnect(); } });

  it("commits reference metadata and one outbox event without settling the suspended subscription", async () => {
    const before = await invoice(); const subscription = await prisma.businessSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect((await submitOwnerManualPayment(actor, input())).success).toBe(true);
    expect(await invoice()).toMatchObject({ status: before.status, amount_paid: 0, paid_at: null, metadata: { keep: "fixture", manual_payment_reference: input().paymentReference, manual_payment_note: input().note, manual_payment_amount_centavos: 1000, manual_payment_proof_url: input().proofUrl, manual_payment_submitted_at: now.toISOString() } });
    expect(await prisma.businessSubscription.findUniqueOrThrow({ where: { id: subscriptionId } })).toEqual(subscription);
    expect(await events()).toHaveLength(1); expect((await events())[0]).toMatchObject({ event_type: "MANUAL_PAYMENT_SUBMITTED", aggregate_type: "SubscriptionInvoice", aggregate_id: invoiceId, business_id: business.id, payload: { invoiceId, businessId: business.id, businessSlug: business.slug, submittedByUserId: user.id, paymentReference: input().paymentReference } });
  });
  it("creates exactly one pending upgrade without switching plans", async () => {
    const subscription = await prisma.businessSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect((await requestOwnerPlanUpgrade(actor, upgrade())).success).toBe(true); expect(await requests()).toHaveLength(1);
    expect((await requests())[0]).toMatchObject({ business_id: business.id, business_subscription_id: subscriptionId, requested_by_user_id: user.id, current_plan_id: currentPlanId, target_plan_id: targetPlanId, status: "PENDING" });
    expect(await prisma.businessSubscription.findUniqueOrThrow({ where: { id: subscriptionId } })).toEqual(subscription); expect(await events()).toHaveLength(0);
  });
  it.each(["reference", "upgrade"] as const)("denies revoked OWNER role for %s", async command => { await prisma.user.update({ where: { id: user.id }, data: { role: "EMPLOYEE" } }); await denial(command); });
  it.each(["reference", "upgrade"] as const)("denies foreign owner membership for %s", async command => { await prisma.owner.update({ where: { id: ownerId }, data: { business_id: foreign.id } }); await denial(command); });
  it.each(["parent", "subscription"])("denies foreign invoice %s reference", async reference => { await prisma.subscriptionInvoice.update({ where: { id: invoiceId }, data: reference === "parent" ? { business_id: foreign.id } : { business_subscription_id: foreignSubscriptionId } }); await denial("reference"); });
  it.each(["PAID", "VOID", "FAILED", "EXPIRED"] as const)("denies %s invoice", async status => { await prisma.subscriptionInvoice.update({ where: { id: invoiceId }, data: { status } }); await denial("reference"); });
  it("supports DRAFT without settlement", async () => { await prisma.subscriptionInvoice.update({ where: { id: invoiceId }, data: { status: "DRAFT" } }); expect((await submitOwnerManualPayment(actor, input())).success).toBe(true); expect((await invoice()).status).toBe("DRAFT"); });
  it("deletes omitted optional metadata without losing unrelated keys", async () => { await prisma.subscriptionInvoice.update({ where: { id: invoiceId }, data: { metadata: { keep: "fixture", manual_payment_note: "old", manual_payment_amount_centavos: 12, manual_payment_proof_url: "old" } } }); expect((await submitOwnerManualPayment(actor, { invoiceId, paymentReference: "NEW-REFERENCE" })).success).toBe(true); expect((await invoice()).metadata).toEqual({ keep: "fixture", manual_payment_reference: "NEW-REFERENCE", manual_payment_submitted_at: now.toISOString() }); });
  it("denies duplicate reference without replacing metadata/emitting again", async () => { expect((await submitOwnerManualPayment(actor, input())).success).toBe(true); const before = await invoice(); expect((await submitOwnerManualPayment(actor, { invoiceId, paymentReference: "SECOND" })).success).toBe(false); expect(await invoice()).toEqual(before); expect(await events()).toHaveLength(1); });
  it("denies duplicate upgrade without a second pending row", async () => { expect((await requestOwnerPlanUpgrade(actor, upgrade())).success).toBe(true); expect((await requestOwnerPlanUpgrade(actor, upgrade())).success).toBe(false); expect(await requests()).toHaveLength(1); });
  it.each(["inactive", "lower", "equal"])("denies %s upgrade target", async kind => { await prisma.subscriptionPlan.update({ where: { id: targetPlanId }, data: kind === "inactive" ? { is_active: false } : { price_amount: kind === "equal" ? 1000 : 500 } }); await denial("upgrade"); });
  it.each(["reference", "upgrade"] as const)("rolls back actual %s write failure", async command => { const before = await invoice(); controls.failWrite = true; await expect(command === "reference" ? submitOwnerManualPayment(actor, input()) : requestOwnerPlanUpgrade(actor, upgrade())).rejects.toThrow(); expect(controls.writeReached).toBe(true); expect(await invoice()).toEqual(before); expect(await events()).toHaveLength(0); expect(await requests()).toHaveLength(0); });
  it("rolls back metadata and the actual outbox insert on delivery-enqueue failure", async () => { const before = await invoice(); controls.failEvent = true; await expect(submitOwnerManualPayment(actor, input())).rejects.toThrow(); expect(controls.eventReached).toBe(true); expect(await invoice()).toEqual(before); expect(await events()).toHaveLength(0); });
  it.each(["paid", "metadata"])("rejects externally changed %s invoice after read", async kind => { controls.afterInvoiceRead = async () => { controls.afterInvoiceRead = null; await prisma.subscriptionInvoice.update({ where: { id: invoiceId }, data: kind === "paid" ? { status: "PAID", amount_paid: 1000, paid_at: now } : { metadata: { otherWriter: true } } }); }; await expect(submitOwnerManualPayment(actor, input())).rejects.toThrow(); expect(await events()).toHaveLength(0); expect((await invoice()).metadata).toEqual(kind === "paid" ? { keep: "fixture" } : { otherWriter: true }); });
  it.each(["reference", "upgrade"] as const)("allows one winner from forced concurrent %s snapshots", async command => {
    let arrivals = 0; let release!: () => void; let reject!: (error: Error) => void;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const gate = new Promise<void>((resolve, fail) => { release = resolve; reject = fail; });
    const barrier = async () => {
      arrivals += 1;
      if (arrivals === 1) timer = setTimeout(() => reject(new Error(`Fixture race barrier timed out with ${arrivals} arrivals`)), 5000);
      if (arrivals === 2) { clearTimeout(timer); release(); }
      await gate;
    };
    if (command === "reference") controls.afterInvoiceRead = barrier; else controls.afterPendingRead = barrier;
    let outcomes: PromiseSettledResult<unknown>[];
    try { outcomes = await Promise.allSettled(command === "reference" ? [submitOwnerManualPayment(actor, input()), submitOwnerManualPayment(actor, input())] : [requestOwnerPlanUpgrade(actor, upgrade()), requestOwnerPlanUpgrade(actor, upgrade())]); } finally { controls.afterInvoiceRead = null; controls.afterPendingRead = null; clearTimeout(timer); release(); }
    expect(arrivals).toBe(2); expect(outcomes.filter(result => result.status === "fulfilled" && (result.value as { success: boolean }).success)).toHaveLength(1);
    const losers = outcomes.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(losers).toHaveLength(1);
    const conflict: unknown = losers[0].reason;
    if (typeof conflict === "object" && conflict !== null && "code" in conflict && conflict.code === "P2034") {
      expect(conflict).toMatchObject({ code: "P2034" });
    } else {
      expect(conflict).toMatchObject({ name: "DriverAdapterError", cause: { kind: "TransactionWriteConflict", originalCode: "40001" } });
    }
    expect(command === "reference" ? await events() : await requests()).toHaveLength(1);
  });
});
