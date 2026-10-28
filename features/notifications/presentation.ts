import type { NotificationEventType, SerializedNotificationRecord } from "@/features/notifications/types";

export const eventFilters = ["All events", "Bookings", "Payments", "Reminders", "Payslips"] as const;
export const outcomeFilters = ["All outcomes", "Delivered", "Partial delivery", "Failed", "Untracked"] as const;
export type EventFilter = typeof eventFilters[number];
export type OutcomeFilter = typeof outcomeFilters[number];
export type Notification = SerializedNotificationRecord;

export const eventLabels: Record<NotificationEventType, string> = {
  BOOKING_CONFIRMED: "Booking confirmed",
  BOOKING_CANCELLED: "Booking cancelled",
  PAYMENT_CONFIRMED: "Payment receipt",
  REMINDER_DUE: "Appointment reminder",
  FLOW_REMINDER_SENT: "Service follow-up",
  RE_ENGAGEMENT_REMINDER_SENT: "Re-engagement",
  PAYSLIP_GENERATED: "Payslip",
  PAYROLL_PUBLISHED: "Payslip published",
};
export const eventGroups: Record<NotificationEventType, EventFilter> = {
  BOOKING_CONFIRMED: "Bookings",
  BOOKING_CANCELLED: "Bookings",
  PAYMENT_CONFIRMED: "Payments",
  REMINDER_DUE: "Reminders",
  FLOW_REMINDER_SENT: "Reminders",
  RE_ENGAGEMENT_REMINDER_SENT: "Reminders",
  PAYSLIP_GENERATED: "Payslips",
  PAYROLL_PUBLISHED: "Payslips",
};
export const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit",
});

export function recipient(notification: Notification) {
  return notification.customerName ?? notification.customerEmail ?? notification.customerPhone ?? "Recipient unavailable";
}

export function deliveryOutcome(notification: Notification): Exclude<OutcomeFilter, "All outcomes"> {
  const recorded = [notification.smsSent, notification.emailSent].filter((result): result is boolean => result !== null);
  if (!notification.success) return "Failed";
  if (recorded.length === 0) return "Untracked";
  if (recorded.every(Boolean)) return "Delivered";
  return recorded.some(Boolean) ? "Partial delivery" : "Failed";
}

export function outcomeTone(outcome: OutcomeFilter): "positive" | "warning" | "negative" | "neutral" {
  return outcome === "Delivered" ? "positive" : outcome === "Partial delivery" ? "warning" : outcome === "Failed" ? "negative" : "neutral";
}
