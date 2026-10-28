"use server";

import { revalidatePath, updateTag } from "next/cache";

import {
  getDailyAttendanceForTenant,
  getEmployeeAttendanceHistoryForTenant,
} from "@/features/workforce/queries/attendance-admin";
import {
  attendanceImpactInputSchema,
  dailyAttendanceInputSchema,
  employeeAttendanceInputSchema,
  updateAttendanceInputSchema,
} from "@/features/workforce/schemas/attendance-admin";
import {
  previewTenantAttendanceImpact,
  updateTenantAttendanceStatus,
} from "@/features/workforce/services/attendance-admin";
import type { AttendanceImpactBooking } from "@/features/workforce/types/attendance";
import { requireAuth } from "@/lib/auth/guards";
import type { AttendanceStatus } from "@/prisma/generated/prisma/enums";
import { Role } from "@/prisma/generated/prisma/enums";
import { currentWorkforceOwner } from "@/features/workforce/workforce-access";

async function requireOwnerAccess(write = false) {
  const auth = await requireAuth(write ? { write: true } : undefined);
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) {
    return { success: false as const, error: "Forbidden" };
  }
  if (!await currentWorkforceOwner(auth.businessSlug, auth.session.user.id)) return { success: false as const, error: "Forbidden" };
  return auth;
}

export async function getDailyAttendance(businessId: string, date: Date) {
  const auth = await requireOwnerAccess();
  if (!auth.success) return auth;

  const input = dailyAttendanceInputSchema.safeParse({ businessId, date });
  if (!input.success) {
    return { success: false as const, error: "Invalid attendance request" };
  }

  try {
    const data = await getDailyAttendanceForTenant(
      auth.businessSlug,
      input.data.businessId,
      input.data.date,
    );
    if (!data) return { success: false as const, error: "Unauthorized" };
    return { success: true as const, data };
  } catch (error) {
    console.error("Failed to fetch daily attendance:", error);
    return { success: false as const, error: "Failed to fetch attendance" };
  }
}

export async function updateAttendanceStatus(
  employeeId: number,
  date: Date,
  status: AttendanceStatus,
) {
  const auth = await requireOwnerAccess(true);
  if (!auth.success) return auth;

  const input = updateAttendanceInputSchema.safeParse({
    employeeId,
    date,
    status,
  });
  if (!input.success) {
    return { success: false as const, error: "Invalid attendance update" };
  }

  try {
    const result = await updateTenantAttendanceStatus(
      auth.businessSlug,
      input.data.employeeId,
      input.data.date,
      input.data.status,
      auth.session.user.id,
    );
    if (result.success) {
      updateTag(`attendance-history-${auth.businessSlug}`);
      revalidatePath("/", "layout");
    }
    return result;
  } catch (error) {
    console.error("Failed to update attendance status:", error);
    return { success: false as const, error: "Failed to update status" };
  }
}

export async function previewAttendanceImpactAction(
  employeeId: number,
  date: Date,
): Promise<
  | { success: true; bookings: AttendanceImpactBooking[] }
  | { success: false; error: string }
> {
  const auth = await requireOwnerAccess(true);
  if (!auth.success) return auth;

  const input = attendanceImpactInputSchema.safeParse({ employeeId, date });
  if (!input.success) {
    return { success: false, error: "Invalid attendance request" };
  }

  try {
    const bookings = await previewTenantAttendanceImpact(
      auth.businessSlug,
      input.data.employeeId,
      input.data.date,
    );
    if (!bookings) return { success: false, error: "Unauthorized" };
    return { success: true, bookings };
  } catch (error) {
    console.error("Failed to preview attendance impact:", error);
    return { success: false, error: "Failed to preview impact" };
  }
}

export async function getEmployeeAttendanceHistory(employeeId: number) {
  const auth = await requireOwnerAccess();
  if (!auth.success) return auth;

  const input = employeeAttendanceInputSchema.safeParse({ employeeId });
  if (!input.success) {
    return { success: false as const, error: "Invalid employee" };
  }

  try {
    const data = await getEmployeeAttendanceHistoryForTenant(
      auth.businessSlug,
      input.data.employeeId,
    );
    return { success: true as const, data };
  } catch (error) {
    console.error("Failed to fetch attendance history:", error);
    return { success: false as const, error: "Failed to fetch history" };
  }
}
