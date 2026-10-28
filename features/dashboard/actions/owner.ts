"use server";

// Feature-owned Server Action boundary.

import {
  BookingStatus,
  StaffPermission,
} from "@/prisma/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { hasStaffPermission, resolveTenantActorContext } from "@/lib/auth/staff-access";
import { ownerQueueServiceIdSchema } from "@/features/dashboard/owner-queue-schemas";
import { claimOwnerService, unclaimOwnerService } from "@/features/dashboard/services/owner-queue-claims";
import { serveOwnerService, undoOwnerServiceServing } from "@/features/dashboard/services/owner-queue-serving";
import { bookingNoShowIdSchema } from "@/features/bookings/booking-no-show-schemas";
import { markBookingNoShow } from "@/features/bookings/services/booking-no-show";
import { updateBookingStatusSchema } from "@/features/bookings/booking-status-schemas";
import { completeBookingManually } from "@/features/bookings/services/booking-status";
import { bookingDeletionIdSchema } from "@/features/bookings/booking-deletion-schemas";
import { deleteBookingPermanently } from "@/features/bookings/services/booking-deletion";

export async function claimServiceAsOwnerAction(serviceId: number) {
  const validation = ownerQueueServiceIdSchema.safeParse({ serviceId });
  if (!validation.success) return { success: false, error: "Invalid input" };
  try {
    const auth = await requireAuth({ write: true });
    if (!auth.success) return auth;
    if (auth.session.user.role !== "OWNER") return { success: false, error: "Unauthorized" };
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success || context.actorType !== "OWNER") return { success: false, error: "Owner not found" };
    const result = await claimOwnerService(context, validation.data.serviceId);
    if (result.success) { try { revalidatePath(`/app/${context.businessSlug}`); } catch { /* The write already committed. */ } }
    return result;
  } catch { return { success: false, error: "Unable to claim service." }; }
}

export async function unclaimServiceAsOwnerAction(serviceId: number) {
  const validation = ownerQueueServiceIdSchema.safeParse({ serviceId });
  if (!validation.success) return { success: false, error: "Invalid input" };
  try {
    const auth = await requireAuth({ write: true });
    if (!auth.success) return auth;
    if (auth.session.user.role !== "OWNER") return { success: false, error: "Unauthorized" };
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success || context.actorType !== "OWNER") return { success: false, error: "Owner not found" };
    const result = await unclaimOwnerService(context, validation.data.serviceId);
    if (result.success) { try { revalidatePath(`/app/${context.businessSlug}`); } catch { /* The write already committed. */ } }
    return result;
  } catch { return { success: false, error: "Unable to unclaim service." }; }
}

export async function markServiceServedAsOwnerAction(serviceId: number) {
  const validation = ownerQueueServiceIdSchema.safeParse({ serviceId });
  if (!validation.success) return { success: false, error: "Invalid input" };
  try {
    const auth = await requireAuth({ write: true });
    if (!auth.success) return auth;
    if (auth.session.user.role !== "OWNER") return { success: false, error: "Unauthorized" };
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success || context.actorType !== "OWNER") return { success: false, error: "Owner not found" };
    const result = await serveOwnerService(context, validation.data.serviceId);
    if (result.success) { try { revalidatePath(`/app/${context.businessSlug}`); } catch { /* The write already committed. */ } }
    return result;
  } catch { return { success: false, error: "Unable to mark as served." }; }
}

export async function unserveServiceAsOwnerAction(serviceId: number) {
  const validation = ownerQueueServiceIdSchema.safeParse({ serviceId });
  if (!validation.success) return { success: false, error: "Invalid input" };
  try {
    const auth = await requireAuth({ write: true });
    if (!auth.success) return auth;
    if (auth.session.user.role !== "OWNER") return { success: false, error: "Unauthorized" };
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success || context.actorType !== "OWNER") return { success: false, error: "Owner not found" };
    const result = await undoOwnerServiceServing(context, validation.data.serviceId);
    if (result.success) { try { revalidatePath(`/app/${context.businessSlug}`); } catch { /* The write already committed. */ } }
    return result;
  } catch { return { success: false, error: "Unable to unserve." }; }
}

export async function updateBookingStatusAction(
  bookingId: number,
  status: BookingStatus,
) {
  const validation = updateBookingStatusSchema.safeParse({ bookingId, status });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  if (validation.data.status === BookingStatus.CANCELLED) {
    return { success: false, error: "Use the cancellation workflow and provide a reason." };
  }

  if (validation.data.status !== BookingStatus.COMPLETED) return { success: false, error: "Unsupported manual status transition." };
  try {
    const auth = await requireAuth({ write: true });
    if (!auth.success) return auth;
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success) return { success: false, error: context.error === "Unauthorized" ? "Unauthorized" : "Forbidden" };
    if (!hasStaffPermission(context, StaffPermission.BOOKING_MODIFY)) return { success: false, error: "Forbidden" };
    const result = await completeBookingManually(context, validation.data.bookingId);
    if (result.success) { try { revalidatePath(`/app/${context.businessSlug}`); } catch { /* The write already committed. */ } }
    return result;
  } catch { return { success: false, error: "Failed to update status" }; }
}

export async function markBookingNoShowAction(bookingId: number) {
  const validation = bookingNoShowIdSchema.safeParse(bookingId);
  if (!validation.success) return { success: false, error: "Invalid input" };
  try {
    const auth = await requireAuth({ write: true });
    if (!auth.success) return auth;
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success) return { success: false, error: context.error === "Unauthorized" ? "Unauthorized" : "Forbidden" };
    if (!hasStaffPermission(context, StaffPermission.BOOKING_MARK_NO_SHOW)) return { success: false, error: "Forbidden" };
    const result = await markBookingNoShow(context, validation.data);
    if (result.success) { try { revalidatePath(`/app/${context.businessSlug}`); } catch { /* The write already committed. */ } }
    return result;
  } catch { return { success: false, error: "Failed to mark as no-show." }; }
}

export async function deleteBookingAction(bookingId: number) {
  const validation = bookingDeletionIdSchema.safeParse(bookingId);
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  try {
    const auth = await requireAuth({ write: true });
    if (!auth.success) return auth;
    if (auth.session.user.role !== "OWNER") return { success: false, error: "Unauthorized" };
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success) return { success: false, error: context.error === "Unauthorized" ? "Unauthorized" : "Forbidden" };
    if (context.actorType !== "OWNER") return { success: false, error: "Unauthorized" };
    const result = await deleteBookingPermanently(context, validation.data);
    if (result.success) { try { revalidatePath(`/app/${context.businessSlug}`); } catch { /* The deletion already committed. */ } }
    return result;
  } catch { return { success: false, error: "Failed to delete" }; }
}
