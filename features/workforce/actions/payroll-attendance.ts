"use server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { attendanceCorrectionSchema } from "@/features/payroll/public";
import { correctPayrollAttendance, getPayrollAttendanceReview } from "@/features/workforce/services/payroll-attendance";
import { z } from "zod";

export async function correctPayrollAttendanceAction(input: unknown) {
  const parsed = attendanceCorrectionSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, code: "INVALID_INPUT" as const, error: parsed.error.issues[0]?.message ?? "Invalid correction" };
  const auth = await requireAuth({ write: true });
  if (!auth.success) return { success: false as const, code: "FORBIDDEN" as const, error: auth.error };
  const result = await correctPayrollAttendance({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data);
  if (result.success) for (const page of ["attendance", "payroll", "my-pay"]) revalidatePath("/app/" + auth.businessSlug + "/" + page);
  return result;
}

export async function getPayrollAttendanceReviewAction(employeeId: number, date: string) {
  const parsed = z.object({ employeeId: z.number().int().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse({ employeeId, date });
  if (!parsed.success) return { success: false as const, error: "Invalid attendance selection." };
  const auth = await requireAuth(); if (!auth.success) return auth;
  try {
    return { success: true as const, data: await getPayrollAttendanceReview({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, employeeId, date) };
  } catch { return { success: false as const, error: "Attendance review is unavailable." }; }
}
