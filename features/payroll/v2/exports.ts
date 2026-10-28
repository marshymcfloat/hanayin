import "server-only";
import * as XLSX from "xlsx";
import { prisma } from "@/prisma/prisma";
import { amount, sum } from "@/features/payroll/money";
import { payrollOwner } from "./access";
import { PayrollError, type PayrollIdentity } from "./contracts";
import { decryptPayrollIdentifiers } from "@/lib/security/payroll-identifiers";
import { phRulesSchema } from "./statutory";
import { formatGovernmentExport, type governmentAgencies } from "./government-format";
import { aggregatePaidWithholding, exportMonthBounds, publishedExportIdentity, type WithholdingPayment } from "./export-withholding";
import { day, phDay } from "./period";
import { eligibilityHistorySchema } from "@/features/payroll/v2/profile-history";
import { assertAgencyFilingReady } from "@/features/payroll/v2/filing-readiness";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const publishedName = (snapshot: unknown, fallback: string) => typeof object(snapshot).employeeName === "string" ? object(snapshot).employeeName as string : fallback;
async function simpleCoverageCount(businessId: string, month: string) {
  const bounds = exportMonthBounds(month);
  return prisma.payrollStatement.count({ where: { business_id: businessId, status: "PUBLISHED", run: { calculation_policy: "SIMPLE" }, OR: [
    { run: { start_date: { lt: day(bounds.next) }, end_date: { gte: day(bounds.first) } } },
    { run: { payment_date: { gte: day(bounds.first), lt: day(bounds.next) } } },
    { payments: { some: { payment_date: { gte: day(bounds.first), lt: day(bounds.next) } } } },
  ] } });
}
const simpleCoverageRow = (count: number, agency: string, month: string) => ["UNSUPPORTED", "Simple pay records: " + count, agency, month, "Not calculated", "Not calculated", "Not applicable", "Government calculations were not performed; reconcile these records before filing"];
async function paidWithholdingSources(businessId: string, month: string): Promise<WithholdingPayment[]> {
  const bounds = exportMonthBounds(month);
  const payments = await prisma.payrollPayment.findMany({ where: { business_id: businessId, payment_date: { gte: day(bounds.first), lt: day(bounds.next) }, statement: { status: "PUBLISHED", run: { calculation_policy: "GOVERNMENT" } } }, include: { statement: { select: { employee_id: true, legacy_payslip_id: true, snapshot: true } }, reconciliation: { select: { snapshot: true } }, allocations: { include: { line: { select: { code: true, category: true } } } } }, orderBy: [{ payment_date: "asc" }, { id: "asc" }] });
  return payments.map(payment => {
    const reconciled = object(payment.reconciliation?.snapshot).rulePackageId; const published = object(payment.statement.snapshot).rulePackageId;
    return { id: payment.id, employeeId: payment.statement.employee_id, date: payment.payment_date.toISOString().slice(0, 10), amount: amount(payment.amount), legacy: payment.statement.legacy_payslip_id !== null || object(payment.statement.snapshot).legacyAggregate === true, snapshot: payment.statement.snapshot, rulePackageId: typeof reconciled === "string" ? reconciled : typeof published === "string" ? published : null, allocations: payment.allocations.map(entry => ({ id: entry.id, amount: amount(entry.amount), code: entry.line.code, category: entry.line.category })) };
  });
}
function historicalIdentifiers(snapshots: unknown[], agency: typeof governmentAgencies[number]) {
  const identities = snapshots.map(snapshot => publishedExportIdentity(snapshot));
  if (identities.some(entry => !entry)) throw new PayrollError("BLOCKED", "Published employee identity evidence is incomplete. Review the historical records before agency export.");
  let decoded: Record<string, string>[];
  try { decoded = identities.map(entry => decryptPayrollIdentifiers(entry!.encryptedIdentifiers)); }
  catch { throw new PayrollError("BLOCKED", "Historical government identifiers cannot be verified."); }
  const field = agency === "BIR" ? "tin" : agency === "SSS" ? "sss" : agency === "PHILHEALTH" ? "philhealth" : "pagibig";
  const normalize = (value: string) => value.replace(/[-\s]/g, "");
  const values = decoded.map(entry => normalize(entry[field] ?? ""));
  if (values.some(value => !value || value !== values[0]) || (field === "tin" ? !/^\d{9}(\d{3})?$/.test(values[0]) : field === "sss" ? !/^\d{10}$/.test(values[0]) : !/^\d{12}$/.test(values[0]))) throw new PayrollError("BLOCKED", "Historical agency identifiers differ or need verification. Resolve them before producing one employee-month filing row.");
  return { employeeName: identities[0]!.name, identifiers: decoded[0] };
}
function unsupportedOpeningMonth(snapshot: unknown, month: string, agency: typeof governmentAgencies[number]) {
  const profile = object(object(object(snapshot).evidence).profile);
  const history = object(profile.opening_history);
  const current = object(profile.ytd_opening);
  const opening = current.year === Number(month.slice(0, 4)) ? current : object(history[month.slice(0, 4)]);
  const contexts = agency === "BIR" ? opening.taxPeriodContexts : opening.monthlyAssessments;
  return Array.isArray(contexts) && contexts.some(context => {
    const record = object(context); const period = agency === "BIR" ? record.period : record.month;
    const fields = agency === "BIR" ? ["taxable", "withheld"] : agency === "SSS" ? ["sssEmployee", "sssEmployer"] : agency === "PHILHEALTH" ? ["philhealthEmployee", "philhealthEmployer"] : ["pagibigEmployee", "pagibigEmployer"];
    return typeof period === "string" && period.startsWith(month) && fields.some(field => typeof record[field] === "string" && amount(record[field] as string) !== "0.00");
  });
}

export function csv(rows: string[][]) {
  return rows.map(row => row.map(value => {
    const prefix = value.trimStart();
    const safe = /^[=+@]/.test(prefix) || /^[\t\r\n]/.test(value) || (prefix.startsWith("-") && !/^-\d+(\.\d+)?$/.test(prefix)) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n");
}
export function workbook(rows: string[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Payroll");
  return Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" })).toString("base64");
}
export async function exportPayrollRun(identity: PayrollIdentity, runId: string, format: "CSV" | "XLSX") {
  const actor = await payrollOwner(identity);
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, business_id: actor.businessId }, include: { statements: { where: { status: "PUBLISHED" }, include: { payments: true, employee: { select: { user: { select: { name: true } } } } }, orderBy: { employee_id: "asc" } } } });
  if (!run) throw new PayrollError("NOT_FOUND", "Payroll run not found.");
  if (!run.statements.length) throw new PayrollError("BLOCKED", "Only published statements can be exported as payroll records.");
  const rows = [["Statement", "Employee", "Work from", "Work through", "Planned payment date", "Gross", "Deductions", "Net", "Employer cost", "Paid", "Remaining", "Payment state"],
    ...run.statements.map(entry => [entry.id, publishedName(entry.snapshot, entry.employee.user.name), run.start_date.toISOString().slice(0, 10), run.end_date.toISOString().slice(0, 10), run.payment_date.toISOString().slice(0, 10), amount(entry.gross), amount(entry.deductions), amount(entry.net), amount(entry.employer_cost), amount(entry.paid_amount), amount(entry.net.minus(entry.paid_amount)), entry.payment_state])];
  rows[0].push("Calculation policy", "Government calculations");
  for (const row of rows.slice(1)) row.push(run.calculation_policy ?? "GOVERNMENT", run.calculation_policy === "SIMPLE" ? "Not calculated automatically; manual amounts are owner-entered" : "Calculated using recorded rules");
  await payrollOwner(identity);
  return { filename: "payroll-" + run.start_date.toISOString().slice(0, 10) + "-" + run.id + (format === "CSV" ? ".csv" : ".xlsx"), content: format === "CSV" ? csv(rows) : workbook(rows), encoding: format === "CSV" ? "text" as const : "base64" as const, mime: format === "CSV" ? "text/csv;charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}
export async function exportStatutoryRegister(identity: PayrollIdentity, month: string, agency: "SSS" | "PHILHEALTH" | "PAGIBIG" | "BIR") {
  const actor = await payrollOwner(identity);
  exportMonthBounds(month);
  const simpleCount = await simpleCoverageCount(actor.businessId, month);
  if (agency === "BIR") {
    const groups = aggregatePaidWithholding(await paidWithholdingSources(actor.businessId, month), month, false);
    const rows = [["Review register · not an agency upload file", "Published employee name", "Agency", "Actual payment month", "Known employee withholding", "Employer share", "Rule package", "Verification"], ...groups.map(entry => [String(entry.employeeId), publishedName(entry.payments[0].snapshot, "Historical name unavailable"), agency, month, entry.employeeShare, "0.00", [...new Set(entry.payments.map(payment => payment.rulePackageId ?? "Unknown"))].join("; "), entry.issues.length ? "UNSUPPORTED · " + entry.issues.join("; ") : entry.payments.some(payment => !publishedExportIdentity(payment.snapshot)) ? "Historical identity evidence incomplete" : "Paid allocations reconciled; independent filing review required"] )];
    if (simpleCount) rows.push(simpleCoverageRow(simpleCount, agency, month));
    await payrollOwner(identity);
    return { filename: "bir-review-register-" + month + ".csv", content: csv(rows), encoding: "text" as const, mime: "text/csv;charset=utf-8" };
  }
  const records = await prisma.payrollAssessment.findMany({ where: { business_id: actor.businessId, assessment_month: month, agency, statement: { is: { status: "PUBLISHED", legacy_payslip_id: null } } }, include: { statement: { select: { employee_id: true, snapshot: true, employee: { select: { user: { select: { name: true } } } } } }, rule_package: { select: { id: true, certified_at: true } } } });
  const groups = new Map<number, typeof records>();
  for (const entry of records) groups.set(entry.statement.employee_id, [...(groups.get(entry.statement.employee_id) ?? []), entry]);
  const legacyCount = await prisma.payrollStatement.count({ where: { business_id: actor.businessId, status: "PUBLISHED", legacy_payslip_id: { not: null }, run: { payment_date: { gte: day(month + "-01"), lt: day(exportMonthBounds(month).next) } } } });
  const rows = [["Review register · not an agency upload file", "Employee", "Agency", "Assessment month", "Employee share", "Employer share", "Rule package", "Verification"],
    ...[...groups.values()].map(entries => [String(entries[0].statement.employee_id), publishedName(entries[0].statement.snapshot, entries[0].statement.employee.user.name), agency, month, amount(sum(entries.map(entry => entry.employee_share))), amount(sum(entries.map(entry => entry.employer_share))), [...new Set(entries.map(entry => entry.rule_package.id))].join("; "), entries.some(entry => !entry.rule_package.certified_at || !publishedExportIdentity(entry.statement.snapshot) || unsupportedOpeningMonth(entry.statement.snapshot, month, agency)) ? "UNSUPPORTED · historical identity, certification, or opening assessment evidence needs review" : "Stored assessments; independent filing review required"]),
    ...(legacyCount ? [["UNSUPPORTED", "Unitemized legacy records: " + legacyCount, agency, month, "Unknown", "Unknown", "Unknown", "Excluded from known totals; independent historical reconciliation required"]] : [])];
  if (simpleCount) rows.push(simpleCoverageRow(simpleCount, agency, month));
  await payrollOwner(identity);
  return { filename: agency.toLowerCase() + "-review-register-" + month + ".csv", content: csv(rows), encoding: "text" as const, mime: "text/csv;charset=utf-8" };
}
export async function exportGovernmentFile(identity: PayrollIdentity, month: string, agency: typeof governmentAgencies[number]) {
  const actor = await payrollOwner(identity);
  const bounds = exportMonthBounds(month);
  if (await simpleCoverageCount(actor.businessId, month)) throw new PayrollError("BLOCKED", "This month includes simple pay records without automatic government calculations. Reconcile them independently before agency filing.");
  assertAgencyFilingReady({ agency: "BIR", month, asOf: phDay(new Date()), employees: [], assessments: [] });
  const settings = await prisma.payrollSettings.findUnique({ where: { business_id: actor.businessId }, include: { rule_package: true, business: { select: { name: true } } } });
  if (!settings?.rule_package?.certified_at || !settings.employer_identifiers) throw new PayrollError("BLOCKED", "Certified export rules and encrypted employer identifiers are required.");
  if (settings.rule_package.effective_from > day(bounds.first) || settings.rule_package.supported_through < day(bounds.last)) throw new PayrollError("BLOCKED", "The certified export rule package must cover the whole reporting month.");
  const rules = phRulesSchema.parse(settings.rule_package.rules);
  const templates = rules.exportTemplates.filter(entry => entry.agency === agency && entry.effectiveFrom <= bounds.first && entry.supportedThrough >= bounds.last);
  if (templates.length !== 1) throw new PayrollError("BLOCKED", "Exactly one independently reviewed agency export layout must cover this month.");
  const template = templates[0];
  const employer = decryptPayrollIdentifiers(settings.employer_identifiers);
  const employerFields = { employerName: settings.business.name, employerTin: employer.tin ?? "", employerSss: employer.sss ?? "", employerPhilhealth: employer.philhealth ?? "", employerPagibig: employer.pagibig ?? "" };
  if (agency === "BIR") {
    const groups = aggregatePaidWithholding(await paidWithholdingSources(actor.businessId, month), month);
    if (!groups.length) throw new PayrollError("BLOCKED", "No recorded employee payments exist for this actual payment month.");
    const packageIds = [...new Set(groups.flatMap(entry => entry.payments.map(payment => payment.rulePackageId)).filter((entry): entry is string => Boolean(entry)))];
    const sourcePackages = await prisma.payrollRulePackage.findMany({ where: { id: { in: packageIds } }, select: { id: true, certified_at: true, effective_from: true, supported_through: true } });
    const rows = groups.map(entry => {
      for (const payment of entry.payments) {
        const rule = sourcePackages.find(record => record.id === payment.rulePackageId);
        if (!rule?.certified_at || rule.effective_from > day(payment.date) || rule.supported_through < day(payment.date)) throw new PayrollError("BLOCKED", "A payment's certified withholding rules do not cover its actual date. Review payment-date reconciliation.");
        if (unsupportedOpeningMonth(payment.snapshot, month, agency)) throw new PayrollError("BLOCKED", "This month includes opening withholding without payment allocation evidence. Reconcile the historical reporting records first.");
      }
      const historical = historicalIdentifiers(entry.payments.map(payment => payment.snapshot), agency);
      return { employeeId: String(entry.employeeId), employeeName: historical.employeeName, ...historical.identifiers, ...employerFields, month, employeeShare: entry.employeeShare, employerShare: "0.00", ec: "0.00", mpfEmployee: "0.00", mpfEmployer: "0.00" };
    });
    const content = formatGovernmentExport(template, rows); await payrollOwner(identity);
    return { filename: "bir-" + template.version + "-" + month + (template.format === "CSV" ? ".csv" : ".txt"), content, encoding: "text" as const, mime: "text/plain;charset=utf-8", layoutVersion: template.version };
  }
  const legacy = await prisma.payrollStatement.findFirst({ where: { business_id: actor.businessId, status: "PUBLISHED", legacy_payslip_id: { not: null }, run: { payment_date: { gte: day(bounds.first), lt: day(bounds.next) } } }, select: { id: true } });
  if (legacy) throw new PayrollError("BLOCKED", "This month includes unitemized legacy payroll. Independently reconcile its statutory reporting before agency export.");
  const records = await prisma.payrollAssessment.findMany({ where: { business_id: actor.businessId, assessment_month: month, agency, statement: { is: { status: "PUBLISHED", legacy_payslip_id: null } } }, include: { rule_package: { select: { certified_at: true, effective_from: true, supported_through: true } }, statement: { select: { employee_id: true, snapshot: true, run: { select: { payment_date: true } } } } }, orderBy: { statement: { published_at: "desc" } } });
  const roster = await prisma.employee.findMany({ where: { business_id: actor.businessId, AND: [{ OR: [{ employment_start: null }, { employment_start: { lt: day(bounds.next) } }] }, { OR: [{ employment_end: null }, { employment_end: { gte: day(bounds.first) } }] }] }, select: { id: true, employment_start: true, employment_end: true, payroll_profile: { select: { eligibility_history: true } } } });
  const flag = agency === "SSS" ? "sss" : agency === "PHILHEALTH" ? "philhealth" : "pagibig";
  assertAgencyFilingReady({ agency, month, asOf: phDay(new Date()), employees: roster.map(employee => {
    const history = eligibilityHistorySchema.safeParse(employee.payroll_profile?.eligibility_history);
    return { employeeId: employee.id, employmentStart: employee.employment_start?.toISOString().slice(0, 10) ?? null, employmentEnd: employee.employment_end?.toISOString().slice(0, 10) ?? null, eligibility: history.success ? history.data.map(entry => ({ from: entry.from, eligible: entry.eligibility[flag], exemptionEvidence: entry.eligibility.exemptionEvidence })) : null };
  }), assessments: records.map(record => ({ employeeId: record.statement.employee_id, month: record.assessment_month, agency, published: true, certified: Boolean(record.rule_package.certified_at), itemized: true })) });
  const pending = await prisma.payrollStatement.count({ where: { business_id: actor.businessId, status: { in: ["DRAFT", "APPROVED"] }, run: { payment_date: { gte: day(bounds.first), lt: day(bounds.next) } } } });
  if (pending) throw new PayrollError("BLOCKED", "Unpublished payroll remains in this assessment month. Resolve it before producing an agency filing.");
  if (!records.length) throw new PayrollError("BLOCKED", "No published assessments exist for this selection.");
  const groups = new Map<number, typeof records>();
  for (const entry of records) groups.set(entry.statement.employee_id, [...(groups.get(entry.statement.employee_id) ?? []), entry]);
  const rows = [...groups.values()].map(entries => {
    for (const entry of entries) {
      if (!entry.rule_package.certified_at || entry.rule_package.effective_from > entry.statement.run.payment_date || entry.rule_package.supported_through < entry.statement.run.payment_date) throw new PayrollError("BLOCKED", "An assessment's certified rules do not cover its recorded assessment date.");
      if (unsupportedOpeningMonth(entry.statement.snapshot, month, agency)) throw new PayrollError("BLOCKED", "This month includes opening contributions without itemized assessment evidence. Reconcile the historical reporting records first.");
    }
    const historical = historicalIdentifiers(entries.map(entry => entry.statement.snapshot), agency);
    const context = entries[0].explanation as Record<string, string>;
    return { employeeId: String(entries[0].statement.employee_id), employeeName: historical.employeeName, ...historical.identifiers, ...employerFields, month, employeeShare: amount(sum(entries.map(entry => entry.employee_share))), employerShare: amount(sum(entries.map(entry => entry.employer_share))), ec: context.ec ?? "0.00", mpfEmployee: context.mpfEmployee ?? "0.00", mpfEmployer: context.mpfEmployer ?? "0.00" };
  });
  const content = formatGovernmentExport(template, rows);
  await payrollOwner(identity);
  return { filename: agency.toLowerCase() + "-" + template.version + "-" + month + (template.format === "CSV" ? ".csv" : ".txt"), content, encoding: "text" as const, mime: "text/plain;charset=utf-8", layoutVersion: template.version };
}
