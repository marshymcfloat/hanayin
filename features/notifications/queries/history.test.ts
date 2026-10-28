import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessStructure, Role } from "@/prisma/generated/prisma/enums";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import { getOwnerNotificationHistory } from "./history";
import { NOTIFICATION_EVENT_TYPES } from "@/features/notifications/types";

const mocks = vi.hoisted(() => ({ list: vi.fn(), count: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { outboxMessage: { findMany: mocks.list, count: mocks.count } } }));

const context: Extract<TenantActorContext, { success: true; actorType: "OWNER" }> = {
  success: true, actorType: "OWNER", businessId: "verified-business", businessSlug: "tenant", userId: "owner", ownerId: 1, role: Role.OWNER,
  businessPolicy: { structure: BusinessStructure.OWNER_EMPLOYEE_SELF_SERVICE, allowEmployeeSelfBooking: false, managerCanServe: false },
  profile: null, permissions: [], employeeId: null,
};
const createdAt = new Date("2026-09-16T01:00:00Z");
const record = { id: "fixture", event_type: "BOOKING_CONFIRMED", payload: null, created_at: createdAt, processed_at: null, last_error: null };

beforeEach(() => { vi.resetAllMocks(); mocks.list.mockResolvedValue([]); mocks.count.mockResolvedValue(0); });

describe("owner notification history query", () => {
  it("scopes both reads to verified identity and selects only mapping inputs", async () => {
    await getOwnerNotificationHistory(context, { page: 3, eventType: "REMINDER_DUE" });
    expect(mocks.list).toHaveBeenCalledWith({ where: { business_id: "verified-business", processed: true, event_type: "REMINDER_DUE" }, orderBy: { created_at: "desc" }, skip: 100, take: 50, select: { id: true, event_type: true, payload: true, processed_at: true, last_error: true, created_at: true } });
    expect(mocks.count).toHaveBeenCalledWith({ where: { business_id: "verified-business", processed: true, event_type: "REMINDER_DUE" } });
  });

  it.each([null, [], "malformed", 1, { customerName: 1, customerEmail: "", smsSent: "true", emailSent: 0 }])("handles malformed payloads without raw data leakage", async payload => {
    mocks.list.mockResolvedValue([{ ...record, payload }]);
    const { notifications } = await getOwnerNotificationHistory(context, { page: 1 });
    expect(notifications[0]).toEqual({ id: "fixture", eventType: "BOOKING_CONFIRMED", customerName: null, customerEmail: null, customerPhone: null, subject: "Booking confirmation", sentAt: createdAt, success: true, failureReason: null, smsSent: null, emailSent: null });
  });

  it("redacts stored internal delivery errors while preserving failed state", async () => {
    mocks.list.mockResolvedValue([{ ...record, last_error: "private SQL / provider secret", payload: { customerName: "Fixture", customerEmail: "fixture@example.test", customerPhone: "fixture-phone", smsSent: true, emailSent: false, secret: "private" } }]);
    const result = await getOwnerNotificationHistory(context, { page: 1 });
    expect(result.notifications[0]).toMatchObject({ customerName: "Fixture", customerEmail: "fixture@example.test", customerPhone: "fixture-phone", smsSent: true, emailSent: false, success: false, failureReason: "Notification delivery failed." });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.notifications[0]).not.toHaveProperty("payload");
    expect(result.notifications[0]).not.toHaveProperty("last_error");
  });

  it("does not treat a false send flag without a contact as an attempted channel", async () => {
    mocks.list.mockResolvedValue([{ ...record, payload: { customerName: "Fixture", customerEmail: "fixture@example.test", smsSent: false, emailSent: true } }]);
    const result = await getOwnerNotificationHistory(context, { page: 1 });
    expect(result.notifications[0]).toMatchObject({ smsSent: null, emailSent: true });
  });

  it.each(NOTIFICATION_EVENT_TYPES)("preserves subject mapping for %s", async eventType => {
    mocks.list.mockResolvedValue([{ ...record, event_type: eventType }]);
    const labels = ["Booking confirmation", "Booking cancellation", "Payment receipt", "Appointment reminder", "Service follow-up reminder", "We miss you – re-engagement", "Payslip ready"];
    const result = await getOwnerNotificationHistory(context, { page: 1 });
    expect(result.notifications[0].subject).toBe(labels[NOTIFICATION_EVENT_TYPES.indexOf(eventType)]);
  });

  it("preserves the suggested service subject and primary contact precedence", async () => {
    mocks.list.mockResolvedValue([{ ...record, event_type: "FLOW_REMINDER_SENT", last_error: "", payload: { suggestedServiceName: "Fixture service", customerName: "Customer", employeeName: "Employee", customerEmail: "customer@example.test", email: "fallback@example.test" } }]);
    const result = await getOwnerNotificationHistory(context, { page: 1 });
    expect(result.notifications[0]).toMatchObject({ subject: "Follow-up: Fixture service", customerName: "Customer", customerEmail: "customer@example.test", success: true, failureReason: null });
  });

  it("denies a non-owner capability before reads", async () => {
    const invalid = { ...context, actorType: "EMPLOYEE" } as unknown as typeof context;
    await expect(getOwnerNotificationHistory(invalid, { page: 1 })).rejects.toThrow("Forbidden");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });
});
