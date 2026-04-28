"use server";

import { prisma } from "@/prisma/prisma";
import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";

const NOTIFICATION_EVENT_TYPES = [
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "PAYMENT_CONFIRMED",
  "REMINDER_DUE",
  "FLOW_REMINDER_SENT",
  "RE_ENGAGEMENT_REMINDER_SENT",
  "PAYSLIP_GENERATED",
] as const;

type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

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

function extractContactFromPayload(
  payload: unknown,
): { customerName: string | null; customerEmail: string | null; customerPhone: string | null } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { customerName: null, customerEmail: null, customerPhone: null };
  }
  const p = payload as Record<string, unknown>;
  const getString = (key: string) =>
    typeof p[key] === "string" && (p[key] as string).length > 0 ? (p[key] as string) : null;

  return {
    customerName: getString("customerName") ?? getString("employeeName"),
    customerEmail: getString("customerEmail") ?? getString("email") ?? getString("employeeEmail"),
    customerPhone: getString("customerPhone"),
  };
}

function extractChannelsFromPayload(payload: unknown): { smsSent: boolean | null; emailSent: boolean | null } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { smsSent: null, emailSent: null };
  }
  const p = payload as Record<string, unknown>;
  return {
    smsSent: typeof p.smsSent === "boolean" ? p.smsSent : null,
    emailSent: typeof p.emailSent === "boolean" ? p.emailSent : null,
  };
}

function buildSubject(eventType: string, payload: unknown): string {
  const p = (payload && typeof payload === "object" && !Array.isArray(payload))
    ? (payload as Record<string, unknown>)
    : {};

  switch (eventType) {
    case "BOOKING_CONFIRMED":
      return "Booking confirmation";
    case "BOOKING_CANCELLED":
      return "Booking cancellation";
    case "PAYMENT_CONFIRMED":
      return "Payment receipt";
    case "REMINDER_DUE":
      return "Appointment reminder";
    case "FLOW_REMINDER_SENT": {
      const next = typeof p.suggestedServiceName === "string" ? p.suggestedServiceName : "";
      return next ? `Follow-up: ${next}` : "Service follow-up reminder";
    }
    case "RE_ENGAGEMENT_REMINDER_SENT":
      return "We miss you – re-engagement";
    case "PAYSLIP_GENERATED":
      return "Payslip ready";
    default:
      return eventType.replaceAll("_", " ").toLowerCase();
  }
}

export async function getNotificationHistoryAction(
  businessSlug: string,
  options: { page?: number; eventType?: string } = {},
) {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) {
    return { success: false as const, error: "Unauthorized" };
  }

  const page = Math.max(1, options.page ?? 1);
  const pageSize = 50;
  const skip = (page - 1) * pageSize;

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true },
  });
  if (!business) {
    return { success: false as const, error: "Business not found" };
  }

  const whereClause = {
    business_id: business.id,
    event_type: options.eventType
      ? options.eventType
      : { in: NOTIFICATION_EVENT_TYPES as unknown as string[] },
    processed: true,
  };

  const [records, totalCount] = await Promise.all([
    prisma.outboxMessage.findMany({
      where: whereClause,
      orderBy: { created_at: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        event_type: true,
        payload: true,
        processed: true,
        processed_at: true,
        last_error: true,
        created_at: true,
      },
    }),
    prisma.outboxMessage.count({ where: whereClause }),
  ]);

  const notifications: NotificationRecord[] = records.map((r) => {
    const contact = extractContactFromPayload(r.payload);
    const channels = extractChannelsFromPayload(r.payload);
    const isFailed = typeof r.last_error === "string" && r.last_error.length > 0;

    return {
      id: r.id,
      eventType: r.event_type as NotificationEventType,
      customerName: contact.customerName,
      customerEmail: contact.customerEmail,
      customerPhone: contact.customerPhone,
      subject: buildSubject(r.event_type, r.payload),
      sentAt: r.processed_at ?? r.created_at,
      success: !isFailed,
      failureReason: isFailed ? r.last_error : null,
      smsSent: channels.smsSent,
      emailSent: channels.emailSent,
    };
  });

  return {
    success: true as const,
    notifications,
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}
