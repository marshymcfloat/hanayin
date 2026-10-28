"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { clientIpFromForwardedFor } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { verifyBookingSuccessToken } from "@/lib/security/booking-success-token";
import {
  bookingManageSchema,
  bookingCustomerCancelSchema,
  bookingCustomerRescheduleSchema,
  type BookingManageInput,
  type BookingCustomerCancelInput,
  type BookingCustomerRescheduleInput,
} from "@/features/bookings/self-serve-schemas";
import {
  cancelBookingByCustomer,
  getBookingForManage,
  rescheduleBookingByCustomer,
} from "@/features/bookings/services/booking-self-serve";
import type { BookingForManage } from "@/features/bookings/self-serve-types";

async function applyManageRateLimit(bookingId: number, action: "cancel" | "reschedule") {
  const headersList = await headers();
  const clientIp = clientIpFromForwardedFor(headersList.get("x-forwarded-for"));
  const limiter = await rateLimit(
    `self-serve:${action}:booking:${bookingId}`,
    { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  );
  if (!limiter.success) {
    throw new Error("Too many attempts. Please try again later.");
  }
  const ipLimiter = await rateLimit(
    `self-serve:${action}:ip:${clientIp}`,
    { windowMs: 60 * 60 * 1000, maxRequests: 30 },
  );
  if (!ipLimiter.success) {
    throw new Error("Too many attempts. Please try again later.");
  }
}

export async function getBookingForManageAction(
  rawInput: BookingManageInput,
): Promise<
  | { success: true; booking: BookingForManage }
  | { success: false; error: string }
> {
  const parsed = bookingManageSchema.safeParse(rawInput);
  if (!parsed.success ||
    !verifyBookingSuccessToken({ ...parsed.data, purpose: "manage" })) {
    return { success: false, error: "Invalid or expired link." };
  }
  try {
    return await getBookingForManage(parsed.data);
  } catch (error) {
    logger.warn("[BookingSelfServe] Manage read failed", {
      bookingId: parsed.data.bookingId,
      businessSlug: parsed.data.businessSlug,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "Could not load the booking." };
  }
}

async function invalidateSuccessfulMutation(
  input: BookingManageInput,
  action: "cancel" | "reschedule",
) {
  try {
    revalidatePath(`/${input.businessSlug}/booking/manage`);
    revalidatePath(`/app/${input.businessSlug}/bookings`);
    logger.info(`[BookingSelfServe] ${action === "cancel" ? "Cancelled" : "Rescheduled"} by customer`, {
      bookingId: input.bookingId,
      businessSlug: input.businessSlug,
    });
    return { success: true as const };
  } catch (error) {
    logger.warn(`[BookingSelfServe] ${action === "cancel" ? "Cancel" : "Reschedule"} failed`, {
      bookingId: input.bookingId,
      businessSlug: input.businessSlug,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { success: false as const, error: `Could not ${action} the booking.` };
  }
}

export async function cancelBookingByCustomerAction(
  rawInput: BookingCustomerCancelInput,
) {
  const parsed = bookingCustomerCancelSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false as const, error: "Invalid or expired link." };
  const input = parsed.data;
  await applyManageRateLimit(input.bookingId, "cancel");
  if (!verifyBookingSuccessToken({ ...input, purpose: "manage" })) {
    return { success: false as const, error: "Invalid or expired link." };
  }
  const result = await cancelBookingByCustomer(input);
  return result.success ? invalidateSuccessfulMutation(input, "cancel") : result;
}

export async function rescheduleBookingByCustomerAction(
  rawInput: BookingCustomerRescheduleInput,
) {
  const parsed = bookingCustomerRescheduleSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false as const, error: "Could not reschedule the booking." };
  const input = parsed.data;
  await applyManageRateLimit(input.bookingId, "reschedule");
  if (!verifyBookingSuccessToken({ ...input, purpose: "manage" })) {
    return { success: false as const, error: "Invalid or expired link." };
  }
  const result = await rescheduleBookingByCustomer(input);
  return result.success ? invalidateSuccessfulMutation(input, "reschedule") : result;
}
