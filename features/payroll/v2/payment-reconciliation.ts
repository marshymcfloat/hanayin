import "server-only";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { z } from "zod";
import { amount, decimal, sum } from "@/features/payroll/money";
import { payrollOwner } from "./access";
import { payrollCommand, stale, fingerprint, json } from "./command";
import { day, taxPeriodKey } from "./period";
import { allocateInstallment } from "./payment-allocation";
import { bracketTax, phRulesSchema } from "./statutory";
import { eligibilitySchema } from "./schemas";
import { eligibilityAt, openingForYear } from "@/features/payroll/v2/profile-history";
import { receiptTaxContext } from "@/features/payroll/v2/tax-context";
import { taxableCompensation } from "@/features/payroll/v2/taxable-benefits";
import type { paymentReconciliationSchema } from "./schemas";
import { PayrollError, type PayrollIdentity } from "./contracts";

export async function paymentDateCandidate(tx: Prisma.TransactionClient, businessId: string, statementId: string, date: string, paymentAmount: string) {
  const statement = await tx.payrollStatement.findFirst({ where: { id: statementId, business_id: businessId, status: "PUBLISHED" }, include: { run: true, lines: { include: { earning: true } }, employee: { include: { payroll_profile: true } }, payments: { include: { allocations: true } } } });
  const settings = await tx.payrollSettings.findUnique({ where: { business_id: businessId }, include: { rule_package: true } });
  if (!statement) throw new PayrollError("NOT_FOUND", "Published statement not found.");
  if (statement.run.calculation_policy === "SIMPLE") throw new PayrollError("BLOCKED", "This payslip uses manual pay tracking. Record its actual payment directly.");
  if (statement.legacy_payslip_id) {
    allocateInstallment({ net: amount(statement.net), paid: amount(statement.paid_amount), payment: paymentAmount, lines: statement.lines.map(line => ({ id: line.id, category: line.category, amount: amount(line.amount) })), previous: statement.payments.flatMap(payment => payment.allocations).map(entry => ({ lineId: entry.line_id, amount: amount(entry.amount) })) });
    const snapshot = { statementId, statementRevision: statement.revision, date, amount: amount(paymentAmount), plannedDate: statement.run.payment_date.toISOString().slice(0, 10), originalTaxPortion: null, requiredTax: null, taxDelta: null, requiresIndependentTaxReview: true };
    return { snapshot, hash: fingerprint({ snapshot, paidAmount: amount(statement.paid_amount), previousPayments: statement.payments }), revision: statement.revision, employeeId: statement.employee_id };
  }
  if (!settings?.rule_package?.certified_at) throw new PayrollError("BLOCKED", "A certified rule package is required.");
  if (settings.rule_package.effective_from > day(date) || settings.rule_package.supported_through < day(date)) throw new PayrollError("BLOCKED", "Certified rules must cover the actual payment date.");
  const rules = phRulesSchema.parse(settings.rule_package.rules);
  if (date.slice(0, 7) !== statement.run.payment_date.toISOString().slice(0, 7) && statement.lines.some(line => /^(SSS|PHILHEALTH|PAGIBIG)(_EMPLOYER)?$/.test(line.code) && !line.amount.isZero())) throw new PayrollError("BLOCKED", "This installment crosses a contribution month. Contribution reassessment needs an independently verified rule and adjustment; withholding-only reconciliation cannot approve this case.");
  const profile = statement.employee.payroll_profile;
  const eligibility = eligibilitySchema.parse(eligibilityAt(profile?.eligibility_history, date)?.eligibility);
  const opening = openingForYear(profile?.opening_history, profile?.ytd_opening, Number(date.slice(0, 4)));
  if (!opening.success) throw new PayrollError("BLOCKED", "Confirm statutory opening records for the actual payment year.");
  const previous = statement.payments.flatMap(payment => payment.allocations).map(entry => ({ lineId: entry.line_id, amount: amount(entry.amount) }));
  const allocations = allocateInstallment({ net: amount(statement.net), paid: amount(statement.paid_amount), payment: paymentAmount, lines: statement.lines.map(line => ({ id: line.id, category: line.category, amount: amount(line.amount) })), previous });
  const lookup = new Map(statement.lines.map(line => [line.id, line]));
  const contributions = sum(allocations.filter(entry => ["SSS", "PHILHEALTH", "PAGIBIG"].includes(lookup.get(entry.lineId)?.code ?? "")).map(entry => entry.amount));
  const allocatedTax = sum(allocations.filter(entry => ["BIR", "TAX_RECONCILIATION"].includes(lookup.get(entry.lineId)?.code ?? "")).map(entry => entry.amount));
  const priorPayments = await tx.payrollPayment.findMany({ where: { business_id: businessId, statement: { employee_id: statement.employee_id, legacy_payslip_id: null, run: { calculation_policy: "GOVERNMENT" } }, payment_date: { gte: day(date.slice(0, 4) + "-01-01"), lte: day(date) } }, include: { allocations: { include: { line: { include: { earning: true } } } } } });
  const context = receiptTaxContext(priorPayments.flatMap(payment => payment.allocations.map(entry => ({ id: entry.id, date: payment.payment_date.toISOString().slice(0, 10), amount: amount(entry.amount), category: entry.line.category, code: entry.line.code, taxCategory: entry.line.earning?.tax_category === "BENEFITS_CAP" ? "BENEFITS_CAP" : entry.line.earning?.taxable ? "NORMAL" : "EXEMPT" }))), { year: Number(date.slice(0, 4)), date, cadence: settings.cadence, benefitsCap: rules.benefits.taxExemptBenefitsCap, openingBenefits: opening.data.benefitsReceived ?? opening.data.thirteenthPaid });
  const taxable = decimal(taxableCompensation(allocations.filter(entry => lookup.get(entry.lineId)?.category === "EARNING").map(entry => ({ amount: entry.amount, category: lookup.get(entry.lineId)?.earning?.tax_category === "BENEFITS_CAP" ? "BENEFITS_CAP" : lookup.get(entry.lineId)?.earning?.taxable ? "NORMAL" : "EXEMPT" })), context.benefits, rules.benefits.taxExemptBenefitsCap));
  const periodOpening = opening.data.taxPeriodContexts.find(entry => entry.period === taxPeriodKey(settings.cadence, date));
  const reviewedCorrectionOnly = statement.lines.some(line => line.code === "TAX_RECONCILIATION") && !statement.lines.some(line => line.category === "EARNING" && !line.amount.isZero());
  const requiredTax = reviewedCorrectionOnly ? allocatedTax : eligibility.withholding ? decimal(bracketTax(amount(taxable.minus(contributions).plus(context.periodTaxable).plus(periodOpening?.taxable ?? 0)), rules.withholding[settings.cadence === "WEEKLY" ? "WEEKLY" : "SEMIMONTHLY"])).minus(context.periodWithheld).minus(periodOpening?.withheld ?? 0) : decimal(0);
  const taxDelta = amount(requiredTax.minus(allocatedTax));
  const snapshot = { statementId, statementRevision: statement.revision, date, amount: amount(paymentAmount), plannedDate: statement.run.payment_date.toISOString().slice(0, 10), rulePackageId: settings.rule_package_id, allocations, taxable: amount(taxable), contributions: amount(contributions), originalTaxPortion: amount(allocatedTax), requiredTax: amount(requiredTax), taxDelta, requiresIndependentTaxReview: false, priorPaymentIds: priorPayments.map(payment => payment.id).sort() };
  return { snapshot, hash: fingerprint({ snapshot, rulesHash: settings.rule_package.content_hash, settingsRevision: settings.revision, eligibility, profileRevision: statement.employee.payroll_profile?.revision }), revision: statement.revision, employeeId: statement.employee_id };
}
export async function previewPaymentDate(identity: PayrollIdentity, statementId: string, date: string, paymentAmount: string) {
  const actor = await payrollOwner(identity);
  const candidate = await prisma.$transaction(tx => paymentDateCandidate(tx, actor.businessId, statementId, date, paymentAmount), { isolationLevel: "RepeatableRead" });
  return { ...candidate.snapshot, expectedHash: candidate.hash };
}
export async function reconcilePaymentDate(identity: PayrollIdentity, input: z.infer<typeof paymentReconciliationSchema>) {
  return payrollCommand(identity, "PAYMENT_DATE_RECONCILIATION", input, async (tx, actor) => {
    const candidate = await paymentDateCandidate(tx, actor.businessId, input.statementId, input.date, input.amount);
    stale(candidate.revision, input.expectedRevision);
    if (candidate.hash !== input.expectedHash) throw new PayrollError("STALE_REVIEW", "Payment-date calculations changed. Review the updated reconciliation.");
    const existing = await tx.payrollPaymentReconciliation.findUnique({ where: { business_id_source_hash: { business_id: actor.businessId, source_hash: candidate.hash } }, select: { id: true, tax_delta: true } });
    if (existing) {
      if (candidate.snapshot.requiresIndependentTaxReview && input.legacyTaxDelta !== undefined && !existing.tax_delta.eq(input.legacyTaxDelta)) throw new PayrollError("CONFLICT", "This historical payment already has a reviewed tax difference. A correction requires linked statutory review.");
      return { id: existing.id };
    }
    if (candidate.snapshot.taxDelta === null && input.legacyTaxDelta === undefined) throw new PayrollError("BLOCKED", "Enter an independently verified withholding difference for this unitemized historical payment; zero must be explicitly confirmed.");
    const taxDelta = candidate.snapshot.taxDelta ?? input.legacyTaxDelta!;
    const record = await tx.payrollPaymentReconciliation.create({ data: { business_id: actor.businessId, statement_id: input.statementId, payment_date: day(input.date), amount: decimal(input.amount), tax_delta: decimal(taxDelta), statement_revision: candidate.revision, source_hash: candidate.hash, snapshot: json({ ...candidate.snapshot, approvedTaxDelta: taxDelta }), reason: input.reason, actor_id: actor.userId, command_key: input.key } });
    if (!decimal(taxDelta).isZero()) {
      const adjustment = await tx.payrollAdjustment.create({ data: { business_id: actor.businessId, employee_id: candidate.employeeId, original_statement_id: input.statementId, amount: decimal(taxDelta).negated(), code: "TAX_RECONCILIATION", reason: "Reviewed payment-date withholding reconciliation", authorization: input.reason, effective_on: day(input.date), disposition: "APPROVED", actor_id: actor.userId } });
      await tx.payrollEarning.create({ data: { business_id: actor.businessId, employee_id: candidate.employeeId, source_type: "ADJUSTMENT", source_id: adjustment.id, source_revision: 0, earned_on: day(input.date), payable_on: day(input.date), code: "TAX_RECONCILIATION", description: adjustment.reason, amount: adjustment.amount, rate: adjustment.amount, units: 1, taxable: false, snapshot: json({ reconciliationId: record.id, originalStatementId: input.statementId, taxDelta, authorizedBy: actor.userId }) } });
    }
    return { id: record.id };
  });
}
