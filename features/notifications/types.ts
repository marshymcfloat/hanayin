export const NOTIFICATION_EVENT_TYPES = [
  "BOOKING_CONFIRMED", "BOOKING_CANCELLED", "PAYMENT_CONFIRMED", "REMINDER_DUE",
  "FLOW_REMINDER_SENT", "RE_ENGAGEMENT_REMINDER_SENT", "PAYSLIP_GENERATED", "PAYROLL_PUBLISHED",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
export type NotificationHistoryOptions = { page: number; eventType?: NotificationEventType };
export type NotificationRecord = {
  id: string;
  eventType: NotificationEventType;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  subject: string;
  sentAt: Date;
  success: boolean;
  failureReason: string | null;
  smsSent: boolean | null;
  emailSent: boolean | null;
};

export type SerializedNotificationRecord = Omit<NotificationRecord, "sentAt"> & { sentAt: string };
export type NotificationHistoryResponse = {
  notifications: SerializedNotificationRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
