import {
  BookingPaymentStatus,
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { logAudit } from "@/lib/services/audit";

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function derivePaymentStatus(amountPaid: number, total: number): PaymentStatus {
  if (amountPaid <= 0) return PaymentStatus.UNPAID;
  if (amountPaid >= total) return PaymentStatus.PAID;
  return PaymentStatus.PARTIALLY_PAID;
}

async function succeededTotal(
  tx: Prisma.TransactionClient,
  bookingId: number,
) {
  const result = await tx.bookingPayment.aggregate({
    where: { booking_id: bookingId, status: BookingPaymentStatus.SUCCEEDED },
    _sum: { amount_principal: true },
  });
  return roundMoney(result._sum.amount_principal ?? 0);
}

async function withSerializableRetry<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("PAYMENT_CONFLICT");
}

export type RecordBookingPaymentInput = {
  bookingId: number;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  note?: string | null;
  idempotencyKey: string;
};

export async function recordBookingPayment(params: {
  input: RecordBookingPaymentInput;
  businessSlug: string;
  actorUserId: string;
  employeeId?: number;
}) {
  const { input, businessSlug, actorUserId, employeeId } = params;
  return withSerializableRetry(async (tx) => {
    const duplicate = await tx.bookingPayment.findUnique({
      where: { idempotency_key: input.idempotencyKey },
      select: { booking_id: true },
    });
    if (duplicate) {
      if (duplicate.booking_id !== input.bookingId) throw new Error("DUPLICATE");
      const existingBooking = await tx.booking.findUniqueOrThrow({
        where: { id: input.bookingId },
        select: { amount_paid: true, grand_total: true, payment_status: true },
      });
      return {
        amountPaid: existingBooking.amount_paid,
        remainingBalance: roundMoney(
          Math.max(0, existingBooking.grand_total - existingBooking.amount_paid),
        ),
        paymentStatus: existingBooking.payment_status,
        idempotent: true,
      };
    }

    const booking = await tx.booking.findFirst({
      where: {
        id: input.bookingId,
        business: { slug: businessSlug },
        status: { in: [BookingStatus.ACCEPTED, BookingStatus.COMPLETED] },
      },
      select: { id: true, business_id: true, grand_total: true },
    });
    if (!booking) throw new Error("NOT_COLLECTABLE");

    const ledgerTotal = await succeededTotal(tx, booking.id);
    const remainingBalance = roundMoney(
      Math.max(0, booking.grand_total - ledgerTotal),
    );
    if (remainingBalance <= 0) throw new Error("ALREADY_PAID");
    if (input.amount > remainingBalance) throw new Error("OVERPAYMENT");

    const payment = await tx.bookingPayment.create({
      data: {
        booking_id: booking.id,
        type:
          input.amount === remainingBalance ? "BALANCE" : "MANUAL",
        status: BookingPaymentStatus.SUCCEEDED,
        payment_method: input.paymentMethod,
        amount_principal: input.amount,
        amount_charged: input.amount,
        provider_reference: input.reference || null,
        paid_at: getCurrentDateTimePH(),
        idempotency_key: input.idempotencyKey,
        metadata: {
          source: employeeId ? "EMPLOYEE_RECORDED_PAYMENT" : "OWNER_RECORDED_PAYMENT",
          employeeId: employeeId ?? null,
          note: input.note || null,
        },
      },
    });

    const amountPaid = roundMoney(ledgerTotal + input.amount);
    const paymentStatus = derivePaymentStatus(amountPaid, booking.grand_total);
    await tx.booking.update({
      where: { id: booking.id },
      data: { amount_paid: amountPaid, payment_status: paymentStatus },
    });
    await logAudit(tx, {
      entityType: "BookingPayment",
      entityId: String(payment.id),
      action: "PAYMENT_RECORDED",
      actorId: actorUserId,
      businessId: booking.business_id,
      changes: {
        after: {
          bookingId: booking.id,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          reference: input.reference || null,
          note: input.note || null,
        },
      },
    });
    return {
      amountPaid,
      remainingBalance: roundMoney(booking.grand_total - amountPaid),
      paymentStatus,
      idempotent: false,
    };
  });
}

export async function voidBookingPayment(params: {
  paymentId: number;
  reason: string;
  businessSlug: string;
  actorUserId: string;
}) {
  return withSerializableRetry(async (tx) => {
    const payment = await tx.bookingPayment.findFirst({
      where: {
        id: params.paymentId,
        status: BookingPaymentStatus.SUCCEEDED,
        booking: { business: { slug: params.businessSlug } },
      },
      include: {
        booking: { select: { id: true, business_id: true, grand_total: true } },
      },
    });
    if (!payment) throw new Error("NOT_VOIDABLE");

    const changed = await tx.bookingPayment.updateMany({
      where: { id: payment.id, status: BookingPaymentStatus.SUCCEEDED },
      data: {
        status: BookingPaymentStatus.CANCELED,
        voided_at: getCurrentDateTimePH(),
        voided_by_user_id: params.actorUserId,
        void_reason: params.reason,
      },
    });
    if (changed.count !== 1) throw new Error("NOT_VOIDABLE");

    const amountPaid = await succeededTotal(tx, payment.booking.id);
    const paymentStatus = derivePaymentStatus(
      amountPaid,
      payment.booking.grand_total,
    );
    await tx.booking.update({
      where: { id: payment.booking.id },
      data: { amount_paid: amountPaid, payment_status: paymentStatus },
    });
    await logAudit(tx, {
      entityType: "BookingPayment",
      entityId: String(payment.id),
      action: "PAYMENT_VOIDED",
      actorId: params.actorUserId,
      businessId: payment.booking.business_id,
      changes: {
        before: { status: BookingPaymentStatus.SUCCEEDED },
        after: {
          status: BookingPaymentStatus.CANCELED,
          reason: params.reason,
        },
      },
    });
    return { amountPaid, paymentStatus };
  });
}
