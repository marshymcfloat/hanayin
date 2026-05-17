import { prisma } from "@/prisma/prisma";
import { publishEvent } from "./outbox";
import {
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
  paymentMethod: "CASH" | "ONLINE";

  paymentType: "FULL" | "DOWNPAYMENT";
  email?: string;
  phone?: string;
  voucherCode?: string;
  totalDiscount?: number;
  isPublicBooking?: boolean;
  isWalkIn?: boolean;
  staffSelectionMode?: StaffSelectionMode;
  capacityOverride?: CapacityOverrideInput;
  allowWalkInCapacityBypass?: boolean;
  pricingSnapshot?: Awaited<ReturnType<typeof buildBookingPricingSnapshot>>;
  /**
   * When true, record the booking without linking it to a Customer record.
   * Reserved for staff-created bookings where the customer chose not to share
   * contact info. customer_id is left null and is_anonymous_walk_in is set.
   * The customerName field becomes the booking's customer_label.
   * Implies isPublicBooking=false (only staff can opt in).
   */
  isAnonymousWalkIn?: boolean;
  /**
   * When true, skip the silent-link path in findExistingCustomerByContact and
   * always create a new Customer row even if a record with the same email/phone
   * exists. Set by the form after staff explicitly confirms "create new anyway"
   * in the duplicate-detection dialog. Ignored for public bookings.
   */
  forceCreateCustomer?: boolean;
};

/**
 * Returned by findDuplicateCustomer when staff submits a new-customer booking
 * whose email or phone matches an existing record. The form surfaces this as
 * a confirmation dialog defaulting to "use existing".
 */
export type DuplicateCustomerCandidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  matchedOn: "email" | "phone";
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
  isPublicBooking = false,
  isWalkIn = false,
  isAnonymousWalkIn = false,
  forceCreateCustomer = false,
  staffSelectionMode = "ANY_AVAILABLE",
  capacityOverride,
  allowWalkInCapacityBypass = false,
  pricingSnapshot,
}: BookingServiceParams) {
  // Anonymous walk-ins are a staff-only path. Public bookings always require a
  // tracked customer (verified by phone OTP).
  const anonymous = isAnonymousWalkIn && !isPublicBooking;
  const normalizedEmail = anonymous ? undefined : normalizeCustomerEmail(email);
  const normalizedPhone = anonymous ? undefined : normalizeCustomerPhone(phone);
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

          let finalCustomerId: string | undefined = anonymous
            ? undefined
            : isPublicBooking
              ? undefined
              : customerId;

          if (anonymous) {
            // Anonymous walk-in: skip all customer resolution. Booking will be
            // written with customer_id=null and customer_label=customerName.
          } else if (finalCustomerId) {
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
            // For staff bookings the form surfaces a duplicate-confirmation
            // dialog before reaching this code (see findDuplicateCustomer).
            // forceCreateCustomer=true means staff confirmed "create new
            // anyway" — skip the silent-link branch entirely.
            const existingCustomer =
              !forceCreateCustomer && !isPublicBooking
                ? await findExistingCustomerByContact({
                    customerDelegate: tx.customer,
                    businessId: business.id,
                    email: normalizedEmail,
                    phone: normalizedPhone,
                  })
                : isPublicBooking
                  ? await findExistingCustomerByContact({
                      customerDelegate: tx.customer,
                      businessId: business.id,
                      email: normalizedEmail,
                      phone: normalizedPhone,
                    })
                  : null;

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
          // Walk-ins pay immediately; all other bookings are settled when services are done
          const amountPaid = isWalkIn
            ? (isDownpayment ? principalAmountForInitialPayment : grandTotal)
            : 0;
          const paymentStatus = resolvePaymentStatus(grandTotal, amountPaid);

          const booking = await tx.booking.create({
            data: {
              business_id: business.id,
              // customer_id is null for anonymous walk-ins; otherwise the
              // resolved Customer.id from the block above.
              customer_id: finalCustomerId ?? null,
              is_anonymous_walk_in: anonymous,
              customer_label: anonymous ? customerName : null,
              grand_total: grandTotal,
              total_discount: finalVoucherDiscount,
              payment_method: paymentMethod,
              status: "ACCEPTED",
              payment_status: paymentStatus,
              amount_paid: amountPaid,
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


          const eventType = "BOOKING_CONFIRMED";

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
              status: "ACCEPTED",
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
      // Postgres EXCLUDE constraint (added in 20260508000000_add_availed_service_overlap_exclusion)
      // fires when two concurrent INSERTs would assign the same employee/owner to
      // overlapping time ranges. Prisma surfaces sqlstate 23P01 as either a known
      // P2010 error or an unknown-request error; match on the constraint name to
      // be robust across versions and convert to SLOT_JUST_TAKEN.
      if (isAvailedServiceOverlapViolation(error)) {
        throw new BookingAvailabilityError(
          "SLOT_JUST_TAKEN",
          "That slot was just taken. Please pick another slot.",
        );
      }
      throw error;
    }
  }

  throw new BookingAvailabilityError(
    "SLOT_JUST_TAKEN",
    "That slot was just taken. Please pick another slot.",
  );
}

/**
 * Recognizes Postgres EXCLUDE constraint violations from the
 * AvailedService overlap-prevention guards (added in
 * 20260508000000_add_availed_service_overlap_exclusion). Exported so
 * the unit suite can verify the matching without spinning up a real
 * transaction; matches by constraint name to stay robust across
 * Prisma versions, since 23P01 surfaces as either P2010 or
 * PrismaClientUnknownRequestError depending on the version.
 */
export function isAvailedServiceOverlapViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) &&
    !(error instanceof Prisma.PrismaClientUnknownRequestError)
  ) {
    return false;
  }
  const message = error.message ?? "";
  return (
    message.includes("AvailedService_employee_no_overlap_excl") ||
    message.includes("AvailedService_owner_no_overlap_excl")
  );
}
