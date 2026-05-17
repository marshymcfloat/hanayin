import { Prisma } from "@/prisma/generated/prisma/client";

export const OUTBOX_EVENT_TYPES = [
  "BOOKING_CREATED",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "BOOKING_CANCELLED_BY_CUSTOMER",
  "BOOKING_STAFFING_CONFLICT_DETECTED",
  "BOOKING_SERVICE_REMOVED",
  "BOOKING_SERVICE_SWAPPED",
  "BOOKING_RESCHEDULED",
  "BOOKING_RESCHEDULED_BY_CUSTOMER",
  "BOOKING_STAFF_REASSIGNED",
  "BOOKING_PRICE_ADJUSTED",
  "BOOKING_NOTE_ADDED",
  "PAYMENT_CONFIRMED",
  "REMINDER_DUE",
  "PAYSLIP_GENERATED",
  "FLOW_REMINDER_SENT",
  "RE_ENGAGEMENT_REMINDER_SENT",
  "MANUAL_PAYMENT_SUBMITTED",
  "SOCIAL_TARGET_PUBLISH",
  "SOCIAL_POST_REQUEST_SUBMITTED",
  "SOCIAL_POST_REQUEST_APPROVED",
  "SOCIAL_POST_REQUEST_REJECTED",
  "SOCIAL_POST_REQUEST_PUBLISHED",
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
    /**
     * Set when a tenant user actively cancelled the booking (the new
     * cancelBookingAction). Left unset for system-initiated
     * cancellations (e.g. expired holds, payment failures), so
     * downstream handlers can branch their messaging. Backward-
     * compatible — older callers don't pass it.
     */
    actorUserId?: string | null;
    /** Optional phone for SMS cancel notifications. */
    phone?: string | null;
  };
  /**
   * Customer self-serve cancellation via the tokenized manage page.
   * Distinct from BOOKING_CANCELLED so downstream handlers can branch
   * messaging — staff usually want a quieter "FYI" notification when
   * the customer cancelled themselves vs. when staff initiated it.
   */
  BOOKING_CANCELLED_BY_CUSTOMER: {
    bookingId: number;
    scheduledAt: string | null;
    reason: string | null;
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
  BOOKING_SERVICE_SWAPPED: {
    bookingId: number;
    removedAvailedServiceId: number;
    removedServiceName: string;
    addedServiceId: number;
    addedServiceName: string;
    priceDelta: number;
    newGrandTotal: number;
    actorUserId: string;
    customerName?: string | null;
    email?: string | null;
  };
  BOOKING_RESCHEDULED: {
    bookingId: number;
    oldScheduledAt: string;
    newScheduledAt: string;
    oldEstimatedEnd?: string;
    newEstimatedEnd?: string;
    actorUserId: string;
    customerName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  /**
   * Customer self-serve reschedule via the tokenized manage page.
   * Distinct from BOOKING_RESCHEDULED so downstream handlers can branch
   * messaging — staff want different copy for "your customer changed
   * their time" vs. "you moved a booking".
   */
  BOOKING_RESCHEDULED_BY_CUSTOMER: {
    bookingId: number;
    previousScheduledAt: string | null;
    newScheduledAt: string;
  };
  /**
   * Internal-only event (per docs/role-permissions-matrix.md §3 the staff
   * reassign has no customer-visible side effect). Used for manager dashboard
   * activity feeds and audit visibility, not for customer messaging.
   */
  BOOKING_STAFF_REASSIGNED: {
    bookingId: number;
    availedServiceId: number;
    serviceName: string;
    oldEmployeeId?: number | null;
    oldOwnerId?: number | null;
    oldStaffName?: string | null;
    newEmployeeId: number;
    newStaffName: string;
    actorUserId: string;
  };
  /**
   * Customer-visible event (per matrix: updated receipt is the side
   * effect). The delivery handler can email/SMS a corrected pricing
   * summary; payload carries enough info to render that without
   * re-loading the booking.
   */
  BOOKING_PRICE_ADJUSTED: {
    bookingId: number;
    availedServiceId?: number | null;
    deltaAmount: number;
    oldGrandTotal: number;
    newGrandTotal: number;
    reason: string;
    actorUserId: string;
    customerName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  /**
   * Internal-only event (per matrix: notes have no customer-visible
   * side effect, even when visibility=CUSTOMER_VISIBLE — the customer
   * sees those when they open their booking page, no push). Used for
   * staff activity feeds and audit visibility.
   */
  BOOKING_NOTE_ADDED: {
    bookingId: number;
    noteId: string;
    visibility: "INTERNAL" | "CUSTOMER_VISIBLE";
    /** First 140 chars of the note body. Useful for activity feed cards. */
    bodyPreview: string;
    actorUserId: string;
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
  /**
   * Fired when a staff member submits a SocialPostRequest. Drives the
   * owner / reviewer in-app notification feed.
   */
  SOCIAL_POST_REQUEST_SUBMITTED: {
    requestId: string;
    businessId: string;
    requestedByUserId: string;
    requestedByName?: string | null;
    topic: string;
    category: string;
  };
  /**
   * Fired when a reviewer approves a request and a SocialPost draft is
   * created. Notifies the original requester so they can see the draft.
   */
  SOCIAL_POST_REQUEST_APPROVED: {
    requestId: string;
    businessId: string;
    requestedByUserId: string;
    reviewedByUserId: string;
    socialPostId: string;
    topic: string;
  };
  /**
   * Fired when a reviewer rejects a request with a reason.
   */
  SOCIAL_POST_REQUEST_REJECTED: {
    requestId: string;
    businessId: string;
    requestedByUserId: string;
    reviewedByUserId: string;
    topic: string;
    rejectionReason: string;
  };
  /**
   * Close-the-loop event: the SocialPost that was approved from a
   * request reached PUBLISHED status. Notifies the original requester
   * with the public Meta permalink so they can share / verify.
   */
  SOCIAL_POST_REQUEST_PUBLISHED: {
    requestId: string;
    businessId: string;
    requestedByUserId: string;
    socialPostId: string;
    topic: string;
    permalinks: string[];
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
    actorUserId: optionalString(payload, "actorUserId") ?? null,
    phone: optionalString(payload, "phone") ?? null,
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
    case "BOOKING_CANCELLED_BY_CUSTOMER":
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        scheduledAt: optionalString(payload, "scheduledAt") ?? null,
        reason: optionalString(payload, "reason") ?? null,
      } as OutboxPayloadMap[TType];
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
    case "BOOKING_SERVICE_SWAPPED":
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        removedAvailedServiceId: requireNumber(payload, "removedAvailedServiceId", eventType),
        removedServiceName: requireString(payload, "removedServiceName", eventType),
        addedServiceId: requireNumber(payload, "addedServiceId", eventType),
        addedServiceName: requireString(payload, "addedServiceName", eventType),
        priceDelta: requireNumber(payload, "priceDelta", eventType),
        newGrandTotal: requireNumber(payload, "newGrandTotal", eventType),
        actorUserId: requireString(payload, "actorUserId", eventType),
        customerName: optionalString(payload, "customerName"),
        email: optionalString(payload, "email"),
      } as OutboxPayloadMap[TType];
    case "BOOKING_RESCHEDULED":
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        oldScheduledAt: requireString(payload, "oldScheduledAt", eventType),
        newScheduledAt: requireString(payload, "newScheduledAt", eventType),
        oldEstimatedEnd: optionalString(payload, "oldEstimatedEnd"),
        newEstimatedEnd: optionalString(payload, "newEstimatedEnd"),
        actorUserId: requireString(payload, "actorUserId", eventType),
        customerName: optionalString(payload, "customerName"),
        email: optionalString(payload, "email"),
        phone: optionalString(payload, "phone"),
      } as OutboxPayloadMap[TType];
    case "BOOKING_RESCHEDULED_BY_CUSTOMER":
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        previousScheduledAt:
          optionalString(payload, "previousScheduledAt") ?? null,
        newScheduledAt: requireString(payload, "newScheduledAt", eventType),
      } as OutboxPayloadMap[TType];
    case "BOOKING_STAFF_REASSIGNED":
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        availedServiceId: requireNumber(payload, "availedServiceId", eventType),
        serviceName: requireString(payload, "serviceName", eventType),
        oldEmployeeId: optionalNumber(payload, "oldEmployeeId") ?? null,
        oldOwnerId: optionalNumber(payload, "oldOwnerId") ?? null,
        oldStaffName: optionalString(payload, "oldStaffName") ?? null,
        newEmployeeId: requireNumber(payload, "newEmployeeId", eventType),
        newStaffName: requireString(payload, "newStaffName", eventType),
        actorUserId: requireString(payload, "actorUserId", eventType),
      } as OutboxPayloadMap[TType];
    case "BOOKING_PRICE_ADJUSTED":
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        availedServiceId: optionalNumber(payload, "availedServiceId") ?? null,
        deltaAmount: requireNumber(payload, "deltaAmount", eventType),
        oldGrandTotal: requireNumber(payload, "oldGrandTotal", eventType),
        newGrandTotal: requireNumber(payload, "newGrandTotal", eventType),
        reason: requireString(payload, "reason", eventType),
        actorUserId: requireString(payload, "actorUserId", eventType),
        customerName: optionalString(payload, "customerName"),
        email: optionalString(payload, "email"),
        phone: optionalString(payload, "phone"),
      } as OutboxPayloadMap[TType];
    case "BOOKING_NOTE_ADDED": {
      const visibilityRaw = requireString(payload, "visibility", eventType);
      if (visibilityRaw !== "INTERNAL" && visibilityRaw !== "CUSTOMER_VISIBLE") {
        throw new Error(
          `[Outbox:${eventType}] Invalid visibility "${visibilityRaw}"`,
        );
      }
      return {
        bookingId: requireNumber(payload, "bookingId", eventType),
        noteId: requireString(payload, "noteId", eventType),
        visibility: visibilityRaw,
        bodyPreview: requireString(payload, "bodyPreview", eventType),
        actorUserId: requireString(payload, "actorUserId", eventType),
      } as OutboxPayloadMap[TType];
    }
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
    case "SOCIAL_POST_REQUEST_SUBMITTED":
      return {
        requestId: requireString(payload, "requestId", eventType),
        businessId: requireString(payload, "businessId", eventType),
        requestedByUserId: requireString(payload, "requestedByUserId", eventType),
        requestedByName: optionalString(payload, "requestedByName") ?? null,
        topic: requireString(payload, "topic", eventType),
        category: requireString(payload, "category", eventType),
      } as OutboxPayloadMap[TType];
    case "SOCIAL_POST_REQUEST_APPROVED":
      return {
        requestId: requireString(payload, "requestId", eventType),
        businessId: requireString(payload, "businessId", eventType),
        requestedByUserId: requireString(payload, "requestedByUserId", eventType),
        reviewedByUserId: requireString(payload, "reviewedByUserId", eventType),
        socialPostId: requireString(payload, "socialPostId", eventType),
        topic: requireString(payload, "topic", eventType),
      } as OutboxPayloadMap[TType];
    case "SOCIAL_POST_REQUEST_REJECTED":
      return {
        requestId: requireString(payload, "requestId", eventType),
        businessId: requireString(payload, "businessId", eventType),
        requestedByUserId: requireString(payload, "requestedByUserId", eventType),
        reviewedByUserId: requireString(payload, "reviewedByUserId", eventType),
        topic: requireString(payload, "topic", eventType),
        rejectionReason: requireString(payload, "rejectionReason", eventType),
      } as OutboxPayloadMap[TType];
    case "SOCIAL_POST_REQUEST_PUBLISHED":
      return {
        requestId: requireString(payload, "requestId", eventType),
        businessId: requireString(payload, "businessId", eventType),
        requestedByUserId: requireString(payload, "requestedByUserId", eventType),
        socialPostId: requireString(payload, "socialPostId", eventType),
        topic: requireString(payload, "topic", eventType),
        permalinks: Array.isArray((payload as { permalinks?: unknown }).permalinks)
          ? ((payload as { permalinks: unknown[] }).permalinks.filter(
              (v): v is string => typeof v === "string",
            ))
          : [],
      } as OutboxPayloadMap[TType];
    default:
      throw new Error(`[Outbox:${eventType}] Unsupported event type`);
  }
}
