import { prisma } from "@/prisma/prisma";
import { publishEvent } from "./outbox";
import {
  BookingPaymentType,
  PaymentStatus,
  Prisma,
} from "@/prisma/generated/prisma/client";
import {
  BookingServiceInput,
  buildBookingPricingSnapshot,
} from "./booking-pricing";
import {
  findExistingCustomerByContact,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "./customer-matching";
import { getQrHoldExpiresAt } from "@/lib/payments/config";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import {
  BookingAvailabilityError,
  CapacityOverrideInput,
  checkSaleEventSlotLimit,
  resolveStaffSelectionOrThrow,
  StaffSelectionMode,
  validateBookingOrThrow,
} from "./booking-availability";

export type BookingServiceParams = {
  businessSlug: string;
  customerId?: string;
  customerName: string;
  services: (BookingServiceInput & {
    name?: string;
    price?: number;
    originalPrice?: number;
    discount?: number;
    discountReason?: string | null;
    commissionBase?: number;
  })[];
  scheduledAt: Date;
  estimatedEnd: Date;
  employeeId?: number | null;
  currentEmployeeId?: number | null;
  paymentMethod: "CASH" | "QRPH";

  paymentType: "FULL" | "DOWNPAYMENT";
  email?: string;
  phone?: string;
  voucherCode?: string;
  totalDiscount?: number;
  paymentConfirmed?: boolean;
  paymongoCheckoutSessionId?: string;
  paymongoPaymentIntentId?: string;
  paymongoPaymentMethodId?: string;
  paymongoPaymentId?: string;
  isPublicBooking?: boolean;
  isWalkIn?: boolean;
  staffSelectionMode?: StaffSelectionMode;
  capacityOverride?: CapacityOverrideInput;
  allowWalkInCapacityBypass?: boolean;
  pricingSnapshot?: Awaited<ReturnType<typeof buildBookingPricingSnapshot>>;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const resolvePaymentStatus = (
  grandTotal: number,
  amountPaid: number,
): PaymentStatus => {
  const roundedGrandTotal = roundMoney(grandTotal);
  const roundedAmountPaid = roundMoney(Math.max(0, amountPaid));

  if (roundedAmountPaid >= roundedGrandTotal) {
    return PaymentStatus.PAID;
  }

  if (roundedAmountPaid > 0) {
    return PaymentStatus.PARTIALLY_PAID;
  }

  return PaymentStatus.UNPAID;
};

export async function createBookingInDb({
  businessSlug,
  customerId,
  customerName,
  services,
  scheduledAt,
  employeeId,
  currentEmployeeId,
  paymentMethod,

  paymentType,
  email,
  phone,
  voucherCode,
  paymentConfirmed = false,
  paymongoCheckoutSessionId,
  paymongoPaymentIntentId,
  paymongoPaymentMethodId,
  paymongoPaymentId,
  isPublicBooking = false,
  isWalkIn = false,
  staffSelectionMode = "ANY_AVAILABLE",
  capacityOverride,
  allowWalkInCapacityBypass = false,
  pricingSnapshot,
}: BookingServiceParams) {
  const normalizedEmail = normalizeCustomerEmail(email);
  const normalizedPhone = normalizeCustomerPhone(phone);
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const pricing =
            pricingSnapshot ??
            (await buildBookingPricingSnapshot({
              db: tx,
              businessSlug,
              scheduledAt,
              services,
              paymentMethod,
              paymentType,
              voucherCode,
            }));
          const { business } = pricing;
          const validatedServices = pricing.services;

          if (!allowWalkInCapacityBypass) {
            await validateBookingOrThrow({
              businessSlug,
              scheduledAt,
              services: validatedServices.map((service) => ({
                id: service.id,
                quantity: service.quantity,
              })),
              paymentType,
              isPublicBooking,
              isWalkIn,
              selectedEmployeeId: employeeId ?? undefined,
              staffSelectionMode,
              allowWalkInCapacityBypass,
              capacityOverride,
              db: tx,
            });
          }

          const staffResolution = await resolveStaffSelectionOrThrow({
            businessSlug,
            scheduledAt,
            services: validatedServices.map((service) => ({
              id: service.id,
              quantity: service.quantity,
            })),
            selectedEmployeeId: employeeId ?? undefined,
            staffSelectionMode,
            db: tx,
          });

          let finalCustomerId = isPublicBooking ? undefined : customerId;

          if (finalCustomerId) {
            const existingCustomer = await tx.customer.findUnique({
              where: { id: finalCustomerId },
            });

            if (existingCustomer) {
              const shouldUpdateEmail =
                !!normalizedEmail && !existingCustomer.email;
              const shouldUpdatePhone =
                !!normalizedPhone && !existingCustomer.phone;

              if (shouldUpdateEmail || shouldUpdatePhone) {
                await tx.customer.update({
                  where: { id: existingCustomer.id },
                  data: {
                    ...(shouldUpdateEmail ? { email: normalizedEmail } : {}),
                    ...(shouldUpdatePhone ? { phone: normalizedPhone } : {}),
                  },
                });
              }
            }
          } else {
            const existingCustomer = await findExistingCustomerByContact({
              customerDelegate: tx.customer,
              businessId: business.id,
              email: normalizedEmail,
              phone: normalizedPhone,
            });

            if (existingCustomer) {
              finalCustomerId = existingCustomer.id;
              const shouldUpdateEmail =
                !!normalizedEmail && !existingCustomer.email;
              const shouldUpdatePhone =
                !!normalizedPhone && !existingCustomer.phone;

              if (shouldUpdateEmail || shouldUpdatePhone) {
                await tx.customer.update({
                  where: { id: existingCustomer.id },
                  data: {
                    ...(shouldUpdateEmail ? { email: normalizedEmail } : {}),
                    ...(shouldUpdatePhone ? { phone: normalizedPhone } : {}),
                  },
                });
              }
            } else {
              const newCustomer = await tx.customer.create({
                data: {
                  name: customerName,
                  email: normalizedEmail,
                  phone: normalizedPhone,
                  business_id: business.id,
                },
              });
              finalCustomerId = newCustomer.id;
            }
          }

          const isDownpayment = paymentType === "DOWNPAYMENT";
          const isOnlinePayment = paymentMethod === "QRPH";
          const bookingStatus =
            isOnlinePayment && !paymentConfirmed ? "HOLD" : "ACCEPTED";
          const holdExpiresAt =
            bookingStatus === "HOLD" ? getQrHoldExpiresAt() : null;

          // Check sale event slot limit inside transaction for atomicity
          const appliedSaleEventId = pricing.appliedSaleEventId ?? null;
          if (appliedSaleEventId) {
            await checkSaleEventSlotLimit({
              saleEventId: appliedSaleEventId,
              db: tx,
            });
          }

          const finalVoucherDiscount = pricing.voucherDiscount;
          const grandTotal = pricing.grandTotal;
          const downpaymentAmount = isDownpayment
            ? pricing.downpaymentAmount
            : null;
          const principalAmountForInitialPayment = isDownpayment
            ? downpaymentAmount || 0
            : grandTotal;
          const amountPaid =
            isOnlinePayment && paymentConfirmed
              ? principalAmountForInitialPayment
              : !isOnlinePayment && isWalkIn
                ? (isDownpayment ? principalAmountForInitialPayment : grandTotal)
                : 0;
          const paymentStatus = resolvePaymentStatus(grandTotal, amountPaid);

          const booking = await tx.booking.create({
            data: {
              business_id: business.id,
              customer_id: finalCustomerId,
              grand_total: grandTotal,
              total_discount: finalVoucherDiscount,
              payment_method: paymentMethod,
              paymongo_checkout_session_id: paymongoCheckoutSessionId,
              paymongo_payment_intent_id: paymongoPaymentIntentId,
              paymongo_payment_method_id: paymongoPaymentMethodId,
              paymongo_payment_id: paymongoPaymentId,
              status: bookingStatus,
              payment_status: paymentStatus,
              amount_paid: amountPaid,
              hold_expires_at: holdExpiresAt,
              sale_event_id: appliedSaleEventId,
              scheduled_at: scheduledAt,
              estimated_end: pricing.estimatedEnd,
              capacity_override_applied: allowWalkInCapacityBypass,
              capacity_override_reason: allowWalkInCapacityBypass
                ? capacityOverride?.reason || null
                : null,
              capacity_override_note: allowWalkInCapacityBypass
                ? (capacityOverride?.note || null)
                : null,
              downpayment: downpaymentAmount,
              availed_services: {
                create: validatedServices.map((service, index) => {
                  const serviceDuration = service.duration || 30;
                  const previousDurations = validatedServices
                    .slice(0, index)
                    .reduce(
                      (sum, prev) => sum + (prev.duration || 30) * prev.quantity,
                      0,
                    );

                  const serviceStart = new Date(
                    scheduledAt.getTime() + previousDurations * 60 * 1000,
                  );
                  const serviceEnd = new Date(
                    serviceStart.getTime() +
                      serviceDuration * service.quantity * 60 * 1000,
                  );

                  const isClaimed =
                    service.claimedByCurrentEmployee && !!currentEmployeeId;
                  const serverId = isClaimed
                    ? currentEmployeeId
                    : staffResolution.assignedEmployeeId;
                  const status = isClaimed ? "CLAIMED" : "PENDING";
                  const claimedAt = isClaimed ? getCurrentDateTimePH() : null;
                  const originalPrice = service.originalPrice;
                  const finalPrice = service.price;
                  const discount = service.discount;
                  const discountReason =
                    service.discountReason ||
                    (discount > 0 ? "PACKAGE_OR_MANUAL" : null);

                  return {
                    service_id: service.id,
                    price: originalPrice,
                    estimated_cost: service.estimatedCost,
                    discount,
                    discount_reason: discountReason,
                    final_price: finalPrice,
                    commission_base: service.commissionBase || finalPrice,
                    served_by_id: serverId,
                    served_by_type: serverId ? "EMPLOYEE" : null,
                    status,
                    claimed_at: claimedAt,
                    scheduled_at: serviceStart,
                    estimated_end: serviceEnd,
                    package_id: service.packageId,
                  };
                }),
              },
            },
          });

          if (pricing.voucher?.id) {
            const reserveVoucher = await tx.voucher.updateMany({
              where: {
                id: pricing.voucher.id,
                is_active: true,
                used_by_id: null,
              },
              data: {
                used_by_id: booking.id,
                is_active: false,
              },
            });

            if (reserveVoucher.count === 0) {
              throw new Error("Voucher is no longer available");
            }
          }

          if (isOnlinePayment) {
            const paymentTypeForRecord: BookingPaymentType = isDownpayment
              ? BookingPaymentType.DOWNPAYMENT
              : BookingPaymentType.FULL;

            await tx.bookingPayment.create({
              data: {
                booking_id: booking.id,
                type: paymentTypeForRecord,
                status: paymentConfirmed ? "SUCCEEDED" : "PENDING",
                payment_method: "QRPH",
                amount_principal: principalAmountForInitialPayment,
                amount_charged: pricing.amountToPay,
                paymongo_payment_intent_id: paymongoPaymentIntentId,
                paymongo_payment_method_id: paymongoPaymentMethodId,
                paymongo_payment_id: paymongoPaymentId,
                expires_at: paymentConfirmed ? null : holdExpiresAt,
                paid_at: paymentConfirmed ? getCurrentDateTimePH() : null,
              },
            });
          }

          const eventType =
            bookingStatus === "ACCEPTED"
              ? "BOOKING_CONFIRMED"
              : "BOOKING_CREATED";

          await publishEvent(tx as Prisma.TransactionClient, {
            type: eventType,
            aggregateType: "Booking",
            aggregateId: String(booking.id),
            businessId: business.id,
            payload: {
              bookingId: booking.id,
              customerName,
              email: normalizedEmail,
              scheduledAt: scheduledAt.toISOString(),
              estimatedEnd: pricing.estimatedEnd.toISOString(),
              grandTotal,
              status: bookingStatus,
              isWalkIn,
            },
          });

          return booking;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < maxRetries - 1
      ) {
        attempt += 1;
        continue;
      }
      throw error;
    }
  }

  throw new BookingAvailabilityError(
    "SLOT_JUST_TAKEN",
    "That slot was just taken. Please pick another slot.",
  );
}
