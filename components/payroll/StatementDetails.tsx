"use client";
import type { StatementView } from "@/features/payroll/v2/contracts";
import { outstanding, decimal } from "@/features/payroll/money";
import { PayrollScroll } from "./PayrollScroll";
import styles from "./payroll.module.css";

export const php = (value: string) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
const sourceLabels: Record<string, string> = { sourceType: "Source", sourceId: "Source record", earnedOn: "Work date", sourceRevision: "Source version", priorPeriod: "Earlier work period", basis: "Salary basis", agreementId: "Compensation agreement", salaryRate: "Agreed salary rate", authorization: "Adjustment authorization", actorId: "Recorded by", authorId: "Recorded by", manual: "Manually entered", label: "Manual label", reason: "Reason", month: "Assessment month", rulePackageId: "Statutory rule version", legacyPayslipId: "Historical payslip", recordedNet: "Recorded net pay", recordedDeduction: "Recorded deduction" };
function rateLabel(line: StatementView["lines"][number]) {
  if (line.code === "COMMISSION") return line.rate + "% of " + php(line.units ?? "0");
  if (line.source.basis === "MONTHLY") return php(String(line.source.salaryRate ?? line.rate)) + " / month · allocated by calendar day";
  if (!line.rate) return "—";
  return php(line.rate) + (line.source.basis === "HOURLY" ? " / hour" : "") + (line.units ? " × " + line.units : "");
}
export function StatementDetails({ statement, print = false }: { statement: StatementView; print?: boolean }) {
  const simple = statement.calculationPolicy === "SIMPLE";
  const status = statement.status !== "PUBLISHED" ? "Draft" : decimal(statement.net).eq(0) ? "No payment due" : statement.paymentState === "PAID" ? "Paid" : decimal(statement.paidAmount).gt(0) ? "Partly paid" : "Ready to pay";
  return <section className={styles.panel + " " + styles.statement} aria-label={statement.employeeName + " payslip"}>
    <div className={styles.header}><div><h2>{statement.employeeName}</h2><p>{statement.periodStart} – {statement.periodEnd}</p><span className={styles.badge}>{simple ? status : statement.status + " · " + statement.paymentState}</span></div>{print && <button className={styles.secondary + " " + styles.noPrint} onClick={() => window.print()}>Print / save PDF</button>}</div>
    {simple && <p className={styles.notice}>Government contributions and tax are not calculated automatically. Manual amounts are entered by your business.</p>}
    {statement.legacyAggregate && <p className={styles.notice}>Historical net pay and payment status were preserved. The original itemized breakdown is unavailable.{statement.recordedLegacyDeduction && " Recorded deduction: " + php(statement.recordedLegacyDeduction) + "."}</p>}
    <div className={styles.metrics}>{(statement.legacyAggregate ? [["Recorded net pay", statement.net], ["Paid", statement.paidAmount], ["Remaining", outstanding(statement.net, statement.paidAmount)]] : [["Gross pay", statement.gross], ["Deductions", statement.deductions], ["Net pay", statement.net], ["Remaining", outstanding(statement.net, statement.paidAmount)]]).map(([label, value]) => <div className={styles.metric} key={label}><span>{label}</span><strong>{php(value)}</strong></div>)}</div>
    <PayrollScroll label="Payslip breakdown"><table className={styles.table}><thead><tr><th>Item and source</th><th>Rate / units</th><th>Amount</th></tr></thead><tbody>{statement.lines.map((line, index) => <tr key={line.earningId ?? line.code + index}><td>{line.description}{Boolean(line.source.manual) && <span className={styles.badge}>Manual amount</span>}<small className="block text-xs text-muted-foreground">{line.source.earnedOn && String(line.source.earnedOn)}{line.source.priorPeriod && " · prior period"}</small><details><summary>Source details</summary>{Object.entries(line.source).filter(([, value]) => value !== null && value !== false).map(([key, value]) => <p key={key}>{sourceLabels[key] ?? key.replaceAll("_", " ")}: {String(value)}</p>)}</details></td><td className={styles.number}>{rateLabel(line)}</td><td className={styles.number}>{php((line.category === "DEDUCTION" ? decimal(line.amount).negated() : decimal(line.amount)).toString())}{line.category === "EMPLOYER" && <small className="block">Employer contribution</small>}</td></tr>)}</tbody></table></PayrollScroll>
    {statement.payments.length > 0 && <><h3 className="mt-6">Recorded payments</h3>{statement.payments.map(payment => <p key={payment.id} className={styles.help}>{payment.date} · {payment.method} · {payment.reference} · {php(payment.amount)}</p>)}</>}
    {statement.status === "PUBLISHED" && <p className={styles.help}>Published amounts are fixed. Corrections appear as separately reviewed adjustments.</p>}
  </section>;
}
