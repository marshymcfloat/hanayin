import { Prisma } from "@/prisma/generated/prisma/client";

export const OUTBOX_EVENT_TYPES = [
  "BOOKING_CREATED",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "BOOKING_STAFFING_CONFLICT_DETECTED",
  "BOOKING_SERVICE_REMOVED",
  "PAYMENT_CONFIRMED",
  "REMINDER_DUE",
  "PAYSLIP_GENERATED",
  "FLOW_REMINDER_SENT",
  "RE_ENGAGEMENT_REMINDER_SENT",
  "MANUAL_PAYMENT_SUBMITTED",
  "SOCIAL_TARGET_PUBLISH",
] as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];

export function isOutboxEventType(value: string): value is OutboxEventType {
  return OUTBOX_EVENT_TYPES.includes(value as OutboxEventType);
}

export type OutboxPayloadMap = {
  BOOKING_CREATED: {
    bookingId: number;
    customerName?: string | null;
    email?: string | null;
    scheduledAt?: string;
    estimatedEnd?: string;
    grandTotal?: number;
    status: string;
    isWalkIn?: boolean;
  };
  BOOKING_CONFIRMED: {
    bookingId: number;
    customerName?: string | null;
    email?: string | null;
    scheduledAt?: string;
    estimatedEnd?: string;
    grandTotal?: number;
    status: string;
    isWalkIn?: boolean;
  };
  BOOKING_CANCELLED: {
    bookingId: number;
    reason: string;
    status: string;
    email?: string | null;
    customerName?: string | null;
  };
  BOOKING_STAFFING_CONFLICT_DETECTED: {
    bookingId: number;
    scheduledAt: string;
    reason: string;
    trigger: string;
    detectedAt: string;
    customerName?: string | null;
  };
  BOOKING_SERVICE_REMOVED: {
    bookingId: number;
    availedServiceId: number;
    serviceName: string;
    refundAmount: number;
    newGrandTotal: number;
    actorUserId: string;
    customerName?: string | null;
    email?: string | null;
  };
  PAYMENT_CONFIRMED: {
    bookingId: number;
    email: string;
    amount: number;
    currency?: string;
    paymentId?: string;
  };
  REMINDER_DUE: {
    bookingId: number;
    email: string;
    customerName: string;
    scheduledAt: string;
  };
  PAYSLIP_GENERATED: {
    payslipId: number;
    employeeEmail: string;
    employeeName?: string;
    period?: string;
    totalSalary?: number;
  };
  FLOW_REMINDER_SENT: {
    customerId: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone?: string | null;
    triggerServiceName: string;
    suggestedServiceName: string;
    flowType: string;
    sentAt: string;
    smsSent?: boolean;
    emailSent?: boolean;
  };
  RE_ENGAGEMENT_REMINDER_SENT: {
    customerId: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone?: string | null;
    lastCompletedBookingId?: number | null;
    lastCompletedBookingAt: string;
    sentAt: string;
    smsSent?: boolean;
    emailSent?: boolean;
  };
  MANUAL_PAYMENT_SUBMITTED: {
    invoiceId: string;
    businessId: string;
    businessSlug: string;
    submittedByUserId: string;
    paymentReference: string;
    amountCentavos?: number;
    note?: string;
    proofUrl?: string;
    submittedAt: string;
  };
  SOCIAL_TARGET_PUBLISH: {
    socialPostTargetId: string;
    businessId: string;
  };
};

export interface OutboxEvent<TType extends OutboxEventType = OutboxEventType> {
  type: TType;
  aggregateType: string;
  aggregateId: string;
  businessId: string;
  payload: OutboxPayloadMap[TType];
}

/**
 * Publishes an event to the outbox within the same transaction.
 * This ensures the event is recorded if and only if the transaction commits.
 *
 * @example
 * await prisma.$transaction(async (tx) => {
 *   const booking = await tx.booking.create({ ... });
 *   await publishEvent(tx, {
 *     type: 'BOOKING_CREATED',
 *     aggregateType: 'Booking',
 *     aggregateId: String(booking.id),
 *     businessId: business.id,
 *     payload: { customerName, email, scheduledAt }
 *   });
 * });
 */
export async function publishEvent(
  tx: Prisma.TransactionClient,
  event: OutboxEvent,
) {
  return tx.outboxMessage.create({
    data: {
      event_type: event.type,
      aggregate_type: event.aggregateType,
      aggregate_id: event.aggregateId,
      business_id: event.businessId,
      payload: event.payload as Prisma.JsonObject,
    },
  });
}

/**
 * Publishes multiple events to the outbox within the same transaction.
 */
export async function publishEvents(
  tx: Prisma.TransactionClient,
  events: OutboxEvent[],
) {
  return Promise.all(events.map((event) => publishEvent(tx, event)));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  payload: Record<string, unknown>,
  key: string,
  eventType: OutboxEventType,
) {
  const value = payload[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`[Outbox:${eventType}] Missing required string field "${key}"`);
  }
  return value;
}

function optionalString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireNumber(
  payload: Record<string, unknown>,
  key: string,
  eventType: OutboxEventType,
) {
  const value = payload[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`[Outbox:${eventType}] Missing required numeric field "${key}"`);
  }
  return value;
}

function optionalNumber(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return value;
}

function parseBookingCancellationPayload(
  payload: Record<string, unknown>,
): OutboxPayloadMap["BOOKING_CANCELLED"] {
  return {
    bookingId: requireNumber(payload, "bookingId", "BOOKING_CANCELLED"),
    reason: requireString(payload, "reason", "BOOKING_CANCELLED"),
    status: requireString(payload, "status", "BOOKING_CANCELLED"),
    email: optionalString(payload, "email"),
    customerName: optionalString(payload, "customerName"),
  };
}

export function parseOutboxPayload<TType extends OutboxEventType>(
  eventType: TType,
  rawPayload: unknown,
): OutboxPayloadMap[TType] {
  if (!isObjectRecord(rawPayload)) {
    throw new Error(`[Outbox:${eventType}] Payload must be an object`);
  }

  const payload = rawPayload;

  switch (eventType) {
    case "BOOKING_CREATED":
    case "BOOKING_CONFIRMED":
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        customerName: optionalString(payload, "customerName"),
        email: optionalString(payload, "email"),
        scheduledAt: optionalString(payload, "scheduledAt"),
        estimatedEnd: optionalString(payload, "estimatedEnd"),
        grandTotal: optionalNumber(payload, "grandTotal"),
        status: requireString(payload, "status", eventType),
      } as OutboxPayloadMap[TType];
    case "BOOKING_CANCELLED":
      return parseBookingCancellationPayload(payload) as OutboxPayloadMap[TType];
    case "BOOKING_STAFFING_CONFLICT_DETECTED":
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        scheduledAt: requireString(payload, "scheduledAt", eventType),
        reason: requireString(payload, "reason", eventType),
        trigger: requireString(payload, "trigger", eventType),
        detectedAt: requireString(payload, "detectedAt", eventType),
        customerName: optionalString(payload, "customerName"),
      } as OutboxPayloadMap[TType];
    case "BOOKING_SERVICE_REMOVED":
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        availedServiceId: requireNumber(payload, "availedServiceId", eventType),
        serviceName: requireString(payload, "serviceName", eventType),
        refundAmount: requireNumber(payload, "refundAmount", eventType),
        newGrandTotal: requireNumber(payload, "newGrandTotal", eventType),
        actorUserId: requireString(payload, "actorUserId", eventType),
        customerName: optionalString(payload, "customerName"),
        email: optionalString(payload, "email"),
      } as OutboxPayloadMap[TType];
    case "PAYMENT_CONFIRMED":
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        email: requireString(payload, "email", eventType),
        amount: requireNumber(payload, "amount", eventType),
        currency: optionalString(payload, "currency"),
        paymentId: optionalString(payload, "paymentId"),
      } as OutboxPayloadMap[TType];
    case "REMINDER_DUE":
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        email: requireString(payload, "email", eventType),
        customerName: requireString(payload, "customerName", eventType),
        scheduledAt: requireString(payload, "scheduledAt", eventType),
      } as OutboxPayloadMap[TType];
    case "PAYSLIP_GENERATED":
      return {
        payslipId: requireNumber(payload, "payslipId", eventType),
        employeeEmail: requireString(payload, "employeeEmail", eventType),
        employeeName: optionalString(payload, "employeeName"),
        period: optionalString(payload, "period"),
        totalSalary: optionalNumber(payload, "totalSalary"),
      } as OutboxPayloadMap[TType];
    case "FLOW_REMINDER_SENT":
      return {
        customerId: requireString(payload, "customerId", eventType),
        customerName: requireString(payload, "customerName", eventType),
        customerEmail: optionalString(payload, "customerEmail") ?? null,
        customerPhone: optionalString(payload, "customerPhone") ?? null,
        triggerServiceName: requireString(payload, "triggerServiceName", eventType),
        suggestedServiceName: requireString(payload, "suggestedServiceName", eventType),
        flowType: requireString(payload, "flowType", eventType),
        sentAt: requireString(payload, "sentAt", eventType),
        smsSent: typeof payload.smsSent === "boolean" ? payload.smsSent : undefined,
        emailSent: typeof payload.emailSent === "boolean" ? payload.emailSent : undefined,
      } as OutboxPayloadMap[TType];
    case "RE_ENGAGEMENT_REMINDER_SENT":
      return {
        customerId: requireString(payload, "customerId", eventType),
        customerName: requireString(payload, "customerName", eventType),
        customerEmail: optionalString(payload, "customerEmail") ?? null,
        customerPhone: optionalString(payload, "customerPhone") ?? null,
        lastCompletedBookingId: optionalNumber(payload, "lastCompletedBookingId") ?? null,
        lastCompletedBookingAt: requireString(payload, "lastCompletedBookingAt", eventType),
        sentAt: requireString(payload, "sentAt", eventType),
        smsSent: typeof payload.smsSent === "boolean" ? payload.smsSent : undefined,
        emailSent: typeof payload.emailSent === "boolean" ? payload.emailSent : undefined,
      } as OutboxPayloadMap[TType];
    case "MANUAL_PAYMENT_SUBMITTED":
      return {
        invoiceId: requireString(payload, "invoiceId", eventType),
        businessId: requireString(payload, "businessId", eventType),
        businessSlug: requireString(payload, "businessSlug", eventType),
        submittedByUserId: requireString(payload, "submittedByUserId", eventType),
        paymentReference: requireString(payload, "paymentReference", eventType),
        amountCentavos: optionalNumber(payload, "amountCentavos"),
        note: optionalString(payload, "note"),
        proofUrl: optionalString(payload, "proofUrl"),
        submittedAt: requireString(payload, "submittedAt", eventType),
      } as OutboxPayloadMap[TType];
    case "SOCIAL_TARGET_PUBLISH":
      return {
        socialPostTargetId: requireString(payload, "socialPostTargetId", eventType),
        businessId: requireString(payload, "businessId", eventType),
      } as OutboxPayloadMap[TType];
    default:
      throw new Error(`[Outbox:${eventType}] Unsupported event type`);
  }
}
