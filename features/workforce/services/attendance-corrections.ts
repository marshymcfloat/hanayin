import "server-only";
import { z } from "zod";
import { prisma } from "@/prisma/prisma";
import { requireCurrentPayrollEmployee, requireCurrentWorkforceOwner, runWorkforcePayrollCommand, assertPayrollRevision, payrollJson, payrollFingerprint, PayrollError, type PayrollIdentity, attendanceCorrectionSchema, payrollDate } from "@/features/payroll/public";
import { correctPayrollAttendanceWithinTransaction } from "./payroll-attendance";
import { logAudit } from "@/lib/services/audit";

const fields = attendanceCorrectionSchema.shape;
export const correctionRequestSchema = z.object({ key: fields.key, expectedRevision: fields.expectedRevision, date: fields.date, status: fields.status, startedAt: fields.startedAt, endedAt: fields.endedAt, breaks: fields.breaks, reason: fields.reason, confirmFullDay: fields.confirmFullDay });
export const correctionDecisionSchema = z.object({ key: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), requestId: z.string().uuid(), decision: z.enum(["APPROVED", "REJECTED"]), comment: z.string().trim().min(5).max(1000) });
export async function requestAttendanceCorrection(identity: PayrollIdentity, input: z.infer<typeof correctionRequestSchema>) {
  return prisma.$transaction(async tx => {
    const actor = await requireCurrentPayrollEmployee(identity, tx);
    attendanceCorrectionSchema.parse({ ...input, employeeId: actor.employeeId });
    const existing = await tx.attendanceCorrectionRequest.findUnique({ where: { business_id_command_key: { business_id: actor.businessId, command_key: input.key } } });
    if (existing) {
      if (existing.employee_id !== actor.employeeId || payrollFingerprint(existing.proposed) !== payrollFingerprint(input)) throw new PayrollError("CONFLICT", "This request key was already used.");
      return { id: existing.id };
    }
    const attendance = await tx.employeeAttendance.findFirst({ where: { employee_id: actor.employeeId, employee: { business_id: actor.businessId }, date: new Date(input.date + "T00:00:00+08:00") }, select: { revision: true } });
    assertPayrollRevision(attendance?.revision ?? 0, input.expectedRevision);
    const record = await tx.attendanceCorrectionRequest.create({ data: { business_id: actor.businessId, employee_id: actor.employeeId, work_date: payrollDate(input.date), proposed: payrollJson(input), source_revision: input.expectedRevision, reason: input.reason, command_key: input.key } });
    await logAudit(tx, { businessId: actor.businessId, actorId: actor.userId, entityType: "AttendanceCorrectionRequest", entityId: record.id, action: "CREATED", changes: { after: { work_date: input.date } } });
    return { id: record.id };
  }, { isolationLevel: "Serializable" });
}
export async function decideAttendanceCorrection(identity: PayrollIdentity, input: z.infer<typeof correctionDecisionSchema>) {
  return runWorkforcePayrollCommand(identity, "ATTENDANCE_CORRECTION_DECISION", input, async (tx, actor) => {
    const record = await tx.attendanceCorrectionRequest.findFirst({ where: { id: input.requestId, business_id: actor.businessId } });
    if (!record) throw new PayrollError("NOT_FOUND", "Correction request not found.");
    assertPayrollRevision(record.revision, input.expectedRevision);
    if (record.status !== "PENDING") throw new PayrollError("BLOCKED", "This request was already decided.");
    if (input.decision === "APPROVED") await correctPayrollAttendanceWithinTransaction(tx, actor, attendanceCorrectionSchema.parse({ ...(record.proposed as object), key: input.key, employeeId: record.employee_id, expectedRevision: record.source_revision, reason: input.comment }));
    const updated = await tx.attendanceCorrectionRequest.update({ where: { id: record.id }, data: { status: input.decision, reviewed_by: actor.userId, reviewed_at: new Date(), review_comment: input.comment, revision: { increment: 1 } } });
    return { id: updated.id, revision: updated.revision };
  }, "WORKFORCE_MANAGE");
}
export async function attendanceCorrectionRequests(identity: PayrollIdentity) {
  const actor = await requireCurrentWorkforceOwner(identity, prisma, "WORKFORCE_MANAGE");
  const entries = await prisma.attendanceCorrectionRequest.findMany({ where: { business_id: actor.businessId, status: "PENDING" }, include: { employee: { select: { user: { select: { name: true } } } } }, orderBy: { created_at: "asc" }, take: 100 });
  await requireCurrentWorkforceOwner(identity, prisma, "WORKFORCE_MANAGE");
  return entries.map(entry => {
    const proposal = attendanceCorrectionSchema.parse({ ...(entry.proposed as object), employeeId: entry.employee_id });
    return { id: entry.id, employeeName: entry.employee.user.name, date: entry.work_date.toISOString().slice(0, 10), reason: entry.reason, revision: entry.revision, proposed: { status: proposal.status, startedAt: proposal.startedAt, endedAt: proposal.endedAt, breaks: proposal.breaks, fullDay: proposal.confirmFullDay } };
  });
}
export async function myAttendanceCorrectionSource(identity: PayrollIdentity, date: string) {
  const actor = await requireCurrentPayrollEmployee(identity);
  const source = await prisma.employeeAttendance.findFirst({ where: { employee_id: actor.employeeId, employee: { business_id: actor.businessId }, date: new Date(date + "T00:00:00+08:00") }, select: { revision: true, status: true } });
  return { revision: source?.revision ?? 0, status: source?.status ?? "PRESENT" };
}
