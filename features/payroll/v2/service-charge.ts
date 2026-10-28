import "server-only";
import { z } from "zod";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { decimal } from "@/features/payroll/money";
import { payrollOwner } from "@/features/payroll/v2/access";
import { PayrollError, type PayrollIdentity } from "@/features/payroll/v2/contracts";
import { fingerprint, json, payrollCommand, stale } from "@/features/payroll/v2/command";
import { commandEnvelope } from "@/features/payroll/v2/schemas";
import { day, phDay } from "@/features/payroll/v2/period";
import { workMinutes } from "@/features/payroll/v2/work-time";
import { distributeServiceCharge, serviceChargeInputSchema, serviceChargeRulesSchema, type ServiceChargeInput } from "@/features/payroll/v2/service-charge-calculation";

export const serviceChargeCommandSchema = commandEnvelope.extend(serviceChargeInputSchema.shape).extend({ expectedHash: z.string().regex(/^[a-f0-9]{64}$/) });
const breaksSchema = z.array(z.object({ start: z.string().datetime(), end: z.string().datetime() }));
async function rosterSources(tx: Prisma.TransactionClient, businessId: string, from: string, to: string) {
  const periodStart = new Date(day(from).getTime() - 8 * 3600000); const periodEnd = new Date(day(to).getTime() + 16 * 3600000);
  const employees = await tx.employee.findMany({ where: { business_id: businessId, OR: [{ employment_start: null }, { employment_start: { lte: day(to) } }], AND: [{ OR: [{ employment_end: null }, { employment_end: { gte: day(from) } }] }] }, select: { id: true, financial_revision: true, employment_start: true, employment_end: true, user: { select: { name: true } } }, orderBy: { id: "asc" } });
  const sessions = await tx.workforceSession.findMany({ where: { business_id: businessId, employee_id: { in: employees.map(entry => entry.id) }, started_at: { lt: periodEnd }, OR: [{ ended_at: { gt: periodStart } }, { ended_at: null, work_date: { gte: day(from), lte: day(to) } }] }, orderBy: { started_at: "asc" } });
  const attendance = await tx.employeeAttendance.findMany({ where: { employee: { business_id: businessId }, employee_id: { in: employees.map(entry => entry.id) }, date: { gte: periodStart, lt: periodEnd }, status: { in: ["PRESENT", "LATE"] } }, select: { id: true, employee_id: true, date: true, revision: true } });
  return { employees, sessions, attendance, periodStart, periodEnd };
}
async function candidate(tx: Prisma.TransactionClient, businessId: string, input: ServiceChargeInput) {
  if (input.to > phDay(new Date())) throw new PayrollError("BLOCKED", "Only completed collection periods can be distributed.");
  if (input.externalWorkersPresent) throw new PayrollError("BLOCKED", "This pool includes workers outside the employee registry. Independently review and record all covered workers before distribution.");
  const settings = await tx.payrollSettings.findUnique({ where: { business_id: businessId }, include: { rule_package: true } });
  if (settings?.calculation_policy === "SIMPLE") throw new PayrollError("BLOCKED", "Automatic service-charge distribution requires government-calculation setup. Record externally calculated shares as named manual additions.");
  if (!settings?.rule_package?.certified_at || settings.mode !== "ACTIVE") throw new PayrollError("BLOCKED", "Activate reconciled payroll with certified service-charge rules before recording earnings.");
  const rule = serviceChargeRulesSchema.safeParse((settings.rule_package.rules as Record<string, unknown>).serviceCharge);
  if (!rule.success || settings.rule_package.effective_from > day(input.from) || settings.rule_package.supported_through < day(input.to)) throw new PayrollError("BLOCKED", "Certified service-charge rules must cover the whole collection period.");
  if ((day(input.to).getTime() - day(input.from).getTime()) / 86400000 + 1 > rule.data.maxPeriodDays) throw new PayrollError("BLOCKED", "The collection period exceeds the certified distribution interval.");
  const existing = await tx.payrollServiceChargePool.findUnique({ where: { business_id_reference: { business_id: businessId, reference: input.reference } }, select: { id: true } });
  if (existing) throw new PayrollError("CONFLICT", "This collection reference was already distributed. Review a linked adjustment for corrections.");
  const sources = await rosterSources(tx, businessId, input.from, input.to);
  const roster = new Map(input.roster.map(entry => [entry.employeeId, entry]));
  if (roster.size !== sources.employees.length || sources.employees.some(entry => !roster.has(entry.id))) throw new PayrollError("STALE_REVIEW", "Review eligibility for every employee employed in the collection period. External contractor cases require separate independent review.");
  const worked = sources.employees.filter(entry => roster.get(entry.id)!.eligible).map(employee => {
    if (!employee.employment_start) throw new PayrollError("BLOCKED", "Verify employment dates for every eligible worker.");
    const sessions = sources.sessions.filter(entry => entry.employee_id === employee.id);
    if (sessions.some(entry => entry.work_date < employee.employment_start! || (employee.employment_end && entry.work_date > employee.employment_end))) throw new PayrollError("BLOCKED", "Work sessions outside verified employment dates require correction.");
    if (sessions.some(entry => !entry.confirmed_at || !entry.ended_at)) throw new PayrollError("BLOCKED", "Resolve unconfirmed or incomplete work sessions before distributing service charges.");
    const dates = new Set(sessions.map(entry => entry.work_date.toISOString().slice(0, 10)));
    if (sources.attendance.some(entry => entry.employee_id === employee.id && !dates.has(phDay(entry.date)))) throw new PayrollError("BLOCKED", "Review actual worked time for attendance without a confirmed session.");
    const intervals = sessions.map(entry => {
      const parsed = breaksSchema.safeParse(entry.breaks);
      if (!parsed.success) throw new PayrollError("BLOCKED", "Review the recorded session breaks.");
      return { startedAt: entry.started_at, endedAt: entry.ended_at!, breaks: parsed.data };
    });
    workMinutes(intervals, 0);
    const clipped = intervals.map(entry => ({ startedAt: new Date(Math.max(entry.startedAt.getTime(), sources.periodStart.getTime())), endedAt: new Date(Math.min(entry.endedAt.getTime(), sources.periodEnd.getTime())), breaks: entry.breaks.flatMap(pause => { const start = Math.max(Date.parse(pause.start), sources.periodStart.getTime()); const end = Math.min(Date.parse(pause.end), sources.periodEnd.getTime()); return end > start ? [{ start: new Date(start).toISOString(), end: new Date(end).toISOString() }] : []; }) }));
    const time = workMinutes(clipped, 0);
    return { employeeId: employee.id, workedMilliseconds: String(time.totalMs) };
  });
  const allocations = distributeServiceCharge(input.amount, worked);
  const snapshot = { input, allocations, rulePackageId: settings.rule_package.id, ruleHash: settings.rule_package.content_hash, rule: rule.data, settingsRevision: settings.revision, employees: sources.employees.map(entry => ({ id: entry.id, revision: entry.financial_revision, employmentStart: entry.employment_start, employmentEnd: entry.employment_end })), sessions: sources.sessions.map(entry => ({ id: entry.id, employeeId: entry.employee_id, revision: entry.revision, start: entry.started_at, end: entry.ended_at, breaks: entry.breaks, confirmedBy: entry.confirmed_by, confirmedAt: entry.confirmed_at })), attendance: sources.attendance };
  return { snapshot, revision: settings.revision, hash: fingerprint(snapshot), names: new Map(sources.employees.map(entry => [entry.id, entry.user.name])) };
}
export async function serviceChargeRoster(identity: PayrollIdentity, from: string, to: string) {
  const actor = await payrollOwner(identity);
  const sources = await prisma.$transaction(tx => rosterSources(tx, actor.businessId, from, to), { isolationLevel: "RepeatableRead" });
  await payrollOwner(identity);
  return sources.employees.map(entry => ({ employeeId: entry.id, name: entry.user.name, confirmedSessions: sources.sessions.filter(session => session.employee_id === entry.id && session.confirmed_at && session.ended_at).length, missingEmploymentDate: !entry.employment_start }));
}
export async function previewServiceCharge(identity: PayrollIdentity, input: ServiceChargeInput) {
  const actor = await payrollOwner(identity);
  const result = await prisma.$transaction(tx => candidate(tx, actor.businessId, serviceChargeInputSchema.parse(input)), { isolationLevel: "RepeatableRead" });
  await payrollOwner(identity);
  return { expectedHash: result.hash, expectedRevision: result.revision, allocations: result.snapshot.allocations.map(entry => ({ ...entry, name: result.names.get(entry.employeeId) ?? "Employee" })), total: input.amount, rulePackageId: result.snapshot.rulePackageId };
}
export async function recordServiceCharge(identity: PayrollIdentity, input: z.infer<typeof serviceChargeCommandSchema>) {
  return payrollCommand(identity, "SERVICE_CHARGE_DISTRIBUTION", input, async (tx, actor) => {
    const result = await candidate(tx, actor.businessId, serviceChargeInputSchema.parse(input));
    stale(result.revision, input.expectedRevision);
    if (result.hash !== input.expectedHash) throw new PayrollError("STALE_REVIEW", "Collection, eligibility, or time records changed. Review the new distribution.");
    const pool = await tx.payrollServiceChargePool.create({ data: { business_id: actor.businessId, reference: input.reference, from: day(input.from), to: day(input.to), amount: decimal(input.amount), review_hash: result.hash, snapshot: json(result.snapshot), actor_id: actor.userId } });
    await tx.payrollEarning.createMany({ data: result.snapshot.allocations.filter(entry => decimal(entry.amount).gt(0)).map(entry => ({ business_id: actor.businessId, employee_id: entry.employeeId, source_type: "SERVICE_CHARGE", source_id: pool.id + ":" + entry.employeeId, source_revision: 0, earned_on: day(input.to), payable_on: day(input.to), code: "SERVICE_CHARGE", description: "Service charge · " + input.reference, amount: decimal(entry.amount), rate: decimal(entry.amount), units: 1, taxable: result.snapshot.rule.taxable, tax_category: result.snapshot.rule.taxable ? "NORMAL" : "EXEMPT", is_basic: false, snapshot: json({ poolId: pool.id, reference: input.reference, collectionPeriod: { from: input.from, to: input.to }, workedMilliseconds: entry.workedMilliseconds, eligibility: input.roster.find(worker => worker.employeeId === entry.employeeId), collectionEvidence: input.collectionEvidence, rulePackageId: result.snapshot.rulePackageId, ruleHash: result.snapshot.ruleHash, reviewHash: result.hash }) })) });
    await tx.employee.updateMany({ where: { business_id: actor.businessId, id: { in: result.snapshot.allocations.map(entry => entry.employeeId) } }, data: { financial_revision: { increment: 1 } } });
    return { id: pool.id };
  });
}
