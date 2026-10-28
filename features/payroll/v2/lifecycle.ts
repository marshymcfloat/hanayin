import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { amount, decimal, money } from "@/features/payroll/money";
import { PayrollError, type PayrollIdentity } from "./contracts";
import { calculateStatement } from "./calculation";
import { payrollCommand, stale, json } from "./command";
import { day, phDay, taxPeriodKey } from "./period";
import type { prepareRunSchema, statementCommandSchema, paymentSchema, runCommandSchema, simpleSaveSchema } from "./schemas";
import { allocateInstallment } from "./payment-allocation";
import { paymentDateCandidate } from "./payment-reconciliation";

async function saveCalculation(tx: Prisma.TransactionClient, statementId: string, businessId: string, result: Awaited<ReturnType<typeof calculateStatement>>) {
  const { calculation } = result;
  const previous = await tx.payrollStatement.findUniqueOrThrow({ where: { id: statementId }, select: { gross: true, deductions: true, net: true, employer_cost: true, review_hash: true, snapshot: true } });
  const previousReview = previous.review_hash && previous.review_hash !== result.reviewHash ? { gross: amount(previous.gross), deductions: amount(previous.deductions), net: amount(previous.net), employerCost: amount(previous.employer_cost), reviewHash: previous.review_hash } : (previous.snapshot as { previousReview?: unknown })?.previousReview;
  await tx.payrollStatementLine.deleteMany({ where: { statement_id: statementId, business_id: businessId } });
  await tx.payrollAssessment.deleteMany({ where: { statement_id: statementId, business_id: businessId } });
  if (calculation.lines.length) await tx.payrollStatementLine.createMany({ data: calculation.lines.map(line => ({ business_id: businessId, statement_id: statementId, earning_id: line.earningId ?? null, code: line.code, description: line.description, category: line.category, amount: decimal(line.amount), rate: line.rate ? decimal(line.rate) : null, units: line.units ? decimal(line.units) : null, source: json(line.source) })) });
  if (result.rulePackageId && calculation.assessments.length) await tx.payrollAssessment.createMany({ data: calculation.assessments.map(entry => ({ business_id: businessId, statement_id: statementId, rule_package_id: result.rulePackageId!, agency: entry.agency, assessment_month: entry.month, employee_share: decimal(entry.employeeShare), employer_share: decimal(entry.employerShare), basis: decimal(entry.basis), explanation: json(entry.explanation) })) });
  return tx.payrollStatement.update({ where: { id: statementId }, data: { gross: decimal(calculation.gross), deductions: decimal(calculation.deductions), net: decimal(calculation.net), employer_cost: decimal(calculation.employerCost), review_hash: result.reviewHash, snapshot: json({ employeeName: result.employeeName, employeeRevision: result.employeeRevision, rulePackageId: result.rulePackageId, evidence: result.evidence, calculation, ...(previousReview ? { previousReview } : {}) }), issues: json(calculation.issues), revision: { increment: 1 } } });
}
export async function prepareRun(identity: PayrollIdentity, input: z.infer<typeof prepareRunSchema>) {
  return payrollCommand(identity, "PREPARE", input, async (tx, actor) => {
    const settings = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId } });
    if (!settings || settings.mode === "LEGACY") throw new PayrollError("BLOCKED", "Complete setup and enable shadow comparison first.");
    stale(settings.revision, input.expectedRevision);
    const calculationPolicy = settings.calculation_policy ?? "GOVERNMENT";
    if (calculationPolicy === "SIMPLE" && !["REGULAR", "OFF_CYCLE"].includes(input.kind)) throw new PayrollError("BLOCKED", "Use a regular or extra pay run in simple tracking. Automatic benefit calculations need government setup.");
    if (calculationPolicy === "SIMPLE" && settings.simple_effective_from && day(input.start) < settings.simple_effective_from) throw new PayrollError("BLOCKED", "Choose dates on or after the start of simple pay tracking.");
    if (calculationPolicy === "GOVERNMENT" && settings.government_effective_from && day(input.start) < settings.government_effective_from) throw new PayrollError("BLOCKED", "Choose dates on or after the reviewed government-calculation start date.");
    if (input.kind === "REGULAR" && await tx.payrollRun.findFirst({ where: { business_id: actor.businessId, kind: "REGULAR", start_date: { lte: day(input.end) }, end_date: { gte: day(input.start) }, statements: { some: { status: { not: "VOID" } } } }, select: { id: true } })) throw new PayrollError("CONFLICT", "A regular payroll run already covers these dates. Open it or use an off-cycle adjustment.");
    const selectedCount = await tx.employee.count({ where: { id: { in: input.employeeIds }, business_id: actor.businessId, archived_at: null, user: { role: "EMPLOYEE" } } });
    if (selectedCount !== input.employeeIds.length) throw new PayrollError("NOT_FOUND", "The employee selection changed.");
    const run = await tx.payrollRun.create({ data: { business_id: actor.businessId, calculation_policy: calculationPolicy, start_date: day(input.start), end_date: day(input.end), payment_date: day(input.paymentDate), kind: input.kind, created_by: actor.userId, employee_ids: input.employeeIds } });
    for (const employeeId of input.employeeIds.slice(0, 1)) {
      const result = await calculateStatement(tx, actor.businessId, employeeId, run);
      const statement = await tx.payrollStatement.create({ data: { business_id: actor.businessId, run_id: run.id, employee_id: employeeId, gross: decimal(result.calculation.gross), deductions: decimal(result.calculation.deductions), net: decimal(result.calculation.net), employer_cost: decimal(result.calculation.employerCost), review_hash: result.reviewHash, snapshot: json({ employeeName: result.employeeName }), issues: json(result.calculation.issues) } });
      await saveCalculation(tx, statement.id, actor.businessId, result);
    }
    return { id: run.id, revision: run.revision };
  });
}
export async function prepareNextEmployee(identity: PayrollIdentity, input: z.infer<typeof runCommandSchema>) {
  return payrollCommand(identity, "PREPARE_NEXT_EMPLOYEE", input, async (tx, actor) => {
    const run = await tx.payrollRun.findFirst({ where: { id: input.runId, business_id: actor.businessId }, include: { statements: { select: { employee_id: true } } } });
    if (!run) throw new PayrollError("NOT_FOUND", "Payroll run not found.");
    stale(run.revision, input.expectedRevision);
    const employeeId = run.employee_ids.find(id => !run.statements.some(statement => statement.employee_id === id));
    if (!employeeId) return { id: run.id, revision: run.revision };
    const result = await calculateStatement(tx, actor.businessId, employeeId, run);
    const statement = await tx.payrollStatement.create({ data: { business_id: actor.businessId, run_id: run.id, employee_id: employeeId, gross: decimal(result.calculation.gross), deductions: decimal(result.calculation.deductions), net: decimal(result.calculation.net), employer_cost: decimal(result.calculation.employerCost), review_hash: result.reviewHash, snapshot: json({ employeeName: result.employeeName }), issues: json(result.calculation.issues) } });
    await saveCalculation(tx, statement.id, actor.businessId, result);
    const updated = await tx.payrollRun.update({ where: { id: run.id }, data: { revision: { increment: 1 } } });
    return { id: run.id, revision: updated.revision };
  });
}
export async function refreshStatement(identity: PayrollIdentity, input: z.infer<typeof statementCommandSchema>) {
  return payrollCommand(identity, "REFRESH", input, async (tx, actor) => {
    const statement = await tx.payrollStatement.findFirst({ where: { id: input.statementId, business_id: actor.businessId }, include: { run: true } });
    if (!statement) throw new PayrollError("NOT_FOUND", "Statement not found.");
    stale(statement.revision, input.expectedRevision);
    if (statement.status === "PUBLISHED" || statement.status === "VOID") throw new PayrollError("BLOCKED", "Published statements require adjustments.");
    await tx.payrollEarning.updateMany({ where: { business_id: actor.businessId, statement_id: statement.id }, data: { statement_id: null } });
    await tx.payrollStatement.update({ where: { id: statement.id }, data: { status: "DRAFT", approved_at: null, approved_by: null } });
    const result = await calculateStatement(tx, actor.businessId, statement.employee_id, statement.run, statement.id);
    const updated = await saveCalculation(tx, statement.id, actor.businessId, result);
    return { id: statement.id, revision: updated.revision };
  });
}
export async function approveStatement(identity: PayrollIdentity, input: z.infer<typeof statementCommandSchema>) {
  return payrollCommand(identity, "APPROVE", input, async (tx, actor) => {
    const settings = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId }, select: { mode: true } });
    if (settings?.mode !== "ACTIVE") throw new PayrollError("BLOCKED", "Shadow comparisons do not reserve earnings. Activate reconciled payroll before approval.");
    const statement = await tx.payrollStatement.findFirst({ where: { id: input.statementId, business_id: actor.businessId }, include: { run: true } });
    if (!statement) throw new PayrollError("NOT_FOUND", "Statement not found.");
    stale(statement.revision, input.expectedRevision);
    if (statement.status !== "DRAFT") throw new PayrollError("BLOCKED", "Only drafts can be approved.");
    const result = await calculateStatement(tx, actor.businessId, statement.employee_id, statement.run, statement.id);
    if (result.reviewHash !== statement.review_hash) throw new PayrollError("STALE_REVIEW", "The calculation changed. Refresh this statement and review the difference.");
    if (result.calculation.issues.length) throw new PayrollError("BLOCKED", result.calculation.issues[0].message);
    const conflicting = await tx.payrollStatement.findFirst({ where: { business_id: actor.businessId, employee_id: statement.employee_id, status: "APPROVED", id: { not: statement.id } }, select: { id: true } });
    if (conflicting) throw new PayrollError("CONFLICT", "Publish or refresh the employee's other approved statement first.");
    const reserved = await tx.payrollEarning.updateMany({ where: { id: { in: result.earningIds }, business_id: actor.businessId, employee_id: statement.employee_id, reversed_at: null, statement_id: null }, data: { statement_id: statement.id } });
    if (reserved.count !== result.earningIds.length) throw new PayrollError("STALE_REVIEW", "Another payroll run reserved these earnings.");
    const updated = await tx.payrollStatement.update({ where: { id: statement.id }, data: { status: "APPROVED", approved_by: actor.userId, approved_at: new Date(), revision: { increment: 1 } } });
    return { id: updated.id, revision: updated.revision };
  });
}
export async function publishStatement(identity: PayrollIdentity, input: z.infer<typeof statementCommandSchema>) {
  return payrollCommand(identity, "PUBLISH", input, async (tx, actor) => {
    const settings = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId } });
    if (settings?.mode !== "ACTIVE") throw new PayrollError("BLOCKED", "Shadow comparisons cannot publish or consume legacy earnings.");
    const statement = await tx.payrollStatement.findFirst({ where: { id: input.statementId, business_id: actor.businessId }, include: { run: true, employee: { select: { user_id: true, business_id: true } } } });
    if (!statement || statement.employee.business_id !== actor.businessId) throw new PayrollError("NOT_FOUND", "Statement not found.");
    stale(statement.revision, input.expectedRevision);
    if (statement.status !== "APPROVED") throw new PayrollError("BLOCKED", "Approve the reviewed statement before publishing.");
    const result = await calculateStatement(tx, actor.businessId, statement.employee_id, statement.run, statement.id);
    if (result.reviewHash !== statement.review_hash || result.calculation.issues.length) throw new PayrollError("STALE_REVIEW", "The approved sources changed. Refresh and review again.");
    const reserved = await tx.payrollEarning.count({ where: { id: { in: result.earningIds }, business_id: actor.businessId, employee_id: statement.employee_id, statement_id: statement.id, reversed_at: null } });
    if (reserved !== result.earningIds.length) throw new PayrollError("STALE_REVIEW", "Earning allocations changed.");
    const updated = await tx.payrollStatement.update({ where: { id: statement.id }, data: { status: "PUBLISHED", published_at: new Date(), payment_state: statement.run.calculation_policy !== "SIMPLE" && statement.net.isZero() ? "PAID" : "UNPAID", revision: { increment: 1 } } });
    await tx.payrollNotification.create({ data: { business_id: actor.businessId, statement_id: statement.id, user_id: statement.employee.user_id, sms_state: settings.sms_enabled ? "PENDING" : "NOT_REQUESTED" } });
    if (settings.sms_enabled) await tx.outboxMessage.create({ data: { event_type: "PAYROLL_PUBLISHED", aggregate_type: "PayrollStatement", aggregate_id: statement.id, business_id: actor.businessId, dedupe_key: "payroll-published:" + statement.id, payload: json({ statementId: statement.id, userId: statement.employee.user_id }) } });
    return { id: updated.id, revision: updated.revision };
  });
}
export async function recordPayment(identity: PayrollIdentity, input: z.infer<typeof paymentSchema>) {
  return payrollCommand(identity, "PAYMENT", input, (tx, actor) => recordPaymentInTransaction(tx, actor, input));
}
async function recordPaymentInTransaction(tx: Prisma.TransactionClient, actor: { businessId: string; userId: string }, input: z.infer<typeof paymentSchema>) {
    const statement = await tx.payrollStatement.findFirst({ where: { id: input.statementId, business_id: actor.businessId }, include: { run: true, lines: true, payments: { include: { allocations: true } } } });
    if (!statement) throw new PayrollError("NOT_FOUND", "Statement not found.");
    stale(statement.revision, input.expectedRevision);
    if (statement.status !== "PUBLISHED") throw new PayrollError("BLOCKED", "Publish the statement before recording payment.");
    if (input.date > phDay(new Date())) throw new PayrollError("INVALID_INPUT", "Record the actual date of a payment already made, not a future date.");
    if (statement.run.calculation_policy === "SIMPLE" && statement.run.end_date && day(input.date) < statement.run.end_date) throw new PayrollError("INVALID_INPUT", "The actual payment date cannot be earlier than the payslip's work cutoff.");
    if (statement.run.calculation_policy !== "SIMPLE") {
      const paymentSettings = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId }, select: { cadence: true } });
      const candidate = await paymentDateCandidate(tx, actor.businessId, statement.id, input.date, input.amount);
      if (statement.legacy_payslip_id !== null || candidate.snapshot.taxDelta !== null && !decimal(candidate.snapshot.taxDelta).isZero() || taxPeriodKey(paymentSettings?.cadence ?? "SEMIMONTHLY", input.date) !== taxPeriodKey(paymentSettings?.cadence ?? "SEMIMONTHLY", statement.run.payment_date.toISOString().slice(0, 10))) {
        const reconciliation = input.reconciliationId ? await tx.payrollPaymentReconciliation.findFirst({ where: { id: input.reconciliationId, statement_id: statement.id, business_id: actor.businessId } }) : null;
        if (!reconciliation || reconciliation.payment_date.getTime() !== day(input.date).getTime() || !reconciliation.amount.eq(input.amount) || reconciliation.statement_revision !== statement.revision) throw new PayrollError("BLOCKED", "Review and approve the payment-date reconciliation before recording this installment.");
        if (candidate.hash !== reconciliation.source_hash) throw new PayrollError("STALE_REVIEW", "Payment-date context changed. Review a new reconciliation.");
      }
    }
    const paid = money(statement.paid_amount.plus(input.amount));
    if (paid.gt(statement.net)) throw new PayrollError("INVALID_INPUT", "Payment exceeds the remaining balance.");
    const allocations = allocateInstallment({ net: amount(statement.net), paid: amount(statement.paid_amount), payment: input.amount, lines: statement.lines.map(line => ({ id: line.id, category: line.category, amount: amount(line.amount) })), previous: statement.payments.flatMap(payment => payment.allocations).map(entry => ({ lineId: entry.line_id, amount: amount(entry.amount) })) });
    const payment = await tx.payrollPayment.create({ data: { business_id: actor.businessId, statement_id: statement.id, amount: decimal(input.amount), payment_date: day(input.date), method: input.method, reference: input.reference, actor_id: actor.userId, command_key: input.key, reconciliation_id: input.reconciliationId } });
    await tx.payrollPaymentAllocation.createMany({ data: allocations.map(entry => ({ business_id: actor.businessId, statement_id: statement.id, payment_id: payment.id, line_id: entry.lineId, amount: decimal(entry.amount) })) });
    const updated = await tx.payrollStatement.update({ where: { id: statement.id }, data: { paid_amount: paid, payment_state: paid.eq(statement.net) ? "PAID" : "PARTIAL", revision: { increment: 1 } } });
    return { id: payment.id, revision: updated.revision };
}
export async function saveSimplePayslip(identity: PayrollIdentity, input: z.infer<typeof simpleSaveSchema>) {
  return payrollCommand(identity, "SIMPLE_SAVE", input, async (tx, actor) => {
    const settings = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId } });
    if (settings?.mode !== "ACTIVE") throw new PayrollError("BLOCKED", "Start pay tracking before saving payslips.");
    const statement = await tx.payrollStatement.findFirst({ where: { id: input.statementId, business_id: actor.businessId }, include: { run: true, employee: { select: { user_id: true, business_id: true } } } });
    if (!statement || statement.employee.business_id !== actor.businessId) throw new PayrollError("NOT_FOUND", "Payslip not found.");
    stale(statement.revision, input.expectedRevision);
    if (statement.run.calculation_policy !== "SIMPLE" || statement.legacy_payslip_id !== null) throw new PayrollError("BLOCKED", "This payslip uses the government review flow.");
    if (statement.status !== "DRAFT") throw new PayrollError("BLOCKED", "Only a reviewed draft can be saved. Open the saved payslip to record payment.");
    const result = await calculateStatement(tx, actor.businessId, statement.employee_id, statement.run, statement.id);
    if (result.reviewHash !== statement.review_hash) throw new PayrollError("STALE_REVIEW", "The pay calculation changed. Refresh and review the updated amounts.");
    if (result.calculation.issues.length) throw new PayrollError("BLOCKED", result.calculation.issues[0].message);
    if (await tx.payrollStatement.findFirst({ where: { business_id: actor.businessId, employee_id: statement.employee_id, status: "APPROVED", id: { not: statement.id } }, select: { id: true } })) throw new PayrollError("CONFLICT", "Finish the employee's other approved payslip first.");
    const reserved = await tx.payrollEarning.updateMany({ where: { id: { in: result.earningIds }, business_id: actor.businessId, employee_id: statement.employee_id, reversed_at: null, statement_id: null }, data: { statement_id: statement.id } });
    if (reserved.count !== result.earningIds.length) throw new PayrollError("STALE_REVIEW", "Another pay run reserved these earnings.");
    await tx.payrollStatement.update({ where: { id: statement.id }, data: { status: "APPROVED", approved_by: actor.userId, approved_at: new Date(), revision: { increment: 1 } } });
    const updated = await tx.payrollStatement.update({ where: { id: statement.id }, data: { status: "PUBLISHED", published_at: new Date(), payment_state: "UNPAID", revision: { increment: 1 } } });
    await tx.payrollNotification.create({ data: { business_id: actor.businessId, statement_id: statement.id, user_id: statement.employee.user_id, sms_state: settings.sms_enabled ? "PENDING" : "NOT_REQUESTED" } });
    if (settings.sms_enabled) await tx.outboxMessage.create({ data: { event_type: "PAYROLL_PUBLISHED", aggregate_type: "PayrollStatement", aggregate_id: statement.id, business_id: actor.businessId, dedupe_key: "payroll-published:" + statement.id, payload: json({ statementId: statement.id, userId: statement.employee.user_id }) } });
    if (!input.payment) return { id: updated.id, revision: updated.revision };
    const payment = await recordPaymentInTransaction(tx, actor, { ...input.payment, key: input.key, expectedRevision: updated.revision, statementId: updated.id });
    return { id: updated.id, revision: payment.revision };
  });
}
export async function voidStatement(identity: PayrollIdentity, input: z.infer<typeof statementCommandSchema>) {
  return payrollCommand(identity, "VOID", input, async (tx, actor) => {
    const statement = await tx.payrollStatement.findFirst({ where: { id: input.statementId, business_id: actor.businessId } });
    if (!statement) throw new PayrollError("NOT_FOUND", "Statement not found.");
    stale(statement.revision, input.expectedRevision);
    if (statement.status === "PUBLISHED") throw new PayrollError("BLOCKED", "Published statements remain preserved. Use a linked adjustment.");
    await tx.payrollEarning.updateMany({ where: { business_id: actor.businessId, statement_id: statement.id }, data: { statement_id: null } });
    const updated = await tx.payrollStatement.update({ where: { id: statement.id }, data: { status: "VOID", revision: { increment: 1 } } });
    return { id: updated.id, revision: updated.revision };
  });
}
export function outstanding(net: string, paid: string) { return amount(decimal(net).minus(paid)); }
