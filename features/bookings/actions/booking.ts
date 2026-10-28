"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { BookingQuoteChangedError, type BookingQuote } from "@/features/bookings/booking-quote";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import {
  createBookingActionSchema,
  type CreateBookingActionInput,
} from "@/features/bookings/schemas";
import {
  createBookingWorkflow,
  requireWritableBookingTenant,
} from "@/features/bookings/services/booking-create";
import { BookingAvailabilityError } from "@/features/bookings/services/booking-availability";
import { resolveCustomerTrust } from "@/features/bookings/services/booking-otp";
import {
  hasStaffPermission,
  resolveTenantActorContext,
} from "@/lib/auth/staff-access";
import {
  clientIpFromForwardedFor,
  normalizeClientIp,
} from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import {
  BOOKING_SUCCESS_TOKEN_TTL_SECONDS,
  createBookingSuccessToken,
} from "@/lib/security/booking-success-token";
import { StaffPermission } from "@/prisma/generated/prisma/enums";

export type CreateBookingResult =
  | { type: "redirect"; url: string; warnings?: string[] }
  | { type: "internal"; url: string; warnings?: string[] }
  | { type: "error"; code: string; quote?: BookingQuote };

const CLIENT_SAFE_BOOKING_ERRORS = new Set([
  "OTP_REQUIRED",
  "OTP_INVALID_OR_EXPIRED",
  "CUSTOMER_RESTRICTED",
  "DATE_OUTSIDE_HORIZON",
  "LEAD_TIME_VIOLATION",
  "PAYMENT_TYPE_NOT_ALLOWED",
  "NO_CAPACITY_FOR_SELECTED_SERVICES",
  "REQUIRED_STAFF_UNAVAILABLE",
  "PREFERRED_STAFF_UNAVAILABLE",
  "WALK_IN_CAPACITY_EXCEEDED",
  "SLOT_JUST_TAKEN",
  "SALE_SLOT_LIMIT_REACHED",
  "GCASH_NOT_CONFIGURED",
]);

function getClientSafeBookingError(error: unknown) {
  if (!(error instanceof Error)) return "BOOKING_FAILED";
  if (CLIENT_SAFE_BOOKING_ERRORS.has(error.message)) return error.message;

  const safeMessagePrefixes = [
    "Invalid or expired voucher code",
    "Minimum spend of ",
    "Public bookings require ",
    "Too many booking attempts",
    "Business not found",
  ];

  return safeMessagePrefixes.some((prefix) => error.message.startsWith(prefix))
    ? error.message
    : "BOOKING_FAILED";
}

export async function createBooking(
  rawInput: CreateBookingActionInput,
): Promise<CreateBookingResult> {
  const parsed = createBookingActionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { type: "error", code: "INVALID_BOOKING_INPUT" };
  }

  const input = parsed.data;
  let publicBooking = false;
  let walkInCapacityBypassAllowed = false;

  try {
    const headersList = await headers();
    const realIp = headersList.get("x-real-ip")?.trim();
    const clientIp = realIp
      ? normalizeClientIp(realIp)
      : clientIpFromForwardedFor(headersList.get("x-forwarded-for"));
    const session = await getServerSession(authOptions);
    publicBooking = !session;

    if (
      session?.user?.businessSlug &&
      session.user.role !== "PLATFORM_ADMIN" &&
      session.user.businessSlug !== input.businessSlug
    ) {
      throw new Error("Forbidden");
    }

    let verifiedCurrentEmployeeId: number | undefined;
    if (session?.user?.role === "OWNER") {
      if (session.user.businessSlug !== input.businessSlug) {
        throw new Error("Forbidden");
      }
      const actorContext = await resolveTenantActorContext(
        input.businessSlug,
        session.user.id,
      );
      if (!actorContext.success || actorContext.actorType !== "OWNER") {
        throw new Error("Unauthorized");
      }
    }
    if (session?.user?.role === "EMPLOYEE") {
      const actorContext = await resolveTenantActorContext(
        input.businessSlug,
        session.user.id,
      );
      if (!actorContext.success || actorContext.actorType !== "EMPLOYEE") {
        throw new Error("Unauthorized");
      }
      if (!hasStaffPermission(actorContext, StaffPermission.BOOKING_CREATE)) {
        throw new Error("Forbidden");
      }
      verifiedCurrentEmployeeId = actorContext.employeeId;
    }

    walkInCapacityBypassAllowed =
      input.isWalkIn === true &&
      (session?.user.role === "OWNER" || session?.user.role === "EMPLOYEE");

    if (!session) {
      const ipLimiter = await rateLimit(
        `public-booking:${input.businessSlug}:${clientIp}`,
        { windowMs: 10 * 60 * 1000, maxRequests: 8 },
      );
      if (!ipLimiter.success) {
        throw new Error(
          "Too many booking attempts. Please wait a few minutes and try again.",
        );
      }

      if (input.phone) {
        const phoneLimiter = await rateLimit(
          `public-booking:phone:${input.businessSlug}:${input.phone.trim()}`,
          { windowMs: 10 * 60 * 1000, maxRequests: 5 },
        );
        if (!phoneLimiter.success) {
          throw new Error(
            "Too many booking attempts. Please wait a few minutes and try again.",
          );
        }
      }
    }

    const tenant = await requireWritableBookingTenant(input.businessSlug);

    if (!session) {
      if (
        input.paymentMethod !== "ONLINE" ||
        input.paymentType !== "DOWNPAYMENT"
      ) {
        throw new Error("Public bookings require a 20% GCash deposit.");
      }
      if (!input.phone) {
        throw new Error("OTP_REQUIRED");
      }

      const trust = await resolveCustomerTrust(
        input.phone,
        input.businessSlug,
      );
      if (trust.tier === "RESTRICTED") {
        throw new Error("CUSTOMER_RESTRICTED");
      }
      if (!input.otpVerificationId || !input.otpVerificationToken) {
        throw new Error("OTP_REQUIRED");
      }

    }

    const outcome = await createBookingWorkflow(
      {
        ...input,
        currentEmployeeId: verifiedCurrentEmployeeId,
        isWalkIn: input.isWalkIn ?? false,
        staffSelectionMode: input.staffSelectionMode ?? "ANY_AVAILABLE",
        isAnonymousWalkIn: input.isAnonymousWalkIn ?? false,
        forceCreateCustomer: input.forceCreateCustomer ?? false,
      },
      {
        businessId: tenant.businessId,
        isPublicBooking: publicBooking,
        allowWalkInCapacityBypass: walkInCapacityBypassAllowed,
        requestScope: createHash("sha256").update(session ? `user:${session.user.id}` : `public:${input.phone}:${input.otpVerificationId}:${input.otpVerificationToken}`).digest("hex"),
      },
    );

    revalidatePath(`/app/${input.businessSlug}`);
    const successUrl = publicBooking
      ? `/${input.businessSlug}/booking/success?bookingId=${outcome.bookingId}&token=${encodeURIComponent(
          createBookingSuccessToken({
            bookingId: outcome.bookingId,
            businessSlug: input.businessSlug,
            purpose: "success",
            ttlSeconds: BOOKING_SUCCESS_TOKEN_TTL_SECONDS,
          }),
        )}`
      : `/app/${input.businessSlug}/bookings/${outcome.bookingId}?created=true`;

    return {
      type: "internal",
      url: successUrl,
      warnings: outcome.warnings.length > 0 ? outcome.warnings : undefined,
    };
  } catch (error) {
    if (error instanceof BookingQuoteChangedError) return { type: "error", code: "QUOTE_CHANGED", quote: error.quote };
    if (error instanceof BookingAvailabilityError) {
      logger.warn("[BookingSubmit] Rejected", {
        businessSlug: input.businessSlug,
        code: error.code,
        isPublicBooking: publicBooking,
      });
      return { type: "error", code: error.code };
    }

    logger.error("[BookingSubmit] Failed", {
      businessSlug: input.businessSlug,
      isPublicBooking: publicBooking,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error("Error creating booking:", error);
    return { type: "error", code: getClientSafeBookingError(error) };
  }
}
