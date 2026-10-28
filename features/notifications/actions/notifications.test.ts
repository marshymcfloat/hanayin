import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNotificationHistoryAction } from "./notifications";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), business: vi.fn(), list: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireOwnerTenantWriteAccess: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.business }, outboxMessage: { findMany: mocks.list, count: mocks.count } } }));

const sentAt = new Date("2026-09-16T01:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "owner" } } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", businessId: "verified-business", userId: "owner" });
  mocks.business.mockResolvedValue({ id: "verified-business" });
  mocks.list.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});

describe("notification history boundary", () => {
  it.each(["Unauthorized", "Forbidden", "Subscription read-only"])("denies %s before notification persistence", async error => {
    mocks.auth.mockResolvedValue({ success: false, error });
    expect(await getNotificationHistoryAction("tenant")).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("preserves scoped pagination, empty results and notification-only defaults", async () => {
    expect(await getNotificationHistoryAction("tenant", { page: 2 })).toEqual({ success: true, notifications: [], totalCount: 0, page: 2, pageSize: 50, totalPages: 0 });
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      where: { business_id: "verified-business", processed: true, event_type: { in: ["BOOKING_CONFIRMED", "BOOKING_CANCELLED", "PAYMENT_CONFIRMED", "REMINDER_DUE", "FLOW_REMINDER_SENT", "RE_ENGAGEMENT_REMINDER_SENT", "PAYSLIP_GENERATED"] } },
      skip: 50, take: 50, orderBy: { created_at: "desc" },
    }));
    expect(mocks.count).toHaveBeenCalledWith({ where: mocks.list.mock.calls[0][0].where });
    expect(mocks.actor).toHaveBeenCalledWith("tenant", "owner");
    expect(mocks.business).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Infinity, 10001])("rejects invalid page %s before authorization or persistence", async page => {
    expect(await getNotificationHistoryAction("tenant", { page })).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("rejects empty tenant slug", async slug => {
    expect(await getNotificationHistoryAction(slug)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("rejects non-notification outbox filters before persistence", async () => {
    expect(await getNotificationHistoryAction("tenant", { eventType: "INTERNAL_ADMIN_EVENT" })).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("treats the empty event filter as All", async () => {
    const result = await getNotificationHistoryAction("tenant", { eventType: "" });
    expect(result.success).toBe(true);
    expect(mocks.list.mock.calls[0][0].where.event_type.in).toHaveLength(7);
  });

  it.each([{ success: false, error: "Unauthorized" }, { success: true, actorType: "EMPLOYEE", businessId: "foreign" }])("rejects stale or non-owner membership", async context => {
    mocks.actor.mockResolvedValue(context);
    expect(await getNotificationHistoryAction("tenant")).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it.each(["auth", "actor", "list", "count"] as const)("returns safe errors for %s failures", async target => {
    mocks[target].mockRejectedValue(new Error("private storage/credential failure"));
    expect(await getNotificationHistoryAction("tenant")).toEqual({ success: false, error: "Unable to load notification history." });
    if (target === "auth" || target === "actor") expect(mocks.list).not.toHaveBeenCalled();
  });

  it("preserves contact fallbacks, channel booleans, subject and processed date", async () => {
    mocks.list.mockResolvedValue([{ id: "notice", event_type: "PAYSLIP_GENERATED", payload: { employeeName: "Fixture employee", employeeEmail: "fixture@example.test", smsSent: false, emailSent: true, internalValue: "not public" }, processed_at: sentAt, created_at: new Date(0), last_error: null }]);
    mocks.count.mockResolvedValue(51);
    expect(await getNotificationHistoryAction("tenant", { eventType: "PAYSLIP_GENERATED" })).toEqual({ success: true, notifications: [{ id: "notice", eventType: "PAYSLIP_GENERATED", customerName: "Fixture employee", customerEmail: "fixture@example.test", customerPhone: null, subject: "Payslip ready", sentAt, success: true, failureReason: null, smsSent: null, emailSent: true }], totalCount: 51, page: 1, pageSize: 50, totalPages: 2 });
  });
});
