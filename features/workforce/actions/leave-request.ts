"use server";

import { revalidatePath } from "next/cache";
import type {
  LeaveRequestStatus,
} from "@/prisma/generated/prisma/enums";
import { Role } from "@/prisma/generated/prisma/enums";
import { requireAuth } from "@/lib/auth/guards";
import {
  createLeaveRequestSchema,
  leaveRequestIdSchema,
  updateLeaveRequestStatusSchema,
} from "@/features/workforce/schemas/leave-request";
import {
  cancelTenantLeaveRequest,
  createTenantLeaveRequest,
  updateTenantLeaveRequestStatus,
} from "@/features/workforce/services/leave-request";

export async function createLeaveRequest(data: unknown) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;

  const validated = createLeaveRequestSchema.safeParse(data);
  if (!validated.success) {
    return { success: false as const, error: validated.error.message };
  }
  if (auth.businessSlug !== validated.data.businessSlug) {
    return { success: false as const, error: "Unauthorized" };
  }

  try {
    const result = await createTenantLeaveRequest(validated.data, {
      businessSlug: auth.businessSlug,
      userId: auth.session.user.id,
      role: auth.session.user.role,
    });
    if (!result.success) return result;
    revalidatePath(`/app/${auth.businessSlug}/attendance`);
    revalidatePath(`/app/${auth.businessSlug}/leave-requests`);
    return { success: true as const };
  } catch (error) {
    console.error("Failed to create leave request:", error);
    return { success: false as const, error: "Failed to create leave request" };
  }
}

export async function cancelLeaveRequest(requestId: number) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const validated = leaveRequestIdSchema.safeParse(requestId);
  if (!validated.success) {
    return { success: false as const, error: validated.error.message };
  }

  try {
    const result = await cancelTenantLeaveRequest(validated.data, {
      businessSlug: auth.businessSlug,
      userId: auth.session.user.id,
      role: auth.session.user.role,
    });
    if (!result.success) return result;
    revalidatePath(`/app/${auth.businessSlug}/attendance`);
    return { success: true as const };
  } catch (error) {
    console.error("Failed to cancel leave request:", error);
    return { success: false as const, error: "Failed to cancel leave request" };
  }
}

export async function updateLeaveRequestStatus(
  requestId: number,
  status: LeaveRequestStatus,
  adminComment?: string,
  isPaid?: boolean,
) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) {
    return { success: false as const, error: "Forbidden" };
  }

  const validated = updateLeaveRequestStatusSchema.safeParse({
    requestId,
    status,
    adminComment,
    isPaid,
  });
  if (!validated.success) {
    return { success: false as const, error: validated.error.message };
  }

  try {
    const result = await updateTenantLeaveRequestStatus(
      validated.data.requestId,
      validated.data.status,
      validated.data.adminComment,
      validated.data.isPaid,
      {
        businessSlug: auth.businessSlug,
        userId: auth.session.user.id,
        role: auth.session.user.role,
      },
    );
    if (!result.success) return result;
    revalidatePath(`/app/${auth.businessSlug}/attendance`);
    return { success: true as const };
  } catch (error) {
    console.error("Failed to update leave request status:", error);
    return {
      success: false as const,
      error: "Failed to update leave request status",
    };
  }
}
