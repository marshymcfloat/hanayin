import "server-only";

import type { TenantActorContext } from "@/lib/auth/staff-access";
import { prisma } from "@/prisma/prisma";
import { NOTIFICATION_EVENT_TYPES, type NotificationEventType, type NotificationHistoryOptions, type NotificationRecord } from "@/features/notifications/types";

type OwnerContext = Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;

function payloadObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown> : {};
}

function contactString(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function subject(eventType: NotificationEventType, payload: Record<string, unknown>): string {
  switch (eventType) {
    case "BOOKING_CONFIRMED": return "Booking confirmation";
    case "BOOKING_CANCELLED": return "Booking cancellation";
    case "PAYMENT_CONFIRMED": return "Payment receipt";
    case "REMINDER_DUE": return "Appointment reminder";
    case "FLOW_REMINDER_SENT": {
      const next = typeof payload.suggestedServiceName === "string" ? payload.suggestedServiceName : "";
      return next ? `Follow-up: ${next}` : "Service follow-up reminder";
    }
    case "RE_ENGAGEMENT_REMINDER_SENT": return "We miss you – re-engagement";
    case "PAYSLIP_GENERATED": return "Payslip ready";
    case "PAYROLL_PUBLISHED": return "Payslip published; SMS acceptance tracked separately";
  }
}

export async function getOwnerNotificationHistory(context: OwnerContext, options: NotificationHistoryOptions) {
  if (context.actorType !== "OWNER") throw new Error("Forbidden");
  const pageSize = 50;
  const where = {
    business_id: context.businessId,
    processed: true,
    event_type: options.eventType ?? { in: [...NOTIFICATION_EVENT_TYPES] },
  };
  const [records, totalCount] = await Promise.all([
    prisma.outboxMessage.findMany({
      where, orderBy: { created_at: "desc" }, skip: (options.page - 1) * pageSize, take: pageSize,
      select: { id: true, event_type: true, payload: true, processed_at: true, last_error: true, created_at: true },
    }),
    prisma.outboxMessage.count({ where }),
  ]);
  const notifications: NotificationRecord[] = records.map(record => {
    const payload = payloadObject(record.payload);
    const failed = typeof record.last_error === "string" && record.last_error.length > 0;
    const eventType = record.event_type as NotificationEventType;
    const customerEmail = contactString(payload, "customerEmail", "email", "employeeEmail");
    const customerPhone = contactString(payload, "customerPhone");
    return {
      id: record.id, eventType,
      customerName: contactString(payload, "customerName", "employeeName"),
      customerEmail,
      customerPhone,
      subject: subject(eventType, payload), sentAt: record.processed_at ?? record.created_at,
      success: !failed, failureReason: failed ? "Notification delivery failed." : null,
      smsSent: customerPhone && typeof payload.smsSent === "boolean" ? payload.smsSent : null,
      emailSent: customerEmail && typeof payload.emailSent === "boolean" ? payload.emailSent : null,
    };
  });
  return { success: true as const, notifications, totalCount, page: options.page, pageSize, totalPages: Math.ceil(totalCount / pageSize) };
}
