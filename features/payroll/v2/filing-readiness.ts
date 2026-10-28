import { PayrollError } from "@/features/payroll/v2/contracts";
import { exportMonthBounds } from "@/features/payroll/v2/export-withholding";

export type FilingAgency = "BIR" | "SSS" | "PHILHEALTH" | "PAGIBIG";
export type FilingEmployeeEvidence = {
  employeeId: number;
  employmentStart: string | null;
  employmentEnd: string | null;
  eligibility: { from: string; eligible: boolean | null; exemptionEvidence?: string }[] | null;
};
export type FilingAssessmentEvidence = {
  employeeId: number; month: string; agency: FilingAgency;
  published: boolean; certified: boolean; itemized: boolean;
};
export type FilingReadinessInput = {
  agency: FilingAgency; month: string; asOf: string;
  employees: FilingEmployeeEvidence[]; assessments: FilingAssessmentEvidence[];
};
export type FilingReadinessIssue = {
  code: "INCOMPLETE_MONTH" | "EMPLOYMENT_EVIDENCE" | "ELIGIBILITY_EVIDENCE" | "MISSING_ASSESSMENT" | "UNVERIFIED_ASSESSMENT";
  employeeId?: number; message: string;
};

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// The caller supplies the complete historical tenant roster, including archived employees.
export function agencyFilingReadiness(input: FilingReadinessInput): FilingReadinessIssue[] {
  const bounds = exportMonthBounds(input.month);
  if (!validDate(input.asOf)) throw new PayrollError("INVALID_INPUT", "Choose a valid filing review date.");
  const issues: FilingReadinessIssue[] = [];
  if (input.asOf < bounds.next) issues.push({ code: "INCOMPLETE_MONTH", message: "The complete calendar month must finish before producing an agency filing." });
  if (input.agency === "BIR") return issues;
  const seen = new Set<number>();
  for (const employee of input.employees) {
    const employeeId = employee.employeeId;
    const issue = (code: FilingReadinessIssue["code"], message: string) => issues.push({ code, employeeId, message });
    if (!Number.isInteger(employeeId) || employeeId <= 0 || seen.has(employeeId)) {
      issue("EMPLOYMENT_EVIDENCE", "Employee roster identity evidence is invalid or duplicated.");
      continue;
    }
    seen.add(employeeId);
    const start = employee.employmentStart; const end = employee.employmentEnd;
    if (!start || !validDate(start) || (end !== null && (!validDate(end) || end < start))) {
      issue("EMPLOYMENT_EVIDENCE", "Verified employment dates are required to establish reporting-month coverage.");
      continue;
    }
    if (start >= bounds.next || (end !== null && end < bounds.first)) continue;
    const employedFrom = start > bounds.first ? start : bounds.first;
    const employedThrough = end !== null && end < bounds.last ? end : bounds.last;
    const history = employee.eligibility;
    if (!history?.length || history.some(entry => !validDate(entry.from)) || new Set(history.map(entry => entry.from)).size !== history.length) {
      issue("ELIGIBILITY_EVIDENCE", "Verified effective eligibility history is required for every employed interval in the reporting month.");
      continue;
    }
    const ordered = [...history].sort((a, b) => a.from.localeCompare(b.from));
    const initial = ordered.filter(entry => entry.from <= employedFrom).at(-1);
    if (!initial) {
      issue("ELIGIBILITY_EVIDENCE", "Eligibility evidence does not cover the beginning of employment in this month.");
      continue;
    }
    const applicable = [initial, ...ordered.filter(entry => entry.from > employedFrom && entry.from <= employedThrough)];
    if (applicable.some(entry => typeof entry.eligible !== "boolean" || (!entry.eligible && (entry.exemptionEvidence?.trim().length ?? 0) < 10))) {
      issue("ELIGIBILITY_EVIDENCE", "An eligibility decision or verified exclusion evidence is missing for this month.");
      continue;
    }
    if (!applicable.some(entry => entry.eligible === true)) continue;
    const assessments = input.assessments.filter(entry => entry.employeeId === employeeId && entry.month === input.month && entry.agency === input.agency);
    if (!assessments.length) issue("MISSING_ASSESSMENT", "An eligible employee has no assessment for this month. Reconcile the employee even when no pay was recorded.");
    else if (assessments.some(entry => !entry.published || !entry.certified || !entry.itemized)) issue("UNVERIFIED_ASSESSMENT", "Every reported assessment requires published, certified, itemized evidence.");
  }
  return issues;
}

export function assertAgencyFilingReady(input: FilingReadinessInput) {
  const issues = agencyFilingReadiness(input);
  if (issues.length) {
    const first = issues[0];
    throw new PayrollError("BLOCKED", (first.employeeId === undefined ? "" : "Employee " + first.employeeId + ": ") + first.message);
  }
}
