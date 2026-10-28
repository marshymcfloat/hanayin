import "server-only";
import type { z } from "zod";
import { runWorkforcePayrollCommand, assertPayrollRevision, payrollJson, PayrollError, type PayrollIdentity, payrollDate, attendanceCorrectionSchema, workMinutes } from "@/features/payroll/public";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { currentWorkforceOwner } from "@/features/workforce/workforce-access";

export async function correctPayrollAttendance(identity: PayrollIdentity, input: z.infer<typeof attendanceCorrectionSchema>) {
  return runWorkforcePayrollCommand(identity, "ATTENDANCE_CORRECTION", input, async (tx, actor) => correctPayrollAttendanceWithinTransaction(tx, actor, input), "WORKFORCE_MANAGE");
}
export async function correctPayrollAttendanceWithinTransaction(tx: Prisma.TransactionClient, actor: { businessId: string; userId: string }, input: z.infer<typeof attendanceCorrectionSchema>) {
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if (input.date > today || (input.endedAt && Date.parse(input.endedAt) > Date.now())) throw new PayrollError("INVALID_INPUT", "Confirm actual work dates and times; future attendance cannot be created.");
    const employee = await tx.employee.findFirst({ where: { id: input.employeeId, business_id: actor.businessId, archived_at: null }, select: { id: true } });
    if (!employee) throw new PayrollError("NOT_FOUND", "Employee not found.");
    const attendanceDate = new Date(input.date + "T00:00:00+08:00");
    const before = await tx.employeeAttendance.findUnique({ where: { employee_id_date: { employee_id: employee.id, date: attendanceDate } } });
    assertPayrollRevision(before?.revision ?? 0, input.expectedRevision);
    if (before?.paid_in_payslip_id || await tx.payrollEarning.findFirst({ where: { business_id: actor.businessId, employee_id: employee.id, source_type: "WORKDAY", source_id: employee.id + ":" + input.date, statement: { is: { status: "PUBLISHED" } } }, select: { id: true } })) throw new PayrollError("BLOCKED", "Published work requires a payroll adjustment; its original evidence stays fixed.");
    if (input.startedAt && input.endedAt) workMinutes([{ startedAt: new Date(input.startedAt), endedAt: new Date(input.endedAt), breaks: input.breaks }], 480);
    if (["PRESENT", "LATE"].includes(input.status) && !input.confirmFullDay && !input.startedAt) throw new PayrollError("INVALID_INPUT", "Confirm the full day or provide reviewed clock times.");
    await tx.workforceSession.deleteMany({ where: { business_id: actor.businessId, employee_id: employee.id, work_date: payrollDate(input.date) } });
    if (input.startedAt && input.endedAt) await tx.workforceSession.create({ data: { business_id: actor.businessId, employee_id: employee.id, work_date: payrollDate(input.date), started_at: new Date(input.startedAt), ended_at: new Date(input.endedAt), breaks: payrollJson(input.breaks), confirmed_at: new Date(), confirmed_by: actor.userId } });
    const data = { status: input.status, time_in: input.startedAt ? new Date(input.startedAt) : null, time_out: input.endedAt ? new Date(input.endedAt) : null, is_paid_leave: false, payroll_confirmed_at: new Date(), payroll_confirmed_by: actor.userId };
    const after = await tx.employeeAttendance.upsert({ where: { employee_id_date: { employee_id: employee.id, date: attendanceDate } }, create: { ...data, employee_id: employee.id, date: attendanceDate, revision: 1 }, update: { ...data, revision: { increment: 1 } } });
    await tx.attendanceRevision.create({ data: { business_id: actor.businessId, employee_id: employee.id, work_date: payrollDate(input.date), before: payrollJson(before ?? {}), after: payrollJson(after), reason: input.reason, actor_id: actor.userId, command_key: input.key } });
    return { id: String(after.id), revision: after.revision };
}
export async function getPayrollAttendanceReview(identity: PayrollIdentity, employeeId: number, date: string) {
  const actor = await currentWorkforceOwner(identity.businessSlug, identity.userId);
  if (!actor) throw new PayrollError("FORBIDDEN", "Forbidden");
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, business_id: actor.business_id, archived_at: null }, select: { id: true } });
  if (!employee) throw new PayrollError("NOT_FOUND", "Employee not found.");
  const entry = await prisma.employeeAttendance.findFirst({ where: { employee_id: employee.id, date: new Date(date + "T00:00:00+08:00"), employee: { business_id: actor.business_id } }, select: { status: true, revision: true, time_in: true, time_out: true, paid_in_payslip_id: true } });
  const published = await prisma.payrollEarning.findFirst({ where: { business_id: actor.business_id, employee_id: employee.id, source_type: "WORKDAY", source_id: employee.id + ":" + date, statement: { is: { status: "PUBLISHED" } } }, select: { id: true } });
  const sessions = await prisma.workforceSession.findMany({ where: { business_id: actor.business_id, employee_id: employee.id, work_date: payrollDate(date) }, select: { breaks: true } });
  if (!await currentWorkforceOwner(identity.businessSlug, identity.userId)) throw new PayrollError("FORBIDDEN", "Forbidden");
  return { revision: entry?.revision ?? 0, status: entry?.status ?? "PRESENT", startedAt: entry?.time_in?.toISOString() ?? "", endedAt: entry?.time_out?.toISOString() ?? "", breaks: sessions.flatMap(session => session.breaks as { start: string; end: string }[]), locked: Boolean(entry?.paid_in_payslip_id || published) };
}
