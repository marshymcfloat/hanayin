import "server-only";
import { z } from "zod";
import type { Prisma, PayrollRun, PayrollEarning } from "@/prisma/generated/prisma/client";
import { amount, decimal, money, sum, Decimal } from "@/features/payroll/money";
import { PayrollError, type PayrollCalculation, type PayrollIssue, type PayrollLine } from "./contracts";
import { fingerprint, json } from "./command";
import { day, days, phDay, cutoff, taxPeriodKey } from "./period";
import { calculateStatutory, emptyContext, minimumWage, phRulesSchema, workPremium } from "./statutory";
import { eligibilitySchema } from "./schemas";
import { workMinutes } from "./work-time";
import { eligibilityAt, openingForYear } from "./profile-history";
import { taxableCompensation } from "@/features/payroll/v2/taxable-benefits";
import { receiptTaxContext, remainingPlanned, type TaxReceipt } from "@/features/payroll/v2/tax-context";
import { matureLeaveAward } from "@/features/payroll/v2/leave-award-earnings";

const breakSchema = z.array(z.object({ start: z.string(), end: z.string() }));
const iso = (value: Date) => value.toISOString().slice(0, 10);
export async function calculateStatement(tx: Prisma.TransactionClient, businessId: string, employeeId: number, run: Pick<PayrollRun, "id" | "start_date" | "end_date" | "payment_date" | "kind"> & { calculation_policy?: "SIMPLE" | "GOVERNMENT" }, statementId?: string, project = true) {
  const simple = run.calculation_policy === "SIMPLE";
  const settings = await tx.payrollSettings.findUnique({ where: { business_id: businessId }, include: { rule_package: true } });
  const employee = await tx.employee.findFirst({
    where: { id: employeeId, business_id: businessId, archived_at: null, user: { role: "EMPLOYEE" } },
    include: { user: { select: { name: true } }, compensation_agreements: true, payroll_profile: true, schedule: true, business: { select: { timezone: true, formal_schedule_enabled: true, business_hours: true, special_dates: true } } },
  });
  if (!employee) throw new PayrollError("NOT_FOUND", "Employee not found.");
  const start = iso(run.start_date); const end = iso(run.end_date); const paymentDate = iso(run.payment_date);
  const issues: PayrollIssue[] = []; const lines: PayrollLine[] = [];
  const projectedWork: PayrollEarning[] = [];
  const projectedIds: string[] = [];
  if (employee.business.timezone !== "Asia/Manila") issues.push({ code: "TIMEZONE", message: "This payroll release supports the Philippines timezone." });
  if (end > phDay(new Date())) issues.push({ code: "FUTURE_PERIOD", message: "Future work cannot be published." });
  if (!simple && run.kind === "REGULAR" && (day(end).getTime() - day(start).getTime()) / 86400000 > (settings?.cadence === "WEEKLY" ? 6 : 15)) issues.push({ code: "PERIOD_CADENCE", message: "Use a regular work period matching the configured weekly or twice-monthly payment schedule." });
  const profile = employee.payroll_profile;
  const monthlyBasisHistory = z.array(z.object({ from: z.string().regex(/^\d{4}-\d{2}$/), basic: z.string().regex(/^\d+(\.\d+)?$/) })).safeParse(profile?.monthly_basic_history);
  const monthlyBasis = monthlyBasisHistory.success ? [...monthlyBasisHistory.data].filter(entry => entry.from <= paymentDate.slice(0, 7)).sort((a, b) => b.from.localeCompare(a.from))[0] : undefined;
  if (!simple && !monthlyBasis) issues.push({ code: "MONTHLY_BASIS", message: "Confirm an effective monthly basic-salary basis covering this contribution month." });
  const taxYear = Number((run.kind === "YEAR_END" ? end : paymentDate).slice(0, 4));
  const legalAtAssessment = eligibilityAt(profile?.eligibility_history, run.kind === "YEAR_END" ? end : paymentDate);
  const eligibility = eligibilitySchema.safeParse(legalAtAssessment?.eligibility);
  const opening = openingForYear(profile?.opening_history, profile?.ytd_opening, taxYear);
  const rules = phRulesSchema.safeParse(settings?.rule_package?.rules);
  if (!simple && (!profile || !profile.opening_confirmed_at || !eligibility.success || !opening.success || opening.data.year !== taxYear)) issues.push({ code: "PROFILE", message: "Complete effective statutory eligibility and confirmed opening/YTD records for this tax year." });
  if (!simple && !profile?.encrypted_identifiers) issues.push({ code: "IDENTIFIERS", message: "Government identifiers require payroll setup." });
  if (!simple && (!settings?.rule_package?.certified_at || !rules.success || settings.rule_package.effective_from > run.start_date || settings.rule_package.supported_through < run.payment_date)) issues.push({ code: "RULES", message: "Independently certified rules must cover this work and payment date." });
  if (!employee.employment_start) issues.push({ code: "EMPLOYMENT", message: "Add Joined on in this person's People profile before preparing pay." });
  const [attendance, sessions, leave, existingEarnings, priorStatements, pendingAdjustments] = await Promise.all([
    tx.employeeAttendance.findMany({ where: { employee_id: employeeId, employee: { business_id: businessId }, date: { gte: new Date(start + "T00:00:00+08:00"), lt: cutoff(end) } }, orderBy: { date: "asc" } }),
    tx.workforceSession.findMany({ where: { employee_id: employeeId, business_id: businessId, work_date: { gte: run.start_date, lte: run.end_date } }, orderBy: { started_at: "asc" } }),
    tx.leaveAllocation.findMany({ where: { employee_id: employeeId, business_id: businessId, work_date: { gte: run.start_date, lte: run.end_date }, cancelled_at: null }, include: { entitlement: true } }),
    tx.payrollEarning.findMany({ where: { employee_id: employeeId, business_id: businessId, OR: [{ statement_id: null }, ...(statementId ? [{ statement_id: statementId }] : [])] }, orderBy: [{ earned_on: "asc" }, { id: "asc" }] }),
    tx.payrollStatement.findMany({ where: { employee_id: employeeId, business_id: businessId, status: "PUBLISHED", legacy_payslip_id: null, run: { calculation_policy: "GOVERNMENT" }, OR: [{ run: { payment_date: { gte: day(String(taxYear) + "-01-01"), lte: run.payment_date } } }, { payments: { some: { payment_date: { gte: day(String(taxYear) + "-01-01"), lte: run.payment_date } } } }] }, include: { assessments: true, run: true, lines: { include: { earning: { select: { taxable: true, tax_category: true } } } }, payments: { include: { allocations: true } } } }),
    tx.payrollAdjustment.findMany({ where: { employee_id: employeeId, business_id: businessId, disposition: "PENDING" }, select: { id: true } }),
  ]);
  const unverifiedCommission = await tx.availedService.findFirst({ where: { served_by_id: employeeId, booking: { business_id: businessId }, status: "COMPLETED", completed_at: { lt: cutoff(end) }, cancelled_at: null, paid_in_payslip_id: null, OR: [{ payroll_commission_rate: null }, { payroll_commission_base: null }] }, select: { id: true } });
  if (unverifiedCommission) issues.push({ code: "COMMISSION_SETUP", message: "Confirm the unallocated commission rate, captured base, and customer-payment date before publication.", sourceId: String(unverifiedCommission.id) });
  if (pendingAdjustments.length) issues.push({ code: "ADJUSTMENT_REVIEW", message: "Decide pending adjustments before publishing.", sourceId: pendingAdjustments[0].id });
  const publishedSources = await tx.payrollEarning.findMany({ where: { employee_id: employeeId, business_id: businessId, source_type: "WORKDAY", statement: { is: { status: "PUBLISHED" } }, earned_on: { gte: run.start_date, lte: run.end_date } }, select: { source_id: true } });
  const priorMonthlyBasic = await tx.payrollEarning.findMany({ where: { employee_id: employeeId, business_id: businessId, source_type: "WORKDAY", code: "BASIC", statement: { is: { status: "PUBLISHED" } }, earned_on: { gte: day(start.slice(0, 7) + "-01"), lt: run.start_date } }, select: { amount: true, snapshot: true, earned_on: true } });
  const monthlyCarry = new Map<string, { exact: Decimal; rounded: Decimal }>();
  for (const earning of priorMonthlyBasic) {
    const snapshot = earning.snapshot as { agreementId?: string; rawBasic?: string; basis?: string };
    if (snapshot.basis !== "MONTHLY" || !snapshot.agreementId) continue;
    const group = snapshot.agreementId + ":" + iso(earning.earned_on).slice(0, 7);
    const current = monthlyCarry.get(group) ?? { exact: decimal(0), rounded: decimal(0) };
    current.exact = current.exact.plus(snapshot.rawBasic ?? earning.amount); current.rounded = current.rounded.plus(earning.amount); monthlyCarry.set(group, current);
  }
  const consumed = new Set(publishedSources.map(entry => entry.source_id));
  const facts: unknown[] = [];
  for (const workDate of days(start, end)) {
    if (!["REGULAR", "FINAL_PAY"].includes(run.kind)) continue;
    if (employee.employment_start && workDate < iso(employee.employment_start)) continue;
    if (employee.employment_end && workDate > iso(employee.employment_end)) continue;
    if (workDate > phDay(new Date())) continue;
    const legalWork = eligibilityAt(profile?.eligibility_history, workDate);
    const dayEligibility = eligibilitySchema.safeParse(legalWork?.eligibility);
    if (!simple && (!legalWork || !dayEligibility.success)) { issues.push({ code: "ELIGIBILITY_HISTORY", message: workDate + ": verify effective employment eligibility and work location." }); continue; }
    const weekday = day(workDate).getUTCDay();
    const schedule = employee.schedule.filter(entry => entry.day_of_week === weekday);
    const hours = employee.business.business_hours.filter(entry => entry.day_of_week === weekday && !entry.is_closed);
    const scheduled = employee.business.formal_schedule_enabled && employee.schedule.length
      ? schedule.length > 0 : !employee.recurring_days_off.includes(weekday) && hours.length > 0;
    const rows = attendance.filter(entry => phDay(entry.date) === workDate);
    const record = rows[0];
    const leaveRows = leave.filter(entry => iso(entry.work_date) === workDate);
    if (leaveRows.some(entry => entry.paid_in_payslip_id !== null)) continue;
    const paidLeave = leaveRows.find(entry => entry.paid);
    if (record?.status === "LEAVE" && !leaveRows.length) { issues.push({ code: "LEAVE_REVIEW", message: workDate + ": link this leave to a reviewed request and entitlement." }); continue; }
    const workSessions = sessions.filter(entry => iso(entry.work_date) === workDate);
    const agreement = employee.compensation_agreements.find(entry => iso(entry.effective_from) <= workDate && (!entry.effective_to || iso(entry.effective_to) >= workDate));
    facts.push({ workDate, scheduled, legalWork, rows, leaveRows, workSessions, agreement });
    if (rows.length > 1 || (leaveRows.length && record && ["PRESENT", "LATE"].includes(record.status))) { issues.push({ code: "WORK_LEAVE_CONFLICT", message: workDate + ": resolve conflicting work/leave records.", sourceId: String(record?.id ?? leaveRows[0].id) }); continue; }
    if (!agreement) { issues.push({ code: "AGREEMENT", message: workDate + ": an effective compensation agreement is required." }); continue; }
    const sourceId = employeeId + ":" + workDate;
    if (consumed.has(sourceId) || record?.paid_in_payslip_id) continue;
    const worked = record && ["PRESENT", "LATE"].includes(record.status);
    const holiday = !simple && rules.success && profile && legalWork ? rules.data.holidays.find(entry => entry.date === workDate && (entry.region === "PH" || entry.region === legalWork.region)) : undefined;
    if (!record && !leaveRows.length && scheduled) { issues.push({ code: "MISSING_ATTENDANCE", message: workDate + ": confirm work, absence, or leave." }); continue; }
    if (!employee.business.business_hours.length && !employee.schedule.length) { issues.push({ code: "SCHEDULE", message: "Confirm scheduled working days in People." }); continue; }
    if (worked && !record.payroll_confirmed_at && (!record.time_in || !record.time_out)) { issues.push({ code: "MISSING_CLOCK", message: workDate + ": review incomplete clocks.", sourceId: String(record.id) }); continue; }
    const intervals = workSessions.length ? workSessions.filter(entry => entry.ended_at).map(entry => ({ startedAt: entry.started_at, endedAt: entry.ended_at!, breaks: breakSchema.parse(entry.breaks) }))
      : record?.time_in && record.time_out ? [{ startedAt: record.time_in, endedAt: record.time_out, breaks: [] }] : [];
    if (workSessions.some(entry => !entry.ended_at || !entry.confirmed_at)) { issues.push({ code: "SESSION_REVIEW", message: workDate + ": confirm sessions and breaks." }); continue; }
    const minutes = workMinutes(intervals, agreement.normal_hours.times(60).toNumber());
    if (worked && !workSessions.length && !record.payroll_confirmed_at && (agreement.basis === "HOURLY" || !simple && (minutes.overtime > 0 || minutes.nightOrdinary > 0 || minutes.nightOvertime > 0))) { issues.push({ code: "SESSION_REVIEW", message: workDate + ": review clock intervals and breaks before hourly pay or time premiums.", sourceId: String(record.id) }); continue; }
    if (intervals.some(interval => phDay(interval.startedAt) !== workDate)) { issues.push({ code: "SESSION_DATE", message: workDate + ": the shift must start on its recorded working date." }); continue; }
    if (!simple && employee.business.special_dates.some(entry => phDay(entry.date) === workDate)) { issues.push({ code: "COMPANY_PREMIUM", message: workDate + ": review the company special-date policy and record any additional approved premium." }); }
    if (paidLeave?.funding === "SSS") {
      if (simple) continue;
      try {
        const awards = await matureLeaveAward(tx, paidLeave, statementId, project);
        projectedIds.push(...awards.map(entry => entry.id));
        if (!project) projectedWork.push(...awards);
      } catch (error) {
        if (!(error instanceof PayrollError)) throw error;
        issues.push({ code: "LEAVE_AWARD", message: workDate + ": " + error.message, sourceId: paidLeave.entitlement_id ?? undefined });
      }
      continue;
    }
    if (worked && agreement.basis === "HOURLY" && !intervals.length) { issues.push({ code: "HOURLY_CLOCK", message: workDate + ": hourly pay requires confirmed times." }); continue; }
    const calendarDays = new Date(Date.UTC(day(workDate).getUTCFullYear(), day(workDate).getUTCMonth() + 1, 0)).getUTCDate();
    const dailyRate = agreement.basis === "DAILY" ? agreement.rate : agreement.basis === "HOURLY" ? agreement.rate.times(agreement.normal_hours) : agreement.rate.div(simple ? calendarDays : agreement.monthly_divisor ?? 1);
    if (!simple && rules.success && dayEligibility.success && profile && legalWork && !dayEligibility.data.minimumWageExempt) {
      const minimum = minimumWage(rules.data, legalWork.region, legalWork.category, workDate);
      const equivalentForMinimum = dailyRate.div(agreement.normal_hours).times(8);
      if (!minimum || equivalentForMinimum.lt(minimum)) issues.push({ code: "MINIMUM_WAGE", message: workDate + ": verify the regional wage requirement and compensation." });
    }
    let basic = decimal(0);
    if (agreement.basis === "MONTHLY") {
      const monthDays = new Date(Date.UTC(day(workDate).getUTCFullYear(), day(workDate).getUTCMonth() + 1, 0)).getUTCDate();
      basic = agreement.rate.div(monthDays);
      if ((record?.status === "ABSENT" || (leaveRows.length > 0 && !paidLeave)) && scheduled) basic = basic.minus(dailyRate);
    } else if (worked) basic = agreement.basis === "HOURLY" ? agreement.rate.times(simple || dayEligibility.success && !dayEligibility.data.overtime ? minutes.totalMs : minutes.ordinaryMs).div(3600000) : agreement.rate;
    else if (paidLeave && (scheduled || paidLeave.benefit_code !== "DISCRETIONARY")) basic = paidLeave.funding === "SSS" ? decimal(0) : dailyRate.times(paidLeave.units);
    else if (holiday?.type === "regular" && dayEligibility.success && dayEligibility.data.holiday && scheduled) {
      issues.push({ code: "HOLIDAY_ELIGIBILITY", message: workDate + ": confirm unworked holiday eligibility through attendance review." });
      if (record?.payroll_confirmed_at) { issues.pop(); basic = dailyRate; }
    }
    const dayLines: { code: string; description: string; value: string; basic: boolean; units: string }[] = [];
    const rawBasic = basic.toString();
    if (agreement.basis === "MONTHLY") {
      const group = agreement.id + ":" + workDate.slice(0, 7);
      const carry = monthlyCarry.get(group) ?? { exact: decimal(0), rounded: decimal(0) };
      carry.exact = carry.exact.plus(basic); const next = money(carry.exact); basic = next.minus(carry.rounded); carry.rounded = next; monthlyCarry.set(group, carry);
    }
    if (!basic.isZero()) dayLines.push({ code: "BASIC", description: workDate + (paidLeave ? " · paid leave" : " · basic pay"), value: amount(basic), basic: true, units: agreement.basis === "HOURLY" ? decimal(simple || dayEligibility.success && !dayEligibility.data.overtime ? minutes.totalMs : minutes.ordinaryMs).div(3600000).toDecimalPlaces(6).toString() : "1" });
    if (!simple && worked && rules.success && dayEligibility.success && legalWork) {
      const portions = minutes.days.length ? minutes.days : [{ date: workDate, ordinaryMs: agreement.normal_hours.times(3600000).toNumber(), overtimeMs: 0, nightOrdinaryMs: 0, nightOvertimeMs: 0 }];
      const totals = { premium: decimal(0), overtime: decimal(0), night: decimal(0) };
      for (const portion of portions) {
        const portionWeekday = day(portion.date).getUTCDay();
        const portionScheduled = employee.business.formal_schedule_enabled && employee.schedule.length ? employee.schedule.some(entry => entry.day_of_week === portionWeekday) : !employee.recurring_days_off.includes(portionWeekday) && employee.business.business_hours.some(entry => entry.day_of_week === portionWeekday && !entry.is_closed);
        const portionHoliday = rules.data.holidays.find(entry => entry.date === portion.date && (entry.region === "PH" || entry.region === legalWork.region));
        const type = portionHoliday ? portionHoliday.type === "doubleRegular" ? (portionScheduled ? "doubleRegular" : "doubleRegularRest") : portionHoliday.type === "regular" ? (portionScheduled ? "regular" : "regularRest") : (portionScheduled ? "special" : "specialRest") : portionScheduled ? "ordinary" : "rest";
        const premiums = workPremium({ rules: rules.data, dailyRate: dailyRate.toString(), normalHours: agreement.normal_hours.toString(), ordinaryMinutes: decimal(portion.ordinaryMs).div(60000).toString(), overtimeMinutes: decimal(portion.overtimeMs).div(60000).toString(), nightOrdinaryMinutes: decimal(portion.nightOrdinaryMs).div(60000).toString(), nightOvertimeMinutes: decimal(portion.nightOvertimeMs).div(60000).toString(), dayType: type, overtimeEligible: dayEligibility.data.overtime, nightEligible: dayEligibility.data.night });
        for (const code of ["premium", "overtime", "night"] as const) totals[code] = totals[code].plus(premiums[code]);
      }
      for (const [code, value] of Object.entries(totals)) if (value.gt(0)) dayLines.push({ code: code.toUpperCase(), description: workDate + " · " + code + " pay", value: amount(value), basic: false, units: "1" });
    }
    for (const entry of dayLines) {
      const snapshot = { calculationPolicy: simple ? "SIMPLE" : "GOVERNMENT", workDate, attendanceId: record?.id ?? null, attendanceRevision: record?.revision ?? 0, agreementId: agreement.id, basis: agreement.basis, rawBasic, workMs: minutes.totalMs, thirteenthEligible: !simple && dayEligibility.success && dayEligibility.data.thirteenthMonth, funding: paidLeave?.funding ?? "EMPLOYER",
        attendance: record ? { status: record.status, timeIn: record.time_in?.toISOString() ?? null, timeOut: record.time_out?.toISOString() ?? null, confirmedAt: record.payroll_confirmed_at?.toISOString() ?? null, confirmedBy: record.payroll_confirmed_by } : null,
        sessions: workSessions.map(session => ({ start: session.started_at, end: session.ended_at, breaks: session.breaks, confirmedAt: session.confirmed_at, confirmedBy: session.confirmed_by })),
        agreement: { from: agreement.effective_from, to: agreement.effective_to, salaryRate: agreement.rate.toString(), hours: agreement.normal_hours.toString(), commissionRate: agreement.commission_rate.toString(), divisor: agreement.monthly_divisor?.toString() ?? null },
      };
      const revision = record?.revision ?? 0;
      if (project) await tx.payrollEarning.updateMany({ where: { business_id: businessId, employee_id: employeeId, source_type: "WORKDAY", source_id: sourceId, code: entry.code, source_revision: { not: revision }, statement_id: null, reversed_at: null }, data: { reversed_at: new Date() } });
      const prior = existingEarnings.find(earning => earning.source_type === "WORKDAY" && earning.source_id === sourceId && earning.source_revision === revision && earning.code === entry.code && !earning.reversed_at);
      const value: PayrollEarning = project ? await tx.payrollEarning.upsert({
        where: { business_id_source_type_source_id_source_revision_code: { business_id: businessId, source_type: "WORKDAY", source_id: sourceId, source_revision: revision, code: entry.code } },
        create: { business_id: businessId, employee_id: employeeId, source_type: "WORKDAY", source_id: sourceId, source_revision: revision, earned_on: day(workDate), payable_on: day(workDate), code: entry.code, description: entry.description, amount: money(entry.value), rate: agreement.basis === "HOURLY" ? agreement.rate : dailyRate, units: decimal(entry.units), taxable: true, is_basic: entry.basic, snapshot: json(snapshot) },
        update: { amount: money(entry.value), rate: agreement.basis === "HOURLY" ? agreement.rate : dailyRate, units: decimal(entry.units), snapshot: json(snapshot), reversed_at: null },
      }) : { id: "estimate:" + sourceId + ":" + entry.code, business_id: businessId, employee_id: employeeId, source_type: "WORKDAY", source_id: sourceId, source_revision: revision, earned_on: day(workDate), payable_on: day(workDate), code: entry.code, description: entry.description, amount: money(entry.value), rate: dailyRate, units: decimal(entry.units), taxable: true, tax_category: "NORMAL", is_basic: entry.basic, snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.JsonValue, reversed_at: null, statement_id: null, created_at: day(workDate) };
      if (!project) projectedWork.push(value);
      projectedIds.push(value.id);
      if (value.statement_id && value.statement_id !== statementId) { issues.push({ code: "RESERVED", message: "Another payroll run has reserved " + workDate }); continue; }
      if (!prior) existingEarnings.push(value);
    }
  }
  if (project && ["REGULAR", "FINAL_PAY"].includes(run.kind)) await tx.payrollEarning.updateMany({ where: { business_id: businessId, employee_id: employeeId, source_type: { in: ["WORKDAY", "LEAVE_AWARD"] }, earned_on: { gte: run.start_date, lte: run.end_date }, id: { notIn: projectedIds }, reversed_at: null, OR: [{ statement_id: null }, ...(statementId ? [{ statement_id: statementId }] : [])] }, data: { reversed_at: new Date() } });
  let earningRows = await tx.payrollEarning.findMany({ where: {
    business_id: businessId, employee_id: employeeId, reversed_at: null, ...(simple ? { source_type: { in: ["WORKDAY", "SERVICE", "ADJUSTMENT"] } } : {}), earned_on: { lte: run.end_date }, payable_on: { lte: run.end_date },
    OR: [{ statement_id: null }, ...(statementId ? [{ statement_id: statementId }] : [])],
    AND: [["REGULAR", "FINAL_PAY"].includes(run.kind) ? { OR: [{ source_type: { not: "WORKDAY" } }, { earned_on: { gte: run.start_date } }] } : { source_type: { not: "WORKDAY" } }],
  }, orderBy: [{ earned_on: "asc" }, { id: "asc" }] });
  if (!project) earningRows = [...earningRows.filter(entry => !["WORKDAY", "LEAVE_AWARD"].includes(entry.source_type)), ...projectedWork];
  for (const earning of earningRows) {
    const taxCorrection = earning.code === "TAX_RECONCILIATION";
    const deduction = taxCorrection || (earning.source_type === "ADJUSTMENT" && earning.amount.isNegative());
    const captured = earning.snapshot as { basis?: string; agreementId?: string; agreement?: { salaryRate?: string }; authorization?: string; reason?: string; actorId?: string; label?: string; manual?: boolean };
    lines.push({ code: earning.code, description: earning.description, amount: amount(taxCorrection ? earning.amount.negated() : deduction ? earning.amount.abs() : earning.amount), rate: earning.rate.toString(), units: earning.units.toString(), category: deduction ? "DEDUCTION" : "EARNING", earningId: earning.id,
      source: { sourceType: earning.source_type, sourceId: earning.source_id, earnedOn: iso(earning.earned_on), sourceRevision: earning.source_revision, priorPeriod: iso(earning.earned_on) < start, basis: captured.basis ?? null, agreementId: captured.agreementId ?? null, salaryRate: captured.agreement?.salaryRate ?? null, authorization: captured.authorization ?? null, ...(captured.manual ? { manual: true, label: captured.label ?? earning.description, reason: captured.reason ?? null, actorId: captured.actorId ?? null } : {}) } });
  }
  const gross = money(sum(lines.filter(entry => entry.category === "EARNING").map(entry => entry.amount)));
  let deduction = money(sum(lines.filter(entry => entry.category === "DEDUCTION").map(entry => entry.amount)));
  const month = paymentDate.slice(0, 7);
  let assessments: PayrollCalculation["assessments"] = [];
  if (!simple && rules.success && eligibility.success && profile) {
    const previous = emptyContext();
    const monthlyStatements = priorStatements.filter(entry => iso(entry.run.payment_date).slice(0, 7) === month);
    previous.gross = amount(sum(monthlyStatements.flatMap(entry => entry.lines).filter(line => line.category === "EARNING" && rules.data.sssContributionCodes.includes(line.code)).map(line => line.amount)));
    const openingMonth = opening.success ? opening.data.monthlyAssessments.find(entry => entry.month === month) : undefined;
    if (openingMonth) previous.gross = amount(decimal(previous.gross).plus(openingMonth.gross));
    for (const agency of ["SSS", "PHILHEALTH", "PAGIBIG"] as const) {
      const rows = monthlyStatements.flatMap(entry => entry.assessments).filter(entry => entry.agency === agency);
      const key = agency.toLowerCase() as "sss" | "philhealth" | "pagibig";
      previous[key] = { employee: amount(sum(rows.map(entry => entry.employee_share))), employer: amount(sum(rows.map(entry => entry.employer_share))) };
      if (openingMonth) previous[key] = { employee: amount(decimal(previous[key].employee).plus(openingMonth[(key + "Employee") as "sssEmployee" | "philhealthEmployee" | "pagibigEmployee"])), employer: amount(decimal(previous[key].employer).plus(openingMonth[(key + "Employer") as "sssEmployer" | "philhealthEmployer" | "pagibigEmployer"])) };
    }
    const receipts: TaxReceipt[] = [];
    const openingPeriod = opening.success ? opening.data.taxPeriodContexts.find(entry => entry.period === taxPeriodKey(settings?.cadence ?? "SEMIMONTHLY", paymentDate)) : undefined;
    for (const statement of priorStatements) {
      for (const line of statement.lines) {
        const allocations = statement.payments.flatMap(payment => payment.allocations.filter(entry => entry.line_id === line.id).map(entry => ({ date: iso(payment.payment_date), amount: entry.amount })));
        const taxCategory = line.earning?.taxable || line.earning?.tax_category === "BENEFITS_CAP" ? line.earning.tax_category : "EXEMPT";
        for (const [index, allocation] of allocations.entries()) receipts.push({ date: allocation.date, id: line.id + ":" + index, amount: amount(allocation.amount), category: line.category, code: line.code, taxCategory });
        const outstanding = remainingPlanned(amount(line.amount), allocations.map(entry => amount(entry.amount)));
        if (!decimal(outstanding).isZero()) receipts.push({ date: iso(statement.run.payment_date), id: line.id + ":planned", amount: outstanding, category: line.category, code: line.code, taxCategory });
      }
    }
    const taxContext = receiptTaxContext(receipts, { year: taxYear, date: run.kind === "YEAR_END" ? end : paymentDate, cadence: settings?.cadence ?? "SEMIMONTHLY", benefitsCap: rules.data.benefits.taxExemptBenefitsCap, openingBenefits: opening.success ? opening.data.benefitsReceived ?? opening.data.thirteenthPaid : "0" });
    const taxable = taxableCompensation(earningRows.filter(entry => entry.source_type !== "ADJUSTMENT" || entry.amount.greaterThan(0)).map(entry => ({ amount: amount(entry.amount), category: entry.tax_category === "BENEFITS_CAP" ? "BENEFITS_CAP" : entry.taxable ? "NORMAL" : "EXEMPT" })), taxContext.benefits, rules.data.benefits.taxExemptBenefitsCap);
    const annual = ["YEAR_END", "FINAL_PAY"].includes(run.kind) && opening.success ? { taxable: amount(decimal(opening.data.taxable).plus(taxContext.yearTaxable).plus(taxable)), withheld: amount(decimal(opening.data.taxWithheld).plus(taxContext.yearWithheld)), subtractCurrentContributions: true } : undefined;
    if (annual && priorStatements.some(entry => Number(iso(entry.run.payment_date).slice(0, 4)) === taxYear && !entry.paid_amount.eq(entry.net))) issues.push({ code: "ANNUAL_UNSETTLED", message: "Settle or independently reconcile outstanding statements before closing this tax year." });
    if (annual && taxYear !== Number(paymentDate.slice(0, 4)) && earningRows.some(entry => entry.amount.gt(0) && entry.code !== "TAX_RECONCILIATION")) issues.push({ code: "ANNUAL_RECEIPT_YEAR", message: "Pay unpaid earnings through their actual receipt year before closing the prior tax year." });
    if (annual && run.kind === "YEAR_END" && end.slice(5) !== "12-31") issues.push({ code: "YEAR_END_DATE", message: "Year-end reconciliation requires the completed tax year." });
    if (run.kind === "FINAL_PAY" && (!employee.employment_end || iso(employee.employment_end) !== end)) issues.push({ code: "FINAL_PAY_DATE", message: "Confirm the employment end date and match the final-pay work cutoff." });
    const result = calculateStatutory({ rules: rules.data, eligibility: eligibility.data, month, monthlyBasic: monthlyBasis?.basic ?? profile.monthly_basic.toString(), gross: amount(gross), taxable, sssBasis: amount(sum(earningRows.filter(entry => rules.data.sssContributionCodes.includes(entry.code)).map(entry => entry.amount))), cadence: settings?.cadence === "WEEKLY" ? "WEEKLY" : "SEMIMONTHLY", previous, annual,
      previousTaxableInPeriod: amount(decimal(taxContext.periodTaxable).plus(openingPeriod?.taxable ?? 0)), previousTaxInPeriod: amount(decimal(taxContext.periodWithheld).plus(openingPeriod?.withheld ?? 0)) });
    assessments = result.assessments; issues.push(...result.issues);
    for (const assessment of assessments) {
      if (!decimal(assessment.employeeShare).isZero()) lines.push({ code: assessment.agency, description: assessment.agency + " employee share", amount: assessment.employeeShare, category: "DEDUCTION", source: { month, rulePackageId: settings!.rule_package_id! } });
      if (decimal(assessment.employerShare).gt(0)) lines.push({ code: assessment.agency + "_EMPLOYER", description: assessment.agency + " employer share", amount: assessment.employerShare, category: "EMPLOYER", source: { month, rulePackageId: settings!.rule_package_id! } });
    }
    deduction = deduction.plus(sum(assessments.map(entry => entry.employeeShare)));
  }
  if (deduction.gt(gross)) issues.push({ code: "INSUFFICIENT_NET", message: "Deductions exceed available pay. Explicitly reduce, defer, or waive authorized adjustments and recalculate." });
  if (lines.length === 0 || (gross.isZero() && deduction.isZero())) issues.push({ code: "NO_EARNINGS", message: "No payable earnings exist for this selection." });
  const calculation: PayrollCalculation = { lines, assessments, issues, gross: amount(gross), deductions: amount(deduction), net: amount(gross.minus(deduction)), employerCost: amount(gross.plus(sum(assessments.map(entry => entry.employerShare)))) };
  const calculationPolicy = simple ? "SIMPLE" : "GOVERNMENT";
  const reviewHash = fingerprint({ calculationPolicy, employeeRevision: employee.financial_revision, profile: simple ? null : profile, settingsRevision: simple ? null : settings?.revision, rulesHash: simple ? null : settings?.rule_package?.content_hash, facts, earningRows: earningRows.map(({ statement_id: _allocation, ...entry }) => entry), prior: simple ? [] : priorStatements.map(entry => ({ id: entry.id, revision: entry.revision, assessments: entry.assessments, payments: entry.payments })), calculation });
  const evidence = { calculationPolicy, governmentCalculations: !simple, profile: simple ? null : profile, settings: { revision: settings?.revision, cadence: settings?.cadence, payDays: settings?.pay_days, rulePackageId: simple ? null : settings?.rule_package_id, ruleHash: simple ? null : settings?.rule_package?.content_hash }, workFacts: facts, sourceIds: earningRows.map(entry => entry.id), priorStatementIds: simple ? [] : priorStatements.map(entry => entry.id) };
  return { calculation, reviewHash, evidence, employeeName: employee.user.name, employeeRevision: employee.financial_revision, rulePackageId: simple ? null : settings?.rule_package_id, earningIds: earningRows.map(entry => entry.id) };
}

