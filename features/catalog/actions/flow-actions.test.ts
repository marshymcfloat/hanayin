import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerPendingFlows } from "./flow-actions";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), customer: vi.fn(), history: vi.fn(), completed: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/prisma/prisma", () => ({ prisma: { customer: { findFirst: mocks.customer }, availedService: { findMany: mocks.history, findFirst: mocks.completed } } }));

const date = new Date("2026-01-10T00:00:00Z");
const flow = { trigger_service_id: 1, suggested_service_id: 2, type: "SUGGESTED", delay_duration: 2, delay_unit: "DAYS", suggested_service: { name: "Follow-up", price: 100, duration: 30 } };
const visit = { served_at: date, created_at: date, service: { name: "Initial", flow_triggers: [flow] } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "staff" } } });
  mocks.actor.mockResolvedValue({ success: true, businessId: "biz", actorType: "EMPLOYEE" });
  mocks.customer.mockResolvedValue({ id: "customer" });
  mocks.history.mockResolvedValue([visit]);
  mocks.completed.mockResolvedValue(null);
});

describe("customer follow-up history security", () => {
  it("denies public access before customer/history reads", async () => {
    mocks.auth.mockResolvedValue({ success: false });
    expect(await getCustomerPendingFlows("customer")).toEqual([]);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("denies missing current membership", async () => {
    mocks.actor.mockResolvedValue({ success: false });
    expect(await getCustomerPendingFlows("customer")).toEqual([]);
    expect(mocks.customer).not.toHaveBeenCalled();
  });

  it.each(["", " ", "x".repeat(201)])("rejects malformed customer ID before authentication", async (id) => {
    expect(await getCustomerPendingFlows(id)).toEqual([]);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("denies foreign/missing customers before history queries", async () => {
    mocks.customer.mockResolvedValue(null);
    expect(await getCustomerPendingFlows("foreign")).toEqual([]);
    expect(mocks.customer).toHaveBeenCalledWith({ where: { id: "foreign", business_id: "biz" }, select: { id: true } });
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("scopes history, flow definitions and completion checks to verified tenant", async () => {
    expect(await getCustomerPendingFlows("customer")).toMatchObject([{ suggestedServiceId: 2, dueDate: new Date("2026-01-12"), lastServiceDate: date }]);
    expect(mocks.actor).toHaveBeenCalledWith("tenant", "staff");
    expect(mocks.history).toHaveBeenCalledWith(expect.objectContaining({
      where: { service: { business_id: "biz" }, booking: { business_id: "biz", customer_id: "customer", status: { not: "CANCELLED" } } },
      take: 5,
      orderBy: { created_at: "desc" },
      include: { service: { include: { flow_triggers: { where: { business_id: "biz", suggested_service: { business_id: "biz" } }, include: { suggested_service: true } } } } },
    }));
    expect(mocks.completed).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ service: { business_id: "biz" }, booking: { business_id: "biz", customer_id: "customer", status: { not: "CANCELLED" } } }) }));
  });

  it.each([["WEEKS", "2026-01-24"], ["MONTHS", "2026-03-10"]])("preserves %s delay calculation", async (unit, expected) => {
    mocks.history.mockResolvedValue([{ ...visit, service: { ...visit.service, flow_triggers: [{ ...flow, delay_unit: unit }] } }]);
    expect(await getCustomerPendingFlows("customer")).toMatchObject([{ dueDate: new Date(expected) }]);
  });

  it("keeps the latest unique suggestion and omits fulfilled suggestions", async () => {
    mocks.history.mockResolvedValue([visit, { ...visit, served_at: new Date("2025-12-01") }]);
    expect(await getCustomerPendingFlows("customer")).toHaveLength(1);
    mocks.completed.mockResolvedValue({ id: 9 });
    expect(await getCustomerPendingFlows("customer")).toEqual([]);
  });

  it("maps auth/storage failures to an empty safe response", async () => {
    mocks.auth.mockRejectedValue(new Error("internal test failure"));
    expect(await getCustomerPendingFlows("customer")).toEqual([]);
  });
});
