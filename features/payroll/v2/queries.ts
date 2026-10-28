import "server-only";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { amount, decimal } from "@/features/payroll/money";
import { payrollOwner, payrollSelf } from "./access";
import type { PayrollIdentity, PayrollWorkspaceView, StatementView, PayrollLine, PayrollIssue } from "./contracts";
import { phDay } from "./period";
import { currentPayEstimate } from "./estimate";

const detailInclude = { lines: { orderBy: { id: "asc" as const } }, payments: { orderBy: { payment_date: "asc" as const } }, run: true, employee: { select: { user: { select: { name: true } } } } } satisfies Prisma.PayrollStatementInclude;
type StatementRecord = Prisma.PayrollStatementGetPayload<{ include: typeof detailInclude }>;
export function statementView(entry: StatementRecord): StatementView {
  const snapshot = entry.snapshot as { employeeName?: string; legacyAggregate?: boolean; recordedDeduction?: number; previousReview?: StatementView["previousReview"] };
  return { id: entry.id, employeeId: entry.employee_id, employeeName: snapshot.employeeName ?? entry.employee.user.name, status: entry.status, paymentState: entry.payment_state, revision: entry.revision,
    gross: amount(entry.gross), deductions: amount(entry.deductions), net: amount(entry.net), employerCost: amount(entry.employer_cost), paidAmount: amount(entry.paid_amount),
    periodStart: entry.run.start_date.toISOString().slice(0, 10), periodEnd: entry.run.end_date.toISOString().slice(0, 10), paymentDate: entry.run.payment_date.toISOString().slice(0, 10), publishedAt: entry.published_at?.toISOString() ?? null,
    calculationPolicy: entry.run.calculation_policy ?? "GOVERNMENT",
    legacyAggregate: snapshot.legacyAggregate, recordedLegacyDeduction: snapshot.recordedDeduction === undefined ? undefined : amount(snapshot.recordedDeduction), previousReview: snapshot.previousReview,
    issues: entry.issues as PayrollIssue[],
    lines: entry.lines.map(line => ({ code: line.code, description: line.description, category: line.category as PayrollLine["category"], amount: amount(line.amount), rate: line.rate?.toString(), units: line.units?.toString(), earningId: line.earning_id ?? undefined, source: line.source as PayrollLine["source"] })),
    payments: entry.payments.map(payment => ({ id: payment.id, amount: amount(payment.amount), date: payment.payment_date.toISOString().slice(0, 10), method: payment.method, reference: payment.reference })),
  };
}
export async function payrollWorkspace(identity: PayrollIdentity, page = 1): Promise<PayrollWorkspaceView> {
  const actor = await payrollOwner(identity);
  const membership = { owners: { some: { id: actor.ownerId, user_id: actor.userId, permissions: { has: "PAYROLL_MANAGE" as const }, user: { role: "OWNER" as const } } } };
  const [settings, employees, runs, workforceOwner] = await Promise.all([
    prisma.payrollSettings.findFirst({ where: { business_id: actor.businessId, business: membership }, include: { rule_package: { select: { certified_at: true, supported_through: true } } } }),
    prisma.employee.findMany({ where: { business_id: actor.businessId, business: membership, archived_at: null, user: { role: "EMPLOYEE" } }, select: { id: true, financial_revision: true, employment_start: true, employment_end: true, user: { select: { name: true } }, payroll_profile: { select: { opening_confirmed_at: true } }, compensation_agreements: { orderBy: { effective_from: "desc" } } }, orderBy: { user: { name: "asc" } } }),
    prisma.payrollRun.findMany({ where: { business_id: actor.businessId, business: membership }, orderBy: { created_at: "desc" }, skip: (page - 1) * 10, take: 11, include: { statements: { include: detailInclude, orderBy: { employee_id: "asc" } } } }),
    prisma.owner.findFirst({ where: { id: actor.ownerId, business_id: actor.businessId, user_id: actor.userId, permissions: { has: "WORKFORCE_MANAGE" } }, select: { id: true } }),
  ]);
  await payrollOwner(identity);
  return { mode: settings?.mode ?? "LEGACY", calculationPolicy: settings?.calculation_policy ?? "SIMPLE", simpleEffectiveFrom: settings?.simple_effective_from?.toISOString().slice(0, 10) ?? null, governmentEffectiveFrom: settings?.government_effective_from?.toISOString().slice(0, 10) ?? null, revision: settings?.revision ?? 0, cadence: settings?.cadence ?? "SEMIMONTHLY", smsEnabled: settings?.sms_enabled ?? false,
    rulePackageId: settings?.rule_package_id ?? null, ruleReady: Boolean(settings?.rule_package?.certified_at && phDay(settings.rule_package.supported_through) >= phDay(new Date())),
    canManageWorkforce: Boolean(workforceOwner), openingConfirmed: Boolean(settings?.opening_confirmed_at), payDays: settings?.pay_days ?? [15, 30], reconciliation: settings?.reconciliation as PayrollWorkspaceView["reconciliation"], page, hasMore: runs.length > 10,
    employees: employees.map(employee => ({ id: employee.id, name: employee.user.name, revision: employee.financial_revision, employmentStart: employee.employment_start?.toISOString().slice(0, 10) ?? null, employmentEnd: employee.employment_end?.toISOString().slice(0, 10) ?? null, profileReady: Boolean(employee.payroll_profile?.opening_confirmed_at), agreements: employee.compensation_agreements.map(agreement => ({ id: agreement.id, from: agreement.effective_from.toISOString().slice(0, 10), to: agreement.effective_to?.toISOString().slice(0, 10) ?? null, basis: agreement.basis, rate: agreement.rate.toString(), commissionRate: agreement.commission_rate.toString(), hours: agreement.normal_hours.toString(), monthlyDivisor: agreement.monthly_divisor?.toString() ?? null, commissionBasis: agreement.commission_basis })) })),
    runs: runs.slice(0, 10).map(run => ({ id: run.id, calculationPolicy: run.calculation_policy ?? "GOVERNMENT", revision: run.revision, start: run.start_date.toISOString().slice(0, 10), end: run.end_date.toISOString().slice(0, 10), paymentDate: run.payment_date.toISOString().slice(0, 10), kind: run.kind, employeeCount: run.employee_ids.length || run.statements.length, preparedCount: run.statements.length, statements: run.statements.map(statementView) })),
  };
}
export async function myPay(identity: PayrollIdentity, page = 1) {
  const actor = await payrollSelf(identity);
  const [statements, pending, notifications, leave, estimate, outstanding] = await Promise.all([
    prisma.payrollStatement.findMany({ where: { business_id: actor.businessId, employee_id: actor.employeeId, status: "PUBLISHED" }, include: detailInclude, orderBy: { published_at: "desc" }, take: 21, skip: (page - 1) * 20 }),
    prisma.payrollEarning.findMany({ where: { business_id: actor.businessId, employee_id: actor.employeeId, statement_id: null, reversed_at: null }, select: { id: true, code: true, amount: true, payable_on: true, earned_on: true, description: true } }),
    prisma.payrollNotification.findMany({ where: { business_id: actor.businessId, user_id: actor.userId, read_at: null }, select: { id: true, statement_id: true }, take: 100 }),
    prisma.leaveEntitlement.findMany({ where: { business_id: actor.businessId, employee_id: actor.employeeId }, select: { id: true, benefit_code: true, granted_units: true, converted_units: true, period_end: true, allocations: { where: { cancelled_at: null }, select: { units: true } } } }),
    currentPayEstimate(identity),
    prisma.payrollStatement.aggregate({ where: { business_id: actor.businessId, employee_id: actor.employeeId, status: "PUBLISHED" }, _sum: { net: true, paid_amount: true } }),
  ]);
  await payrollSelf(identity);
  return { statements: statements.slice(0, 20).map(statementView), hasMore: statements.length > 20, page, estimate, outstandingTotal: amount(decimal(outstanding._sum.net ?? 0).minus(outstanding._sum.paid_amount ?? 0)),
    estimated: pending.map(entry => ({ id: entry.id, code: entry.code, amount: amount(entry.amount), earnedOn: entry.earned_on.toISOString().slice(0, 10), payable: Boolean(entry.payable_on), description: entry.description })),
    notifications: notifications.map(entry => ({ id: entry.id, statementId: entry.statement_id })),
    leave: leave.map(entry => ({ id: entry.id, code: entry.benefit_code, granted: entry.granted_units.toString(), used: entry.allocations.reduce((total, allocation) => total.plus(allocation.units), entry.converted_units).toString(), until: entry.period_end.toISOString().slice(0, 10) })),
  };
}
export async function myPublishedStatement(identity: PayrollIdentity, statementId: string) {
  const actor = await payrollSelf(identity);
  const statement = await prisma.payrollStatement.findFirst({ where: { id: statementId, employee_id: actor.employeeId, business_id: actor.businessId, status: "PUBLISHED" }, include: detailInclude });
  await payrollSelf(identity);
  return statement ? statementView(statement) : null;
}
export async function readPayNotification(identity: PayrollIdentity, statementId: string) {
  return prisma.$transaction(async tx => {
    const actor = await payrollSelf(identity, tx);
    await tx.payrollNotification.updateMany({ where: { statement_id: statementId, user_id: actor.userId, business_id: actor.businessId, read_at: null }, data: { read_at: new Date() } });
  }, { isolationLevel: "Serializable" });
}
export async function pendingAdjustments(identity: PayrollIdentity) {
  const actor = await payrollOwner(identity);
  const consumed = await prisma.payrollEarning.findMany({ where: { business_id: actor.businessId, source_type: "ADJUSTMENT", statement: { is: { status: "PUBLISHED" } } }, select: { source_id: true } });
  const entries = await prisma.payrollAdjustment.findMany({ where: { business_id: actor.businessId, id: { notIn: consumed.map(entry => entry.source_id) }, disposition: { in: ["PENDING", "DEFERRED", "APPROVED"] } }, take: 100, orderBy: { created_at: "asc" }, select: { id: true, employee_id: true, amount: true, reason: true, disposition: true, revision: true } });
  await payrollOwner(identity);
  return entries.map(entry => ({ id: entry.id, employeeId: entry.employee_id, amount: amount(entry.amount), reason: entry.reason, disposition: entry.disposition, revision: entry.revision }));
}
