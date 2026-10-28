"use server";
import { requireAuth } from "@/lib/auth/guards";
import { revalidatePath } from "next/cache";
import { correctionRequestSchema, correctionDecisionSchema, requestAttendanceCorrection, decideAttendanceCorrection, attendanceCorrectionRequests, myAttendanceCorrectionSource } from "@/features/workforce/services/attendance-corrections";
import { PayrollError } from "@/features/payroll/public";
import { z } from "zod";

export async function requestAttendanceCorrectionAction(input: unknown) {
  const parsed = correctionRequestSchema.safeParse(input); if (!parsed.success) return { success: false as const, error: "Check the proposed attendance and correction reason." };
  const auth = await requireAuth({ write: true }); if (!auth.success) return auth;
  try { return { success: true as const, ...await requestAttendanceCorrection({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Correction request could not be saved. Refresh and retry." }; }
}
export async function decideAttendanceCorrectionAction(input: unknown) {
  const parsed = correctionDecisionSchema.safeParse(input); if (!parsed.success) return { success: false as const, code: "INVALID_INPUT" as const, error: "A review decision and comment are required." };
  const auth = await requireAuth({ write: true }); if (!auth.success) return { success: false as const, code: "FORBIDDEN" as const, error: auth.error };
  const result = await decideAttendanceCorrection({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data);
  if (result.success) revalidatePath("/app/" + auth.businessSlug + "/attendance");
  return result;
}
export async function getPendingAttendanceCorrectionsAction() {
  const auth = await requireAuth(); if (!auth.success) return auth;
  try { return { success: true as const, data: await attendanceCorrectionRequests({ businessSlug: auth.businessSlug, userId: auth.session.user.id }) }; }
  catch { return { success: false as const, error: "Attendance correction requests are unavailable." }; }
}
export async function getMyAttendanceCorrectionSourceAction(date: string) {
  if (!z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(date).success) return { success: false as const, error: "Choose a valid work date." };
  const auth = await requireAuth(); if (!auth.success) return auth;
  try {
    return { success: true as const, data: await myAttendanceCorrectionSource({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, date) };
  } catch { return { success: false as const, error: "Attendance source is unavailable." }; }
}
