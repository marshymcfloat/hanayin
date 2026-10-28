export type PayrollIssue = { code: string; message: string; sourceId?: string };
export type PayrollLine = {
  code: string; description: string; category: "EARNING" | "DEDUCTION" | "EMPLOYER";
  amount: string; rate?: string; units?: string; earningId?: string;
  source: Record<string, string | number | boolean | null>;
};
export type PayrollAssessmentDTO = {
  agency: string; month: string; employeeShare: string; employerShare: string;
  basis: string; explanation: Record<string, string | number | boolean>;
};
export type PayrollCalculation = {
  lines: PayrollLine[]; assessments: PayrollAssessmentDTO[]; issues: PayrollIssue[];
  gross: string; deductions: string; net: string; employerCost: string;
};
export type PayrollIdentity = { businessSlug: string; userId: string };
export type PayrollFailureCode = "FORBIDDEN" | "STALE_REVIEW" | "INVALID_INPUT" | "NOT_FOUND" | "BLOCKED" | "CONFLICT" | "UNAVAILABLE";
export class PayrollError extends Error {
  constructor(public code: PayrollFailureCode, message: string) { super(message); }
}
export type PayrollCommandResult = { success: true; id: string; revision?: number } | { success: false; code: PayrollFailureCode; error: string };
export type StatementView = {
  calculationPolicy?: "SIMPLE" | "GOVERNMENT";
  id: string; employeeId: number; employeeName: string; status: string; paymentState: string;
  revision: number; gross: string; deductions: string; net: string; employerCost: string; paidAmount: string;
  periodStart: string; periodEnd: string; paymentDate: string; publishedAt: string | null;
  legacyAggregate?: boolean; recordedLegacyDeduction?: string;
  previousReview?: { gross: string; deductions: string; net: string; employerCost: string; reviewHash: string };
  lines: PayrollLine[]; issues: PayrollIssue[];
  payments: { id: string; amount: string; date: string; method: string; reference: string }[];
};
export type PayrollWorkspaceView = {
  calculationPolicy?: "SIMPLE" | "GOVERNMENT";
  simpleEffectiveFrom?: string | null; governmentEffectiveFrom?: string | null;
  mode: string; revision: number; cadence: string; smsEnabled: boolean; rulePackageId: string | null;
  ruleReady: boolean; openingConfirmed: boolean;
  canManageWorkforce: boolean;
  payDays: number[]; reconciliation: { legacyCount: number; migrated: number; unresolved: number } | null;
  employees: { id: number; name: string; revision: number; employmentStart?: string | null; employmentEnd?: string | null; profileReady: boolean; agreements: { id: string; from: string; to: string | null; basis: string; rate: string; commissionRate: string; hours: string; monthlyDivisor?: string | null; commissionBasis?: string }[] }[];
  runs: { id: string; revision: number; start: string; end: string; paymentDate: string; kind: string; calculationPolicy?: "SIMPLE" | "GOVERNMENT"; employeeCount: number; preparedCount: number; statements: StatementView[] }[];
  hasMore: boolean; page: number;
};
