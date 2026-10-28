import "server-only";
import { z } from "zod";
import { amount, decimal } from "@/features/payroll/money";
import { commandEnvelope } from "./schemas";
import { day, phDay } from "./period";
import { payrollCommand, stale, json, fingerprint } from "./command";
import { PayrollError, type PayrollIdentity } from "./contracts";
import type { Prisma } from "@/prisma/generated/prisma/client";

type LegacySource = Prisma.PayslipGetPayload<{ include: { attendance_records: { select: { id: true } }; availed_services: { select: { id: true } } } }>;
export function legacyFinancialFingerprint(original: LegacySource) {
  return fingerprint({ id: original.id, employeeId: original.employee_id, start: original.starting_date, end: original.ending_date, releasedAt: original.released_at, deduction: original.deduction, status: original.status, salary: original.total_salary, attendanceIds: original.attendance_records.map(source => source.id).sort((a, b) => a - b), serviceIds: original.availed_services.map(source => source.id).sort((a, b) => a - b) });
}

export async function assertLegacyReconciliationCurrent(tx: Prisma.TransactionClient, businessId: string) {
  const checkpoints = await tx.payrollStatement.findMany({ where: { business_id: businessId, legacy_payslip_id: { not: null } }, select: { legacy_payslip_id: true, review_hash: true, snapshot: true } });
  if (!checkpoints.length) return;
  const originals = await tx.payslip.findMany({ where: { employee: { business_id: businessId }, id: { in: checkpoints.map(entry => entry.legacy_payslip_id!) } }, include: { employee: { select: { user: { select: { name: true } } } }, attendance_records: { select: { id: true } }, availed_services: { select: { id: true } } } });
  const sources = new Map(originals.map(original => [original.id, original]));
  const changed = checkpoints.some(entry => {
    const original = sources.get(entry.legacy_payslip_id!);
    if (!original) return true;
    const snapshot = entry.snapshot as { legacyEvidenceVersion?: number; employeeName?: string };
    const hash = snapshot.legacyEvidenceVersion === 2 ? legacyFinancialFingerprint(original) : fingerprint({ ...original, employee: { user: { name: snapshot.employeeName ?? original.employee.user.name } } });
    return hash !== entry.review_hash;
  });
  if (changed) throw new PayrollError("BLOCKED", "Historical payslips changed after reconciliation. Review the preserved records before switching payroll.");
}

export const reconcileLegacySchema = commandEnvelope.extend({ confirmOpening: z.boolean().default(false) });
export async function reconcileLegacy(identity: PayrollIdentity, input: z.infer<typeof reconcileLegacySchema>) {
  return payrollCommand(identity, "LEGACY_RECONCILIATION", input, async (tx, actor) => {
    const settings = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId } });
    if (!settings || settings.mode === "ACTIVE") throw new PayrollError("BLOCKED", "Reconcile while payroll is in shadow mode.");
    stale(settings.revision, input.expectedRevision);
    await assertLegacyReconciliationCurrent(tx, actor.businessId);
    const checkpointed = await tx.payrollStatement.findMany({ where: { business_id: actor.businessId, legacy_payslip_id: { not: null } }, select: { legacy_payslip_id: true } });
    const originals = await tx.payslip.findMany({ where: { employee: { business_id: actor.businessId }, id: { notIn: checkpointed.map(entry => entry.legacy_payslip_id!) } }, orderBy: { id: "asc" }, take: 25,
      // Exclude already checkpointed legacy records without rewriting their evidence.
      include: { employee: { select: { user: { select: { name: true } } } }, attendance_records: { select: { id: true } }, availed_services: { select: { id: true } } },
    });
    let unresolved = 0;
    for (const original of originals) {
      if (original.starting_date > original.ending_date || !Number.isFinite(original.total_salary) || original.total_salary < 0) { unresolved++; continue; }
      if (await tx.payrollStatement.findUnique({ where: { legacy_payslip_id: original.id }, select: { id: true } })) continue;
      const run = await tx.payrollRun.create({ data: { business_id: actor.businessId, start_date: day(phDay(original.starting_date)), end_date: day(phDay(original.ending_date)), payment_date: day(phDay(original.released_at ?? original.ending_date)), kind: "LEGACY", created_by: actor.userId } });
      const statement = await tx.payrollStatement.create({ data: { business_id: actor.businessId, employee_id: original.employee_id, run_id: run.id, legacy_payslip_id: original.id, gross: decimal(original.total_salary), deductions: 0, net: decimal(original.total_salary), employer_cost: decimal(original.total_salary), paid_amount: original.status === "PAID" ? decimal(original.total_salary) : 0, payment_state: original.status === "PAID" ? "PAID" : "UNPAID", review_hash: legacyFinancialFingerprint(original),
        snapshot: json({ employeeName: original.employee.user.name, legacyEvidenceVersion: 2, legacyAggregate: true, legacyStatus: original.status, recordedDeduction: original.deduction, originalPeriodStart: original.starting_date, originalPeriodEnd: original.ending_date }),
        issues: json([{ code: "LEGACY_AGGREGATE", message: "Historical net and paid status were preserved. An itemized breakdown was unavailable." }]),
      } });
      await tx.payrollStatementLine.create({ data: { business_id: actor.businessId, statement_id: statement.id, code: "LEGACY_NET", description: "Historical recorded net pay · aggregate", category: "EARNING", amount: decimal(original.total_salary), source: json({ legacyPayslipId: original.id, recordedNet: amount(original.total_salary), recordedDeduction: amount(original.deduction), reconstruction: false }) } });
      if (original.status === "PAID" && original.total_salary > 0) await tx.payrollPayment.create({ data: { business_id: actor.businessId, statement_id: statement.id, amount: decimal(original.total_salary), payment_date: run.payment_date, method: "LEGACY", reference: "Historical paid status; payment method unavailable", actor_id: actor.userId, command_key: "legacy-payment:" + original.id } });
      await tx.payrollStatement.update({ where: { id: statement.id }, data: { status: "PUBLISHED", published_at: original.released_at ?? original.ending_date } });
      for (const source of original.availed_services) await tx.payrollEarning.updateMany({ where: { business_id: actor.businessId, employee_id: original.employee_id, source_type: "SERVICE", source_id: String(source.id), statement_id: null }, data: { statement_id: statement.id } });
      for (const source of original.attendance_records) {
        const attendance = await tx.employeeAttendance.findUnique({ where: { id: source.id }, select: { date: true } });
        if (attendance) await tx.payrollEarning.updateMany({ where: { business_id: actor.businessId, employee_id: original.employee_id, source_type: "WORKDAY", source_id: original.employee_id + ":" + phDay(attendance.date), statement_id: null }, data: { statement_id: statement.id } });
      }
    }
    const legacyCount = await tx.payslip.count({ where: { employee: { business_id: actor.businessId } } });
    const migrated = await tx.payrollStatement.count({ where: { business_id: actor.businessId, legacy_payslip_id: { not: null } } });
    const totalUnresolved = legacyCount - migrated;
    const updated = await tx.payrollSettings.update({ where: { business_id: actor.businessId }, data: {
      reconciliation: json({ legacyCount, migrated, unresolved: totalUnresolved, invalidThisBatch: unresolved, cursor: originals.at(-1)?.id ?? (settings.reconciliation as { cursor?: number } | null)?.cursor ?? 0 }),
      opening_confirmed_at: input.confirmOpening && totalUnresolved === 0 ? new Date() : null, revision: { increment: 1 },
    } });
    if (input.confirmOpening && totalUnresolved > 0) return { id: actor.businessId, revision: updated.revision };
    return { id: actor.businessId, revision: updated.revision };
  });
}
