"use server";

import { revalidatePath } from "next/cache";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { logger } from "@/lib/logger";
import { attendanceCountSchema } from "@/features/workforce/attendance-count-schema";
import { getTenantEmployeeAttendanceCount } from "@/features/workforce/queries/attendance-count";
import { attendanceClockInputSchema, attendanceMonthlyInputSchema, attendanceStatusInputSchema } from "@/features/workforce/attendance-self-service-schemas";
import { getSelfServiceAttendanceStatus, getSelfServiceMonthlyAttendance } from "@/features/workforce/queries/attendance-self-service";
import { clockInSelfServiceAttendance, clockOutSelfServiceAttendance } from "@/features/workforce/services/attendance-self-service";

export async function checkAttendanceStatusAction(employeeId: number, date: Date = getCurrentDateTimePH()) {
  const parsed = attendanceStatusInputSchema.safeParse({ employeeId, date });
  if (!parsed.success) return { success: false as const, error: "Invalid attendance query" };
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth;
    return await getSelfServiceAttendanceStatus({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data);
  } catch { return { success: false as const, error: "Failed to check status" }; }
}

export async function clockInAction(employeeId: number, latitude: number, longitude: number, businessSlug: string) {
  const parsed = attendanceClockInputSchema.safeParse({ employeeId, latitude, longitude, businessSlug });
  if (!parsed.success) return { success: false as const, error: "Invalid attendance input" };
  try {
    const auth = await requireAuth({ write: true });
    if (!auth.success) return auth;
    if (auth.businessSlug !== parsed.data.businessSlug) return { success: false as const, error: "Unauthorized business context" };
    const result = await clockInSelfServiceAttendance({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data);
    if (result.success) {
      try { revalidatePath(`/${auth.businessSlug}`); }
      catch { try { logger.warn("[Attendance] Cache refresh failed after clock-in"); } catch {} }
    }
    return result;
  } catch { return { success: false as const, error: "Failed to clock in" }; }
}

export async function clockOutAction(employeeId: number, latitude: number, longitude: number, businessSlug: string) {
  const parsed = attendanceClockInputSchema.safeParse({ employeeId, latitude, longitude, businessSlug });
  if (!parsed.success) return { success: false as const, error: "Invalid attendance input" };
  try {
    const auth = await requireAuth({ write: true });
    if (!auth.success) return auth;
    if (auth.businessSlug !== parsed.data.businessSlug) return { success: false as const, error: "Unauthorized business context" };
    const result = await clockOutSelfServiceAttendance({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data);
    if (result.success) {
      try { revalidatePath("/[businessSlug]", "page"); }
      catch { try { logger.warn("[Attendance] Cache refresh failed after clock-out"); } catch {} }
    }
    return result;
  } catch { return { success: false as const, error: "Failed to clock out" }; }
}

export async function getMonthlyAttendanceAction(employeeId: number, year: number, month: number) {
  const parsed = attendanceMonthlyInputSchema.safeParse({ employeeId, year, month });
  if (!parsed.success) return { success: false as const, error: "Invalid attendance query" };
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth;
    return await getSelfServiceMonthlyAttendance({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data);
  } catch { return { success: false as const, error: "Failed to fetch monthly attendance" }; }
}

export async function getAttendanceCountAction(
  employeeId: number,
  startDate: Date,
  endDate: Date,
) {
  const auth = await requireAuth();
  if (!auth.success) return { success: false as const, error: "Unauthorized" };
  const parsed = attendanceCountSchema.safeParse({ employeeId, startDate, endDate });
  if (!parsed.success) return { success: false as const, error: "Invalid attendance query" };

  try {
    const actor = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!actor.success || (actor.actorType === "EMPLOYEE" && actor.employeeId !== parsed.data.employeeId)) {
      return { success: false as const, error: "Unauthorized" };
    }
    return await getTenantEmployeeAttendanceCount({ ...parsed.data, businessId: actor.businessId });
  } catch (error) {
    console.error("Error fetching attendance count:", error);
    return { success: false as const, error: "Failed to fetch attendance count" };
  }
}
