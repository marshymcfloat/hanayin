import crypto from "crypto";
import { PaymentStatus, Prisma } from "@/prisma/generated/prisma/client";
import { createBookingInDb } from "@/lib/services/booking";
import { promoteBookingToCompletedIfEligible } from "@/lib/services/booking-status";
import { prisma } from "@/prisma/prisma";
import { extractPaymentIntentReferences } from "@/lib/paymongo/webhook-utils";
import { publishEvent } from "@/lib/services/outbox";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { recordBookingMetric } from "@/lib/services/booking-metrics";
import { rateLimit } from "@/lib/rate-limit";

const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;
const WEBHOOK_RATE_LIMIT = {
  windowMs: 60 * 1000,
  maxRequests: 120,
  namespace: "service-flow:rate-limit:paymongo-webhook",
  onStoreError: "deny" as const,
};

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  return forwardedFor.split(",")[0]?.trim() || "unknown";
}

// Handle preflight requests (CORS)
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, paymongo-signature",
    },
  });
}

// Health check endpoint
export async function GET() {
  return new Response("PayMongo webhook endpoint is active", { status: 200 });
}

/**
 * Verify the PayMongo webhook signature
 * @see https://developers.paymongo.com/docs/creating-webhook#3-securing-a-webhook
 */
function verifyPayMongoSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) {
    console.error("No Paymongo-Signature header present");
    return false;
  }

  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("PAYMONGO_WEBHOOK_SECRET not configured");
    return false;
  }

  const parts = signatureHeader.split(",");
  const signatureParts: Record<string, string> = {};
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) {
      signatureParts[key] = value;
    }
  }

  const timestamp = signatureParts.t;
  const providedSignature = signatureParts.li || signatureParts.te;

  if (!timestamp || !providedSignature) {
    console.error("Missing timestamp or signature in header");
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    console.error("Invalid timestamp in signature header");
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    console.error("Webhook signature timestamp outside tolerance window");
    return false;
  }

  const signatureString = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(signatureString)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(providedSignature, "utf8"),
    );
  } catch {
    return false;
  }
}

function resolveWebhookEventId(body: Record<string, unknown>, rawBody: string) {
  const bodyData = body?.data as Record<string, unknown> | undefined;
  const eventId =
    (typeof bodyData?.id === "string" && bodyData.id) ||
    (typeof body?.id === "string" && body.id) ||
    crypto.createHash("sha256").update(rawBody).digest("hex");

  return eventId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNestedPaymentAttributes(body: unknown) {
  if (!isRecord(body)) return null;
  const data = isRecord(body.data) ? body.data : null;
  const attributes = data && isRecord(data.attributes) ? data.attributes : null;
  const paymentData = attributes && isRecord(attributes.data)
    ? attributes.data
    : null;
  const paymentAttributes = paymentData && isRecord(paymentData.attributes)
    ? paymentData.attributes
    : null;

  return paymentAttributes || paymentData || attributes;
}

function extractPaidAmountSnapshot(body: unknown) {
  const attrs = getNestedPaymentAttributes(body);
  if (!attrs) return { amountCents: null, currency: null };

  const amountCents =
    typeof attrs.amount === "number" ? attrs.amount : null;
  const currency =
    typeof attrs.currency === "string" ? attrs.currency.toUpperCase() : null;

  return { amountCents, currency };
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function resolvePaymentStatus(
  grandTotal: number,
  amountPaid: number,
): PaymentStatus {
  const roundedGrandTotal = roundMoney(grandTotal);
  const roundedAmountPaid = roundMoney(Math.max(0, amountPaid));

  if (roundedAmountPaid >= roundedGrandTotal) {
    return PaymentStatus.PAID;
  }

  if (roundedAmountPaid > 0) {
    return PaymentStatus.PARTIALLY_PAID;
  }

  return PaymentStatus.UNPAID;
}

async function acquireWebhookLock(eventId: string) {
  const lockKey = `paymongo:webhook:${eventId}`;
  const [result] = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(hashtext(${lockKey})) AS locked
  `;

  return Boolean(result?.locked);
}

async function releaseWebhookLock(eventId: string) {
  const lockKey = `paymongo:webhook:${eventId}`;
  await prisma.$queryRaw`
    SELECT pg_advisory_unlock(hashtext(${lockKey}))
  `;
}

async function wasWebhookProcessed(eventId: string) {
  const existing = await prisma.auditLog.findFirst({
    where: {
      entity_type: "PAYMONGO_WEBHOOK_EVENT",
      entity_id: eventId,
      action: "PROCESSED",
    },
    select: { id: true },
  });

  return Boolean(existing);
}

async function markWebhookProcessed(
  eventId: string,
  eventType: string,
  businessId = "system",
) {
  await prisma.auditLog.create({
    data: {
      entity_type: "PAYMONGO_WEBHOOK_EVENT",
      entity_id: eventId,
      action: "PROCESSED",
      actor_type: "WEBHOOK",
      business_id: businessId,
      changes: {
        eventType,
        processedAt: getCurrentDateTimePH().toISOString(),
      } as Prisma.JsonObject,
    },
  });
}

async function markBookingPaymentAttemptStatus(
  paymentIntentId: string,
  status: "FAILED" | "EXPIRED" | "CANCELED",
) {
  await prisma.bookingPayment.updateMany({
    where: {
      paymongo_payment_intent_id: paymentIntentId,
      status: "PENDING",
    },
    data: {
      status,
    },
  });
}

async function cancelHeldBookingByPaymentIntent(
  paymentIntentId: string,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({
      where: { paymongo_payment_intent_id: paymentIntentId },
      select: {
        id: true,
        business_id: true,
        status: true,
      },
    });

    if (!booking || booking.status !== "HOLD") {
      return booking?.business_id;
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        hold_expires_at: null,
      },
    });

    await tx.voucher.updateMany({
      where: { used_by_id: booking.id },
      data: {
        used_by_id: null,
        is_active: true,
      },
    });

    await publishEvent(tx as Prisma.TransactionClient, {
      type: "BOOKING_CANCELLED",
      aggregateType: "Booking",
      aggregateId: String(booking.id),
      businessId: booking.business_id,
      payload: {
        bookingId: booking.id,
        reason,
        status: "CANCELLED",
      },
    });

    return booking.business_id;
  });
}

export async function POST(req: Request) {
  let eventId = "";
  let lockAcquired = false;

  try {
    const limiter = await rateLimit(
      `paymongo-webhook:${getClientIp(req)}`,
      WEBHOOK_RATE_LIMIT,
    );
    if (!limiter.success) {
      return new Response("Too many requests", {
        status: 429,
        headers: {
          "Retry-After": "60",
        },
      });
    }

    const rawBody = await req.text();
    const signatureHeader = req.headers.get("paymongo-signature");

    if (!verifyPayMongoSignature(rawBody, signatureHeader)) {
      console.error("Invalid webhook signature");
      return new Response("Invalid signature", { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const eventType = body?.data?.attributes?.type;

    if (!eventType) {
      return new Response("Missing event type", { status: 400 });
    }

    eventId = resolveWebhookEventId(body, rawBody);
    lockAcquired = await acquireWebhookLock(eventId);

    if (!lockAcquired) {
      return new Response("Webhook already being processed", { status: 200 });
    }

    if (await wasWebhookProcessed(eventId)) {
      return new Response("Webhook already processed", { status: 200 });
    }

    let businessIdForAudit = "system";

    if (eventType === "checkout_session.payment.paid") {
      const attributes = body?.data?.attributes?.data?.attributes;
      const metadata = attributes?.metadata;
      const checkoutSessionId = body?.data?.attributes?.data?.id;

      if (!metadata) {
        console.error("No metadata found in webhook event");
        return new Response("No metadata", { status: 400 });
      }

      if (metadata?.billing_context === "SUBSCRIPTION") {
        await markWebhookProcessed(eventId, eventType, businessIdForAudit);
        return new Response("Subscription event ignored in booking webhook", {
          status: 200,
        });
      }

      const {
        businessSlug,
        customerName,
        customerId,
        email,
        phone,
        services: servicesJson,
        scheduledAt: scheduledAtStr,
        estimatedEnd: estimatedEndStr,
        employeeId: employeeIdStr,
        currentEmployeeId: currentEmployeeIdStr,
        paymentMethod,
        paymentType,
        voucherCode,
        isWalkIn: isWalkInRaw,
        staffSelectionMode: staffSelectionModeRaw,
        capacityOverrideReason: capacityOverrideReasonRaw,
        capacityOverrideNote: capacityOverrideNoteRaw,
        capacityOverrideApplied: capacityOverrideAppliedRaw,
      } = metadata;

      if (!businessSlug || !servicesJson) {
        console.error("Missing required metadata fields");
        return new Response("Missing metadata", { status: 400 });
      }

      const services = JSON.parse(servicesJson);
      const nowPH = getCurrentDateTimePH();
      const scheduledAt = scheduledAtStr
        ? new Date(scheduledAtStr)
        : nowPH;
      const estimatedEnd = estimatedEndStr
        ? new Date(estimatedEndStr)
        : nowPH;
      const employeeId = employeeIdStr
        ? parseInt(employeeIdStr, 10)
        : undefined;
      const currentEmployeeId = currentEmployeeIdStr
        ? parseInt(currentEmployeeIdStr, 10)
        : undefined;
      const isWalkIn = isWalkInRaw === "true";
      const capacityOverrideApplied = capacityOverrideAppliedRaw === "true";
      const staffSelectionMode =
        staffSelectionModeRaw === "REQUIRE_SELECTED" ||
        staffSelectionModeRaw === "PREFER_SELECTED" ||
        staffSelectionModeRaw === "ANY_AVAILABLE"
          ? staffSelectionModeRaw
          : "ANY_AVAILABLE";
      const capacityOverride =
        capacityOverrideReasonRaw &&
        (capacityOverrideReasonRaw === "LATE_CUSTOMER" ||
          capacityOverrideReasonRaw === "VIP" ||
          capacityOverrideReasonRaw === "MANUAL_EXCEPTION" ||
          capacityOverrideReasonRaw === "SYSTEM_RECOVERY")
          ? {
              reason: capacityOverrideReasonRaw,
              note:
                typeof capacityOverrideNoteRaw === "string"
                  ? capacityOverrideNoteRaw
                  : undefined,
            }
          : undefined;

      try {
        const booking = await createBookingInDb({
          businessSlug,
          customerId,
          customerName,
          email,
          phone,
          services,
          scheduledAt,
          estimatedEnd,
          employeeId,
          currentEmployeeId,
          paymentMethod: paymentMethod as "QRPH",
          paymentType: paymentType as "FULL" | "DOWNPAYMENT",
          voucherCode,
          paymentConfirmed: true,
          paymongoCheckoutSessionId: checkoutSessionId,
          isPublicBooking: true,
          isWalkIn,
          staffSelectionMode,
          capacityOverride,
          allowWalkInCapacityBypass: capacityOverrideApplied,
        });
        businessIdForAudit = booking.business_id;
        await recordBookingMetric({
          businessId: booking.business_id,
          action: "PUBLIC_BOOKING_COMPLETED",
          outcome: "COMPLETED",
          actorType: "WEBHOOK",
          metadata: {
            bookingId: booking.id,
            completionPath: "CHECKOUT_SESSION_WEBHOOK",
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          checkoutSessionId
        ) {
          const existing = await prisma.booking.findFirst({
            where: { paymongo_checkout_session_id: checkoutSessionId },
            select: { business_id: true },
          });
          businessIdForAudit = existing?.business_id || "system";
        } else {
          throw error;
        }
      }

      await markWebhookProcessed(eventId, eventType, businessIdForAudit);
      return new Response("Webhook processed", { status: 200 });
    }

    if (eventType === "payment.paid") {
      const { paymentIntentId, paymentId, paymentMethodId } =
        extractPaymentIntentReferences(body);
      const paidSnapshot = extractPaidAmountSnapshot(body);

      if (!paymentIntentId) {
        console.error("Missing payment intent ID in payment.paid event");
        return new Response("Missing payment intent ID", { status: 400 });
      }

      const result = await prisma.$transaction(async (tx) => {
        const paymentRecord = await tx.bookingPayment.findFirst({
          where: { paymongo_payment_intent_id: paymentIntentId },
          orderBy: { created_at: "desc" },
          include: {
            booking: {
              select: {
                id: true,
                business_id: true,
                status: true,
                grand_total: true,
                amount_paid: true,
                downpayment: true,
                paymongo_payment_method_id: true,
                paymongo_payment_id: true,
                hold_expires_at: true,
              },
            },
          },
        });

        const existingBooking =
          paymentRecord?.booking ||
          (await tx.booking.findFirst({
            where: { paymongo_payment_intent_id: paymentIntentId },
            select: {
              id: true,
              business_id: true,
              status: true,
              grand_total: true,
              amount_paid: true,
              downpayment: true,
              paymongo_payment_method_id: true,
              paymongo_payment_id: true,
              hold_expires_at: true,
            },
          }));

        if (!existingBooking) {
          return { kind: "missing" as const, businessId: "system" };
        }

        if (paidSnapshot.currency && paidSnapshot.currency !== "PHP") {
          if (paymentRecord) {
            await tx.bookingPayment.update({
              where: { id: paymentRecord.id },
              data: {
                status: "FAILED",
                metadata: {
                  reason: "UNEXPECTED_CURRENCY",
                  currency: paidSnapshot.currency,
                },
              },
            });
          }

          return {
            kind: "amount_mismatch" as const,
            businessId: existingBooking.business_id,
          };
        }

        if (paymentRecord && paidSnapshot.amountCents !== null) {
          const expectedChargedCents = Math.round(paymentRecord.amount_charged * 100);
          const amountDelta = Math.abs(paidSnapshot.amountCents - expectedChargedCents);

          if (amountDelta > 1) {
            await tx.bookingPayment.update({
              where: { id: paymentRecord.id },
              data: {
                status: "FAILED",
                metadata: {
                  reason: "AMOUNT_MISMATCH",
                  expectedChargedCents,
                  paidAmountCents: paidSnapshot.amountCents,
                },
              },
            });

            return {
              kind: "amount_mismatch" as const,
              businessId: existingBooking.business_id,
            };
          }
        }

        const fallbackPrincipalAmount =
          existingBooking.amount_paid <= 0 && (existingBooking.downpayment || 0) > 0
            ? existingBooking.downpayment || 0
            : Math.max(0, existingBooking.grand_total - existingBooking.amount_paid);
        const principalAmount = paymentRecord?.amount_principal || fallbackPrincipalAmount;
        const shouldApplyAmount = paymentRecord
          ? paymentRecord.status !== "SUCCEEDED"
          : true;
        const nextAmountPaid = shouldApplyAmount
          ? Math.min(
              existingBooking.grand_total,
              roundMoney(existingBooking.amount_paid + principalAmount),
            )
          : existingBooking.amount_paid;
        const nextPaymentStatus = resolvePaymentStatus(
          existingBooking.grand_total,
          nextAmountPaid,
        );

        await tx.booking.update({
          where: { id: existingBooking.id },
          data: {
            status: existingBooking.status === "HOLD" ? "ACCEPTED" : existingBooking.status,
            hold_expires_at:
              existingBooking.status === "HOLD"
                ? null
                : existingBooking.hold_expires_at,
            amount_paid: nextAmountPaid,
            payment_status: nextPaymentStatus,
            paymongo_payment_id:
              paymentId || existingBooking.paymongo_payment_id,
            paymongo_payment_method_id:
              paymentMethodId || existingBooking.paymongo_payment_method_id,
          },
        });

        if (paymentRecord) {
          const paidAtPH = getCurrentDateTimePH();
          await tx.bookingPayment.update({
            where: { id: paymentRecord.id },
            data: {
              status: "SUCCEEDED",
              paid_at: paidAtPH,
              paymongo_payment_id: paymentId || paymentRecord.paymongo_payment_id,
              paymongo_payment_method_id:
                paymentMethodId || paymentRecord.paymongo_payment_method_id,
            },
          });
        } else {
          const chargedAmount = paidSnapshot.amountCents !== null
            ? paidSnapshot.amountCents / 100
            : principalAmount;
          const paidAtPH = getCurrentDateTimePH();

          await tx.bookingPayment.create({
            data: {
              booking_id: existingBooking.id,
              type:
                existingBooking.amount_paid > 0
                  ? "BALANCE"
                  : (existingBooking.downpayment || 0) > 0
                    ? "DOWNPAYMENT"
                    : "FULL",
              status: "SUCCEEDED",
              payment_method: "QRPH",
              amount_principal: principalAmount,
              amount_charged: chargedAmount,
              paymongo_payment_intent_id: paymentIntentId,
              paymongo_payment_method_id: paymentMethodId,
              paymongo_payment_id: paymentId,
              paid_at: paidAtPH,
            },
          });
        }

        if (existingBooking.status === "HOLD") {
          await publishEvent(tx as Prisma.TransactionClient, {
            type: "BOOKING_CONFIRMED",
            aggregateType: "Booking",
            aggregateId: String(existingBooking.id),
            businessId: existingBooking.business_id,
            payload: {
              bookingId: existingBooking.id,
              status: "ACCEPTED",
            },
          });
        }

        await promoteBookingToCompletedIfEligible(tx, existingBooking.id);

        return {
          kind: "found" as const,
          businessId: existingBooking.business_id,
        };
      });

      if (result.kind === "missing") {
        console.error(
          `[Webhook] payment.paid for ${paymentIntentId} has no matching local booking/payment record.`,
        );
        await markWebhookProcessed(eventId, eventType, businessIdForAudit);
        return new Response("Webhook processed", { status: 200 });
      }
      businessIdForAudit = result.businessId;
      await recordBookingMetric({
        businessId: result.businessId,
        action: "PUBLIC_BOOKING_COMPLETED",
        outcome: "COMPLETED",
        actorType: "WEBHOOK",
        metadata: {
          paymentIntentId,
          completionPath: "PAYMENT_PAID_WEBHOOK",
        },
      });

      if (result.kind === "amount_mismatch") {
        console.error(
          `[Webhook] Amount mismatch for payment intent ${paymentIntentId}. Payment was not applied automatically.`,
        );
      }

      await markWebhookProcessed(eventId, eventType, businessIdForAudit);
      return new Response("Webhook processed", { status: 200 });
    }

    if (eventType === "payment.failed" || eventType === "qrph.expired") {
      const { paymentIntentId } = extractPaymentIntentReferences(body);
      if (paymentIntentId) {
        await markBookingPaymentAttemptStatus(
          paymentIntentId,
          eventType === "qrph.expired" ? "EXPIRED" : "FAILED",
        );

        const bookingBusinessId = await cancelHeldBookingByPaymentIntent(
          paymentIntentId,
          eventType,
        );
        if (bookingBusinessId) {
          businessIdForAudit = bookingBusinessId;
        }
      }

      await markWebhookProcessed(eventId, eventType, businessIdForAudit);
      return new Response("Webhook processed", { status: 200 });
    }

    await markWebhookProcessed(eventId, eventType, businessIdForAudit);
    return new Response("Event ignored", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response("Internal Server Error", { status: 500 });
  } finally {
    if (lockAcquired && eventId) {
      try {
        await releaseWebhookLock(eventId);
      } catch (error) {
        console.error("Failed to release webhook lock:", error);
      }
    }
  }
}
