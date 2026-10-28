import { amount, decimal, sum } from "@/features/payroll/money";
import { PayrollError } from "@/features/payroll/v2/contracts";

export function exportMonthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new PayrollError("INVALID_INPUT", "Choose a valid reporting month.");
  const year = Number(month.slice(0, 4)); const number = Number(month.slice(5));
  if (year < 2020 || year > 2100) throw new PayrollError("INVALID_INPUT", "Choose a supported reporting year.");
  return { first: month + "-01", last: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10), next: new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10) };
}
export type WithholdingPayment = {
  id: string; employeeId: number; date: string; amount: string; legacy: boolean; snapshot: unknown; rulePackageId: string | null;
  allocations: { id: string; amount: string; code: string; category: string }[];
};
export function publishedExportIdentity(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const record = snapshot as Record<string, unknown>;
  const evidence = record.evidence && typeof record.evidence === "object" && !Array.isArray(record.evidence) ? record.evidence as Record<string, unknown> : null;
  const profile = evidence?.profile && typeof evidence.profile === "object" && !Array.isArray(evidence.profile) ? evidence.profile as Record<string, unknown> : null;
  return typeof record.employeeName === "string" && record.employeeName.trim() && typeof profile?.encrypted_identifiers === "string" && profile.encrypted_identifiers
    ? { name: record.employeeName, encryptedIdentifiers: profile.encrypted_identifiers }
    : null;
}
export function aggregatePaidWithholding(payments: WithholdingPayment[], month: string, strict = true) {
  const bounds = exportMonthBounds(month);
  const groups = new Map<number, { employeeId: number; employeeShare: string; payments: WithholdingPayment[]; issues: string[] }>();
  const seen = new Set<string>();
  for (const payment of payments) {
    if (payment.date < bounds.first || payment.date >= bounds.next) continue;
    if (seen.has(payment.id)) throw new PayrollError("BLOCKED", "Duplicate payment evidence requires reconciliation.");
    seen.add(payment.id);
    if (!Number.isInteger(payment.employeeId) || payment.employeeId <= 0 || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(payment.date) || new Date(payment.date + "T00:00:00Z").toISOString().slice(0, 10) !== payment.date) throw new PayrollError("BLOCKED", "Payment reporting dates or employee identity need verification.");
    const group = groups.get(payment.employeeId) ?? { employeeId: payment.employeeId, employeeShare: "0.00", payments: [], issues: [] };
    const net = sum(payment.allocations.filter(entry => entry.category === "EARNING").map(entry => entry.amount)).minus(sum(payment.allocations.filter(entry => entry.category === "DEDUCTION").map(entry => entry.amount)));
    const issue = payment.legacy ? "Legacy payment has no verified itemized withholding." : !payment.allocations.length ? "Payment allocation evidence is missing." : new Set(payment.allocations.map(entry => entry.id)).size !== payment.allocations.length || payment.allocations.some(entry => !["EARNING", "DEDUCTION", "EMPLOYER"].includes(entry.category)) || !net.eq(payment.amount) ? "Payment allocations do not reconcile." : payment.allocations.some(entry => ["BIR", "TAX_RECONCILIATION"].includes(entry.code) && entry.category !== "DEDUCTION") ? "Signed withholding line classification requires review." : null;
    if (issue && strict) throw new PayrollError("BLOCKED", issue);
    if (issue) group.issues.push(issue);
    else group.employeeShare = amount(decimal(group.employeeShare).plus(sum(payment.allocations.filter(entry => ["BIR", "TAX_RECONCILIATION"].includes(entry.code)).map(entry => entry.amount))));
    group.payments.push(payment); groups.set(payment.employeeId, group);
  }
  return [...groups.values()].sort((a, b) => a.employeeId - b.employeeId).map(entry => ({ ...entry, issues: [...new Set(entry.issues)] }));
}
