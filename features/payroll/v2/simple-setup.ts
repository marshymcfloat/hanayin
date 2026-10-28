import "server-only";
import type { z } from "zod";
import { amount, decimal } from "@/features/payroll/money";
import { payrollCommand, stale, json } from "@/features/payroll/v2/command";
import { PayrollError, type PayrollIdentity } from "@/features/payroll/v2/contracts";
import { day, phDay, validatePaymentSchedule } from "@/features/payroll/v2/period";
import type { simpleSettingsSchema, simpleAdjustmentSchema } from "@/features/payroll/v2/schemas";
import { assertLegacyReconciliationCurrent } from "@/features/payroll/v2/legacy-reconciliation";

export async function saveSimpleSettings(identity: PayrollIdentity, input: z.infer<typeof simpleSettingsSchema>) {
  return payrollCommand(identity, "SIMPLE_SETTINGS", input, async (tx, actor) => {
    validatePaymentSchedule(input.cadence, input.payDays);
    const settings = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId } });
    stale(settings?.revision ?? 0, input.expectedRevision);
    if (input.effectiveFrom > phDay(new Date())) throw new PayrollError("INVALID_INPUT", "Choose today or an earlier date to start tracking pay.");
    if (settings?.mode === "ACTIVE" && settings.calculation_policy !== "SIMPLE") throw new PayrollError("BLOCKED", "Existing government payroll stays on its reviewed calculation policy.");
    const from = day(input.effectiveFrom);
    const run = await tx.payrollRun.findFirst({ where: { business_id: actor.businessId, calculation_policy: "GOVERNMENT", kind: { not: "LEGACY" }, statements: { some: { status: { notIn: ["VOID", "PUBLISHED"] } } } }, select: { id: true } });
    if (run) throw new PayrollError("BLOCKED", "Finish or void existing government payroll drafts before switching to simple tracking.");
    if (settings?.calculation_policy === "SIMPLE" && settings.simple_effective_from && settings.simple_effective_from.getTime() !== from.getTime() && await tx.payrollRun.count({ where: { business_id: actor.businessId, kind: { not: "LEGACY" } } })) throw new PayrollError("BLOCKED", "The tracking start date is fixed once payroll has been prepared.");
    let mode = settings?.mode === "ACTIVE" ? "ACTIVE" as const : "SHADOW" as const;
    if (input.phase === "ACTIVATE") {
      if (!settings || settings.calculation_policy !== "SIMPLE") throw new PayrollError("BLOCKED", "Save simple payroll settings before starting pay tracking.");
      const reconciliation = settings.reconciliation as { legacyCount?: number; unresolved?: number } | null;
      const legacyCount = await tx.payslip.count({ where: { employee: { business_id: actor.businessId } } });
      if (!reconciliation || reconciliation.legacyCount !== legacyCount || reconciliation.unresolved !== 0 || !settings.opening_confirmed_at) throw new PayrollError("BLOCKED", "Review the latest historical payslips before starting simple tracking.");
      await assertLegacyReconciliationCurrent(tx, actor.businessId);
      const employees = await tx.employee.findMany({ where: { business_id: actor.businessId, archived_at: null, user: { role: "EMPLOYEE" } }, select: { employment_start: true, compensation_agreements: { select: { effective_from: true, effective_to: true } } } });
      if (employees.some(employee => {
        const start = employee.employment_start && employee.employment_start > from ? employee.employment_start : from;
        return !employee.employment_start || !employee.compensation_agreements.some(agreement => agreement.effective_from <= start && (!agreement.effective_to || agreement.effective_to >= start));
      })) throw new PayrollError("BLOCKED", "Set each employee's pay and effective dates, and add Joined on in their People profile, before starting simple tracking.");
      mode = "ACTIVE";
    }
    const updated = await tx.payrollSettings.upsert({
      where: { business_id: actor.businessId },
      create: { business_id: actor.businessId, calculation_policy: "SIMPLE", simple_effective_from: from, mode, cadence: input.cadence, pay_days: input.payDays, sms_enabled: input.smsEnabled, revision: 1 },
      update: { calculation_policy: "SIMPLE", simple_effective_from: from, mode, cadence: input.cadence, pay_days: input.payDays, sms_enabled: input.smsEnabled, revision: { increment: 1 } },
    });
    return { id: actor.businessId, revision: updated.revision };
  });
}

export async function createSimpleAdjustment(identity: PayrollIdentity, input: z.infer<typeof simpleAdjustmentSchema>) {
  return payrollCommand(identity, "SIMPLE_ADJUSTMENT", input, async (tx, actor) => {
    const settings = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId } });
    if (settings?.calculation_policy !== "SIMPLE" || settings.mode !== "ACTIVE") throw new PayrollError("BLOCKED", "Start simple pay tracking before recording an adjustment.");
    if (input.earnedOn > phDay(new Date()) || settings.simple_effective_from && day(input.earnedOn) < settings.simple_effective_from) throw new PayrollError("INVALID_INPUT", "Choose an earned date within the active tracking period.");
    const employee = await tx.employee.findFirst({ where: { id: input.employeeId, business_id: actor.businessId, archived_at: null, user: { role: "EMPLOYEE" } }, select: { id: true, financial_revision: true } });
    if (!employee) throw new PayrollError("NOT_FOUND", "Employee not found.");
    stale(employee.financial_revision, input.expectedRevision);
    if (input.originalStatementId && !await tx.payrollStatement.findFirst({ where: { id: input.originalStatementId, business_id: actor.businessId, employee_id: employee.id, status: "PUBLISHED" }, select: { id: true } })) throw new PayrollError("NOT_FOUND", "Original payslip not found.");
    const value = decimal(input.amount);
    const code = value.isNegative() ? "DEDUCTION" : "ALLOWANCE";
    const record = await tx.payrollAdjustment.create({ data: { business_id: actor.businessId, employee_id: employee.id, original_statement_id: input.originalStatementId, amount: value, code, label: input.label, reason: input.reason, authorization: input.reason, disposition: "APPROVED", effective_on: day(input.earnedOn), actor_id: actor.userId, revision: 1 } });
    await tx.payrollEarning.create({ data: { business_id: actor.businessId, employee_id: employee.id, source_type: "ADJUSTMENT", source_id: record.id, source_revision: record.revision, earned_on: record.effective_on, payable_on: record.effective_on, code, description: input.label, amount: value, rate: value, units: 1, taxable: value.gt(0), tax_category: value.gt(0) ? "NORMAL" : "EXEMPT", is_basic: false, snapshot: json({ calculationPolicy: "SIMPLE", manual: true, label: input.label, reason: input.reason, authorization: input.reason, actorId: actor.userId, adjustmentId: record.id, originalStatementId: input.originalStatementId ?? null, amount: amount(value) }) } });
    const updated = await tx.employee.update({ where: { id: employee.id }, data: { financial_revision: { increment: 1 } } });
    return { id: record.id, revision: updated.financial_revision };
  });
}
