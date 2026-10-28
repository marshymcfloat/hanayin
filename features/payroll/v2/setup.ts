import "server-only";
import { prisma } from "@/prisma/prisma";
import { encryptPayrollIdentifiers } from "@/lib/security/payroll-identifiers";
import { amount, decimal } from "@/features/payroll/money";
import { PayrollError, type PayrollIdentity } from "./contracts";
import { payrollCommand, stale, json, fingerprint } from "./command";
import { day, validatePaymentSchedule } from "./period";
import type { CompensationInput, ProfileInput } from "./schemas";
import { settingsSchema, adjustmentSchema, adjustmentDecisionSchema, type activationSchema } from "./schemas";
import { phRulesSchema } from "./statutory";
import { eligibilityAt, eligibilityHistorySchema, openingForYear } from "./profile-history";
import type { z } from "zod";

export async function saveCompensation(identity: PayrollIdentity, input: CompensationInput) {
  return payrollCommand(identity, "COMPENSATION", input, async (tx, actor) => {
    const employee = await tx.employee.findFirst({ where: { id: input.employeeId, business_id: actor.businessId, archived_at: null, user: { role: "EMPLOYEE", owner: { is: null } } }, select: { id: true, financial_revision: true, employment_start: true, employment_end: true } });
    if (!employee) throw new PayrollError("NOT_FOUND", "Employee not found.");
    stale(employee.financial_revision, input.expectedRevision);
    if (employee.employment_start && day(input.from) < employee.employment_start) throw new PayrollError("INVALID_INPUT", "Apply this pay on or after Joined on in the People profile.");
    if (employee.employment_end && day(input.from) > employee.employment_end) throw new PayrollError("INVALID_INPUT", "This pay starts after the recorded employment end date.");
    const payrollSettings = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId }, select: { calculation_policy: true } });
    if (input.basis === "MONTHLY" && !input.monthlyDivisor && payrollSettings?.calculation_policy === "GOVERNMENT") throw new PayrollError("INVALID_INPUT", "Monthly government payroll requires a verified daily divisor.");
    const publishedAfter = await tx.payrollEarning.findFirst({ where: { business_id: actor.businessId, employee_id: employee.id, source_type: "WORKDAY", earned_on: { gte: day(input.from) }, statement: { is: { status: "PUBLISHED" } } }, select: { id: true } });
    if (publishedAfter) throw new PayrollError("BLOCKED", "Published earnings require an adjustment before changing their effective rate.");
    const scheduled = await tx.compensationAgreement.findFirst({ where: { business_id: actor.businessId, employee_id: employee.id, effective_from: { gte: day(input.from) } }, select: { id: true } });
    if (scheduled) throw new PayrollError("CONFLICT", "A pay setting already starts on this date or a later date. Review pay history and choose a later starting date.");
    const previous = await tx.compensationAgreement.findFirst({ where: { business_id: actor.businessId, employee_id: employee.id, effective_from: { lt: day(input.from) }, OR: [{ effective_to: null }, { effective_to: { gte: day(input.from) } }] }, orderBy: { effective_from: "desc" } });
    if (previous) {
      await tx.compensationAgreement.update({ where: { id: previous.id }, data: { effective_to: new Date(day(input.from).getTime() - 86400000) } });
    }
    const agreement = await tx.compensationAgreement.create({ data: {
      business_id: actor.businessId, employee_id: employee.id, effective_from: day(input.from), effective_to: input.to ? day(input.to) : null,
      basis: input.basis, rate: decimal(input.rate), normal_hours: decimal(input.hours), monthly_divisor: input.monthlyDivisor ? decimal(input.monthlyDivisor) : null,
      commission_rate: decimal(input.commissionRate), commission_basis: input.commissionBasis, created_by: actor.userId,
    } });
    return { id: agreement.id };
  });
}
export async function savePayrollProfile(identity: PayrollIdentity, input: ProfileInput) {
  return payrollCommand(identity, "PROFILE", input, async (tx, actor) => {
    const employee = await tx.employee.findFirst({ where: { id: input.employeeId, business_id: actor.businessId, archived_at: null }, select: { id: true, financial_revision: true } });
    if (!employee) throw new PayrollError("NOT_FOUND", "Employee not found.");
    stale(employee.financial_revision, input.expectedRevision);
    const identifiers = encryptPayrollIdentifiers(input.identifiers);
    const previous = await tx.employeePayrollProfile.findUnique({ where: { employee_id: employee.id } });
    const year = input.opening.year ?? new Date().getUTCFullYear();
    const normalizedOpening = { ...input.opening, year };
    const oldOpening = openingForYear(previous?.opening_history, previous?.ytd_opening, year);
    if (oldOpening.success && fingerprint(oldOpening.data) !== fingerprint(normalizedOpening) && await tx.payrollStatement.findFirst({ where: { business_id: actor.businessId, employee_id: employee.id, status: "PUBLISHED", legacy_payslip_id: null, run: { calculation_policy: "GOVERNMENT", payment_date: { gte: day(String(year) + "-01-01"), lte: day(String(year) + "-12-31") } } }, select: { id: true } })) throw new PayrollError("BLOCKED", "Opening records for a published payroll year need a separately reviewed statutory adjustment.");
    const histories = eligibilityHistorySchema.safeParse(previous?.eligibility_history ?? []);
    const priorEligibility = eligibilityAt(previous?.eligibility_history, input.eligibilityFrom);
    const legalSetup = { region: input.region, category: input.wageCategory, eligibility: input.eligibility };
    if (priorEligibility && fingerprint({ region: priorEligibility.region, category: priorEligibility.category, eligibility: priorEligibility.eligibility }) !== fingerprint(legalSetup) && await tx.payrollEarning.findFirst({ where: { business_id: actor.businessId, employee_id: employee.id, earned_on: { gte: day(input.eligibilityFrom) }, statement: { is: { status: "PUBLISHED" } } }, select: { id: true } })) throw new PayrollError("BLOCKED", "Published employment classifications and statutory eligibility require a linked adjustment. Use a later effective date for future changes.");
    const eligibilityHistory = [...(histories.success ? histories.data : []).filter(entry => entry.from !== input.eligibilityFrom), { from: input.eligibilityFrom, ...legalSetup }].sort((a, b) => a.from.localeCompare(b.from));
    const history = (previous?.monthly_basic_history ?? []) as { from: string; basic: string }[];
    const applicable = [...history].filter(entry => entry.from <= input.monthlyBasicFrom).sort((a, b) => b.from.localeCompare(a.from))[0];
    if ((!applicable || !decimal(applicable.basic).eq(input.monthlyBasic)) && await tx.payrollAssessment.findFirst({ where: { business_id: actor.businessId, agency: "PHILHEALTH", assessment_month: { gte: input.monthlyBasicFrom }, statement: { is: { employee_id: employee.id, status: "PUBLISHED", legacy_payslip_id: null } } }, select: { id: true } })) throw new PayrollError("BLOCKED", "A published monthly contribution basis requires a linked statutory adjustment.");
    const monthlyBasicHistory = [...history.filter(entry => entry.from !== input.monthlyBasicFrom), { from: input.monthlyBasicFrom, basic: input.monthlyBasic }].sort((a, b) => a.from.localeCompare(b.from));
    const data = { business_id: actor.businessId, work_region: input.region, wage_category: input.wageCategory, monthly_basic: decimal(input.monthlyBasic), monthly_basic_history: json(monthlyBasicHistory), eligibility: json(input.eligibility), eligibility_history: json(eligibilityHistory), ytd_opening: json(normalizedOpening), opening_history: json({ ...(previous?.opening_history as object ?? {}), [String(year)]: normalizedOpening }), opening_confirmed_at: new Date(), encrypted_identifiers: identifiers };
    await tx.employeePayrollProfile.upsert({ where: { employee_id: employee.id }, create: { ...data, employee_id: employee.id }, update: { ...data, revision: { increment: 1 } } });
    return { id: String(employee.id) };
  });
}
export async function saveSettings(identity: PayrollIdentity, input: z.infer<typeof settingsSchema>) {
  return payrollCommand(identity, "SETTINGS", input, async (tx, actor) => {
    validatePaymentSchedule(input.cadence, input.payDays);
    const current = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId } });
    stale(current?.revision ?? 0, input.expectedRevision);
    const rules = await tx.payrollRulePackage.findUnique({ where: { id: input.rulePackageId } });
    if (!rules) throw new PayrollError("NOT_FOUND", "Rule package not found.");
    phRulesSchema.parse(rules.rules);
    const employer = input.employerIdentifiers ? { employer_identifiers: encryptPayrollIdentifiers(input.employerIdentifiers) } : {};
    let governmentStart: Date | undefined;
    if (current?.calculation_policy === "SIMPLE") {
      if (!input.effectiveFrom || !input.reviewedOpening) throw new PayrollError("BLOCKED", "Choose a government-calculation start date and review opening balances including earlier simple payments.");
      governmentStart = day(input.effectiveFrom);
      if (!rules.certified_at || rules.effective_from > governmentStart || rules.supported_through < governmentStart || !(input.employerIdentifiers || current.employer_identifiers)) throw new PayrollError("BLOCKED", "Reviewed government rules and employer identifiers must cover the start date.");
      const employees = await tx.employee.findMany({ where: { business_id: actor.businessId, archived_at: null, user: { role: "EMPLOYEE" } }, include: { payroll_profile: true, compensation_agreements: true } });
      const latestSimplePayment = await tx.payrollPayment.findFirst({ where: { business_id: actor.businessId, statement: { run: { calculation_policy: "SIMPLE" } } }, orderBy: { created_at: "desc" }, select: { created_at: true } });
      if (employees.some(employee => {
        const profile = employee.payroll_profile;
        const opening = openingForYear(profile?.opening_history, profile?.ytd_opening, Number(input.effectiveFrom!.slice(0, 4)));
        const agreement = employee.compensation_agreements.find(entry => entry.effective_from <= governmentStart! && (!entry.effective_to || entry.effective_to >= governmentStart!));
        const history = profile?.monthly_basic_history;
        const basis = Array.isArray(history) && history.some(entry => entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.from === "string" && entry.from <= input.effectiveFrom!.slice(0, 7));
        return !employee.employment_start || !agreement || agreement.basis === "MONTHLY" && !agreement.monthly_divisor || !profile?.encrypted_identifiers || !profile.opening_confirmed_at || Boolean(latestSimplePayment && profile.opening_confirmed_at < latestSimplePayment.created_at) || !opening.success || opening.data.year !== Number(input.effectiveFrom!.slice(0, 4)) || !eligibilityAt(profile.eligibility_history, input.effectiveFrom!) || !basis;
      })) throw new PayrollError("BLOCKED", "Review each employee's government setup and this year's opening balances after the latest simple payment. Monthly pay also needs a verified divisor.");
      const pending = await tx.payrollStatement.findMany({ where: { business_id: actor.businessId, legacy_payslip_id: null, run: { calculation_policy: "SIMPLE" }, status: { not: "VOID" } }, include: { run: true, payments: { select: { payment_date: true } } } });
      if (pending.some(statement => statement.status !== "PUBLISHED" || !statement.paid_amount.eq(statement.net) || statement.run.end_date >= governmentStart! || statement.run.payment_date >= governmentStart! || statement.payments.some(payment => payment.payment_date >= governmentStart!))) throw new PayrollError("BLOCKED", "Finish or void simple drafts and settle simple payslips before the government-calculation start date.");
    }
    const updated = await tx.payrollSettings.upsert({ where: { business_id: actor.businessId }, create: { business_id: actor.businessId, calculation_policy: "GOVERNMENT", cadence: input.cadence, pay_days: input.payDays, sms_enabled: input.smsEnabled, rule_package_id: rules.id, ...employer, revision: 1 }, update: { calculation_policy: "GOVERNMENT", ...(governmentStart ? { government_effective_from: governmentStart } : {}), cadence: input.cadence, pay_days: input.payDays, sms_enabled: input.smsEnabled, rule_package_id: rules.id, ...employer, revision: { increment: 1 } } });
    return { id: actor.businessId, revision: updated.revision };
  });
}
export async function createAdjustment(identity: PayrollIdentity, input: z.infer<typeof adjustmentSchema>) {
  return payrollCommand(identity, "ADJUSTMENT_CREATE", input, async (tx, actor) => {
    const employee = await tx.employee.findFirst({ where: { id: input.employeeId, business_id: actor.businessId }, select: { id: true, financial_revision: true } });
    if (!employee) throw new PayrollError("NOT_FOUND", "Employee not found.");
    stale(employee.financial_revision, input.expectedRevision);
    if (input.originalStatementId && !await tx.payrollStatement.findFirst({ where: { id: input.originalStatementId, business_id: actor.businessId, employee_id: employee.id, status: "PUBLISHED" }, select: { id: true } })) throw new PayrollError("NOT_FOUND", "Original statement not found.");
    const record = await tx.payrollAdjustment.create({ data: { business_id: actor.businessId, employee_id: employee.id, original_statement_id: input.originalStatementId, amount: decimal(input.amount), code: input.code, label: input.label, reason: input.reason, authorization: input.authorization, effective_on: day(input.effectiveOn), actor_id: actor.userId } });
    await tx.employee.update({ where: { id: employee.id }, data: { financial_revision: { increment: 1 } } });
    return { id: record.id };
  });
}
export async function decideAdjustment(identity: PayrollIdentity, input: z.infer<typeof adjustmentDecisionSchema>) {
  return payrollCommand(identity, "ADJUSTMENT_DECIDE", input, async (tx, actor) => {
    const record = await tx.payrollAdjustment.findFirst({ where: { id: input.adjustmentId, business_id: actor.businessId } });
    if (!record) throw new PayrollError("NOT_FOUND", "Adjustment not found.");
    stale(record.revision, input.expectedRevision);
    if (["WAIVED", "SUPERSEDED"].includes(record.disposition)) throw new PayrollError("BLOCKED", "This adjustment was waived or superseded by a newer source revision.");
    const priorEarnings = await tx.payrollEarning.findMany({ where: { business_id: actor.businessId, employee_id: record.employee_id, source_type: "ADJUSTMENT", source_id: record.id }, include: { statement: { select: { status: true } } } });
    if (priorEarnings.some(entry => entry.statement?.status === "PUBLISHED")) throw new PayrollError("BLOCKED", "A published adjustment requires a separately linked correction.");
    if (record.code === "TAX_RECONCILIATION" && input.disposition === "WAIVED") throw new PayrollError("BLOCKED", "A statutory tax correction needs a reviewed statutory reconciliation.");
    await tx.payrollEarning.updateMany({ where: { business_id: actor.businessId, source_type: "ADJUSTMENT", source_id: record.id, reversed_at: null }, data: { reversed_at: new Date(), statement_id: null } });
    const reviewedAmount = input.reviewedAmount ? decimal(input.reviewedAmount) : record.amount;
    if (record.code === "TAX_RECONCILIATION" && !reviewedAmount.eq(record.amount)) throw new PayrollError("BLOCKED", "Statutory corrections require a newly calculated reconciliation.");
    if (record.amount.isNegative() && (reviewedAmount.gte(0) || reviewedAmount.abs().gt(record.amount.abs()))) throw new PayrollError("INVALID_INPUT", "Reduce a deduction using a negative amount no greater than the authorized amount, or waive it.");
    const result = await tx.payrollAdjustment.update({ where: { id: record.id }, data: { amount: reviewedAmount, disposition: input.disposition, authorization: input.reason, revision: { increment: 1 } } });
    if (input.disposition === "APPROVED") await tx.payrollEarning.create({ data: {
      business_id: actor.businessId, employee_id: record.employee_id, source_type: "ADJUSTMENT", source_id: record.id, source_revision: result.revision,
      earned_on: record.effective_on, payable_on: record.effective_on, code: record.code, description: record.label ?? record.reason, amount: reviewedAmount, rate: reviewedAmount, units: 1,
      taxable: record.code !== "TAX_RECONCILIATION" && reviewedAmount.greaterThan(0), tax_category: record.code === "BONUS" ? "BENEFITS_CAP" : record.code === "TAX_RECONCILIATION" || reviewedAmount.isNegative() ? "EXEMPT" : "NORMAL", is_basic: false, snapshot: json({ adjustmentId: record.id, authorization: input.reason, originalStatementId: record.original_statement_id, proposedAmount: amount(record.amount), amount: amount(reviewedAmount), ...(record.code !== "TAX_RECONCILIATION" ? { manual: true, label: record.label ?? record.reason, reason: record.reason, actorId: record.actor_id } : {}) }),
    } });
    await tx.employee.update({ where: { id: record.employee_id }, data: { financial_revision: { increment: 1 } } });
    return { id: record.id, revision: result.revision };
  });
}
export async function changePayrollMode(identity: PayrollIdentity, input: z.infer<typeof activationSchema>) {
  return payrollCommand(identity, "ACTIVATION", input, async (tx, actor) => {
    const settings = await tx.payrollSettings.findUnique({ where: { business_id: actor.businessId }, include: { rule_package: true } });
    if (!settings) throw new PayrollError("BLOCKED", "Complete payroll setup first.");
    stale(settings.revision, input.expectedRevision);
    if (settings.mode === "ACTIVE") throw new PayrollError("BLOCKED", "Activated payroll cannot return to legacy release.");
    if (input.target === "ACTIVE") {
      if (settings.mode !== "SHADOW" || !settings.rule_package?.certified_at || !settings.opening_confirmed_at) throw new PayrollError("BLOCKED", "Certified rules and reconciled opening records are required.");
      if (!settings.employer_identifiers) throw new PayrollError("BLOCKED", "Confirm encrypted employer government identifiers before activation.");
      const verifiedRules = phRulesSchema.parse(settings.rule_package.rules);
      if (["SSS", "PHILHEALTH", "PAGIBIG", "BIR"].some(agency => !verifiedRules.exportTemplates.some(template => template.agency === agency))) throw new PayrollError("BLOCKED", "The independently reviewed rule package must include versioned government export layouts.");
      const unresolved = await tx.employee.count({ where: { business_id: actor.businessId, archived_at: null, OR: [{ employment_start: null }, { payroll_profile: { is: null } }, { compensation_agreements: { none: {} } }, { payroll_profile: { is: { opening_confirmed_at: null } } }] } });
      if (unresolved) throw new PayrollError("BLOCKED", "Every active employee needs complete compensation and opening records.");
      const reconciliation = settings.reconciliation as { unresolved?: number; legacyCount?: number } | null;
      const legacyCount = await tx.payslip.count({ where: { employee: { business_id: actor.businessId } } });
      const uncertainSources = await tx.availedService.count({ where: { booking: { business_id: actor.businessId }, served_by_id: { not: null }, status: "COMPLETED", cancelled_at: null, paid_in_payslip_id: null, OR: [{ payroll_commission_base: null }, { payroll_commission_rate: null }] } });
      if (uncertainSources) throw new PayrollError("BLOCKED", "Confirm the rates, bases, and eligibility dates of historical unallocated commissions first.");
      if (!reconciliation || reconciliation.unresolved !== 0 || reconciliation.legacyCount !== legacyCount) throw new PayrollError("BLOCKED", "Reconcile the latest legacy releases before activation.");
    }
    const updated = await tx.payrollSettings.update({ where: { business_id: actor.businessId }, data: { mode: input.target, revision: { increment: 1 } } });
    return { id: actor.businessId, revision: updated.revision };
  });
}

export async function availableRulePackages() {
  return prisma.payrollRulePackage.findMany({ select: { id: true, effective_from: true, supported_through: true, certified_at: true }, orderBy: { effective_from: "desc" } });
}
