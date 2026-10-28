import "server-only";
import { createHash } from "node:crypto";
import { BookingQuoteChangedError, toBookingQuote } from "@/features/bookings/booking-quote";
import { assertBookingOfferCapacity } from "@/features/bookings/services/booking-offer-capacity";

import { prisma } from "@/prisma/prisma";
import { consumeOtpVerification } from "@/features/bookings/services/booking-otp";
import { publishEvent } from "@/lib/services/outbox";
import { getBookingLifecycleEventType } from "./booking-event-policy";
import { PaymentStatus, Prisma } from "@/prisma/generated/prisma/client";
import {
  BookingServiceInput,
  buildBookingPricingSnapshot,
} from "./booking-pricing";
import {
  buildCustomerProfileUpdateForBooking,
  findExistingCustomerByContact,
  findExistingCustomerByVerifiedPhone,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "./customer-matching";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import {
  BookingAvailabilityError,
  checkSaleEventSlotLimit,
  resolveStaffSelectionOrThrow,
  StaffSelectionMode,
  validateBookingOrThrow,
} from "./booking-availability";
import { isAvailedServiceOverlapViolation } from "./availed-service-overlap";

export type BookingServiceParams = {
  expectedQuoteFingerprint?: string; requestKey?: string; requestScope?: string;
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
  otpVerificationId?: number;
  otpVerificationToken?: string;
  voucherCode?: string;
  totalDiscount?: number;
  isPublicBooking?: boolean;
  isWalkIn?: boolean;
  staffSelectionMode?: StaffSelectionMode;
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

export type BookingPersistenceTransactionHooks = {
  beforeCreate?: (tx: Prisma.TransactionClient) => Promise<void>;
  afterCreate?: (tx: Prisma.TransactionClient, booking: { id: number }) => Promise<void>;
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
  otpVerificationId,
  otpVerificationToken,
  voucherCode,
  isPublicBooking = false,
  isWalkIn = false,
  isAnonymousWalkIn = false,
  forceCreateCustomer = false,
  staffSelectionMode = "ANY_AVAILABLE",
  allowWalkInCapacityBypass = false,
  pricingSnapshot,
  expectedQuoteFingerprint, requestKey, requestScope,
}: BookingServiceParams, hooks?: BookingPersistenceTransactionHooks) {
  const requestHash = createHash("sha256").update(JSON.stringify({ businessSlug, customerId, customerName, services, scheduledAt, employeeId, currentEmployeeId, paymentMethod, paymentType, email, phone, voucherCode, isPublicBooking, isAnonymousWalkIn, forceCreateCustomer, expectedQuoteFingerprint })).digest("hex");
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
          await hooks?.beforeCreate?.(tx);
          if (requestKey && requestScope) {
            const existing = await tx.booking.findFirst({ where: { business: { slug: businessSlug }, request_key: requestKey, request_scope: requestScope } });
            if (existing) {
              if (existing.request_payload_hash !== requestHash) throw new Error("BOOKING_REQUEST_CHANGED");
              return existing;
            }
          }
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
          const hasNewOffers = pricing.appliedOffers?.some(offer => offer.conditional) || pricing.packageSnapshots?.some(pkg => Array.isArray(pkg.choices) && pkg.choices.length);
          if (expectedQuoteFingerprint && expectedQuoteFingerprint !== pricing.quoteFingerprint || hasNewOffers && !expectedQuoteFingerprint) throw new BookingQuoteChangedError(toBookingQuote(pricing));
          if (pricing.appliedOffers?.length) await assertBookingOfferCapacity(tx, business.id, pricing.appliedOffers.map(offer => offer.id));
          if (isPublicBooking) {
            if (!phone || !otpVerificationId || !otpVerificationToken) throw new Error("OTP_REQUIRED");
            const valid = await consumeOtpVerification(tx, otpVerificationId, phone, business.id, otpVerificationToken);
            if (!valid) throw new Error("OTP_INVALID_OR_EXPIRED");
          }
          if (
            isPublicBooking &&
            (!business.gcash_account_name?.trim() ||
              !business.gcash_mobile_number?.trim())
          ) {
            throw new Error("GCASH_NOT_CONFIGURED");
          }
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
              where: { id: finalCustomerId, business_id: business.id },
            });

            if (!existingCustomer) throw new Error("CUSTOMER_NOT_FOUND");

            if (existingCustomer) {
              const shouldUpdateEmail =
                !!normalizedEmail && !existingCustomer.email;
              const shouldUpdatePhone =
                !!normalizedPhone && !existingCustomer.phone;

              if (shouldUpdateEmail || shouldUpdatePhone) {
                await tx.customer.update({
                  where: { id: existingCustomer.id, business_id: business.id },
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
            const existingCustomer = isPublicBooking
              ? await findExistingCustomerByVerifiedPhone({
                  customerDelegate: tx.customer,
                  businessId: business.id,
                  phone: normalizedPhone,
                })
              : !forceCreateCustomer
                ? await findExistingCustomerByContact({
                    customerDelegate: tx.customer,
                    businessId: business.id,
                    email: normalizedEmail,
                    phone: normalizedPhone,
                  })
                : null;

            if (existingCustomer) {
              finalCustomerId = existingCustomer.id;
              const customerUpdate = buildCustomerProfileUpdateForBooking({
                isPublicBooking,
                customerName,
                email: normalizedEmail,
                phone: normalizedPhone,
                existingEmail: existingCustomer.email,
                existingPhone: existingCustomer.phone,
              });

              if (Object.keys(customerUpdate).length > 0) {
                await tx.customer.update({
                  where: { id: existingCustomer.id },
                  data: customerUpdate,
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
          if (appliedSaleEventId && !pricing.appliedOffers?.length) {
            await checkSaleEventSlotLimit({
              saleEventId: appliedSaleEventId,
              db: tx,
            });
          }

          const finalVoucherDiscount = pricing.voucherDiscount;
          const grandTotal = pricing.grandTotal;
          const downpaymentAmount = isDownpayment
            ? isPublicBooking
              ? roundMoney(grandTotal * 0.2)
              : pricing.downpaymentAmount
            : null;
          const principalAmountForInitialPayment = isDownpayment
            ? downpaymentAmount || 0
            : grandTotal;
          // Walk-ins pay immediately; all other bookings are settled when services are done
          const amountPaid = isWalkIn
            ? isDownpayment
              ? principalAmountForInitialPayment
              : grandTotal
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
              ...(requestKey && requestScope ? { request_key: requestKey, request_scope: requestScope, request_payload_hash: requestHash } : {}),
              ...(pricing.quoteFingerprint ? { pricing_snapshot: JSON.parse(JSON.stringify({ version: 1, quoteFingerprint: pricing.quoteFingerprint, services: pricing.services, packages: pricing.packageSnapshots, offers: pricing.appliedOffers, voucherOutcome: pricing.voucherOutcome, voucher: pricing.voucher, grandTotal })) } : {}),
              ...(pricing.appliedOffers?.length ? { offer_applications: { create: pricing.appliedOffers.map(offer => ({ sale_event_id: offer.id, snapshot: offer })) } } : {}),
              total_discount: finalVoucherDiscount,
              payment_method: paymentMethod,
              status: isPublicBooking ? "HOLD" : "ACCEPTED",
              payment_status: paymentStatus,
              amount_paid: amountPaid,
              sale_event_id: appliedSaleEventId,
              scheduled_at: scheduledAt,
              estimated_end: pricing.estimatedEnd,
              hold_expires_at: isPublicBooking
                ? new Date(Date.now() + 30 * 60 * 1000)
                : null,
              capacity_override_applied: allowWalkInCapacityBypass,
              capacity_override_reason: null,
              capacity_override_note: null,
              downpayment: downpaymentAmount,
              availed_services: {
                create: validatedServices.map((service, index) => {
                  const serviceDuration = service.duration || 30;
                  const previousDurations = validatedServices
                    .slice(0, index)
                    .reduce(
                      (sum, prev) =>
                        sum + (prev.duration || 30) * prev.quantity,
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
                    commission_base: service.commissionBase ?? finalPrice,
                    served_by_id: serverId,
                    served_by_type: serverId ? "EMPLOYEE" : null,
                    status,
                    claimed_at: claimedAt,
                    scheduled_at: serviceStart,
                    estimated_end: serviceEnd,
                    package_id: service.packageId,
                    ...(service.selectionKey ? { selection_key: service.selectionKey, package_instance_id: service.packageInstanceId, package_choice_id: service.packageChoiceId, pricing_snapshot: JSON.parse(JSON.stringify(service)) } : {}),
                  };
                }),
              },
            },
          });

          if (isPublicBooking) {
            await tx.bookingPayment.create({
              data: {
                booking_id: booking.id,
                type: "DOWNPAYMENT",
                status: "PENDING",
                payment_method: "ONLINE",
                amount_principal: downpaymentAmount ?? 0,
                amount_charged: downpaymentAmount ?? 0,
                expires_at: booking.hold_expires_at,
              },
            });
          }

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

          // Creation never confirms a booking for notification purposes.
          // Customer confirmation is reserved for the owner-approved public
          // payment transition in manual-gcash.ts.
          const eventType = getBookingLifecycleEventType("BOOKING_CREATED");

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
              status: isPublicBooking ? "HOLD" : "ACCEPTED",
              isWalkIn,
            },
          });

          await hooks?.afterCreate?.(tx, booking);
          return booking;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          ...(hooks ? { maxWait: 5_000, timeout: 10_000 } : {}),
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002" && Boolean(requestKey)) &&
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
export { isAvailedServiceOverlapViolation } from "./availed-service-overlap";
