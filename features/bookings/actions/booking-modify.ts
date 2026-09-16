"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import {
  hasStaffPermission,
  resolveTenantActorContext,
} from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/client";
import {
  addBookingNote,
  addBookingNoteSchema,
  adjustBookingPrice,
  adjustBookingPriceSchema,
  cancelBooking,
  cancelBookingSchema,
  reassignBookingStaff,
  reassignBookingStaffSchema,
  removeBookingService,
  removeBookingServiceSchema,
  rescheduleBooking,
  rescheduleBookingSchema,
  swapBookingService,
  swapBookingServiceSchema,
  type AddBookingNoteResult,
  type AdjustBookingPriceResult,
  type CancelBookingResult,
  type ReassignBookingStaffResult,
  type RemoveBookingServiceResult,
  type RescheduleBookingResult,
  type SwapBookingServiceResult,
} from "@/features/bookings/services/booking-modify";

export type {
  AddBookingNoteResult,
  AdjustBookingPriceResult,
  CancelBookingResult,
  ReassignBookingStaffResult,
  RemoveBookingServiceResult,
  RescheduleBookingResult,
  SwapBookingServiceResult,
} from "@/features/bookings/services/booking-modify";

async function requireBookingActor(permission?: StaffPermission) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) {
    return {
      success: false as const,
      error: auth.error,
      code: auth.error === "Unauthorized" ? ("Unauthorized" as const) : undefined,
    };
  }
  const actor = await resolveTenantActorContext(
    auth.businessSlug,
    auth.session.user.id,
  );
  if (!actor.success) {
    return {
      success: false as const,
      error: actor.error,
      code: "Forbidden" as const,
    };
  }
  if (permission && !hasStaffPermission(actor, permission)) {
    return {
      success: false as const,
      error: "Forbidden",
      code: "Forbidden" as const,
    };
  }
  return { success: true as const, actor };
}

function refreshBookingPages(businessSlug: string) {
  revalidatePath(`/app/${businessSlug}`);
  revalidatePath(`/app/${businessSlug}/bookings`);
}

export async function removeBookingServiceAction(
  input: z.input<typeof removeBookingServiceSchema>,
): Promise<RemoveBookingServiceResult> {
  const parsed = removeBookingServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }
  const auth = await requireBookingActor(StaffPermission.BOOKING_MODIFY);
  if (!auth.success) return auth;
  const result = await removeBookingService(parsed.data, auth.actor);
  if (result.success) refreshBookingPages(auth.actor.businessSlug);
  return result;
}

export async function swapBookingServiceAction(
  input: z.input<typeof swapBookingServiceSchema>,
): Promise<SwapBookingServiceResult> {
  const parsed = swapBookingServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }
  const auth = await requireBookingActor(StaffPermission.BOOKING_MODIFY);
  if (!auth.success) return auth;
  const result = await swapBookingService(parsed.data, auth.actor);
  if (result.success) refreshBookingPages(auth.actor.businessSlug);
  return result;
}

export async function rescheduleBookingAction(
  input: z.input<typeof rescheduleBookingSchema>,
): Promise<RescheduleBookingResult> {
  const parsed = rescheduleBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }
  const auth = await requireBookingActor(StaffPermission.BOOKING_MODIFY);
  if (!auth.success) return auth;
  const result = await rescheduleBooking(parsed.data, auth.actor);
  if (result.success) refreshBookingPages(auth.actor.businessSlug);
  return result;
}

export async function reassignBookingStaffAction(
  input: z.input<typeof reassignBookingStaffSchema>,
): Promise<ReassignBookingStaffResult> {
  const parsed = reassignBookingStaffSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }
  const auth = await requireBookingActor(StaffPermission.QUEUE_OVERRIDE_ALL);
  if (!auth.success) return auth;
  const result = await reassignBookingStaff(parsed.data, auth.actor);
  if (result.success) refreshBookingPages(auth.actor.businessSlug);
  return result;
}

export async function adjustBookingPriceAction(
  input: z.input<typeof adjustBookingPriceSchema>,
): Promise<AdjustBookingPriceResult> {
  const parsed = adjustBookingPriceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }
  const auth = await requireBookingActor(StaffPermission.BOOKING_ADJUST_PRICE);
  if (!auth.success) return auth;
  const result = await adjustBookingPrice(parsed.data, auth.actor);
  if (result.success) refreshBookingPages(auth.actor.businessSlug);
  return result;
}

export async function cancelBookingAction(
  input: z.input<typeof cancelBookingSchema>,
): Promise<CancelBookingResult> {
  const parsed = cancelBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }
  const auth = await requireBookingActor(StaffPermission.BOOKING_CANCEL);
  if (!auth.success) return auth;
  const result = await cancelBooking(parsed.data, auth.actor);
  if (result.success) refreshBookingPages(auth.actor.businessSlug);
  return result;
}

export async function addBookingNoteAction(
  input: z.input<typeof addBookingNoteSchema>,
): Promise<AddBookingNoteResult> {
  const parsed = addBookingNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }
  const permission =
    parsed.data.visibility === "CUSTOMER_VISIBLE"
      ? StaffPermission.BOOKING_MODIFY
      : undefined;
  const auth = await requireBookingActor(permission);
  if (!auth.success) return auth;
  const result = await addBookingNote(parsed.data, auth.actor);
  if (result.success) refreshBookingPages(auth.actor.businessSlug);
  return result;
}
