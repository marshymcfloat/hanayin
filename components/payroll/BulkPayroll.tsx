"use client";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { approvePayrollAction, publishPayrollAction, recordPayrollPaymentAction } from "@/features/payroll/actions/lifecycle";
import type { PayrollCommandResult, StatementView } from "@/features/payroll/v2/contracts";
import { outstanding, decimal } from "@/features/payroll/money";
import { phDay } from "@/features/payroll/v2/period";
import { useCommandKeys } from "./useCommandKeys";
import { php } from "./StatementDetails";
import styles from "./payroll.module.css";

type Mutate = (command: () => Promise<PayrollCommandResult>, message: string) => Promise<unknown>;
export function BulkPayroll({ statements, stage, active, busy, mutate }: { statements: StatementView[]; stage: string; active: boolean; busy: boolean; mutate: Mutate }) {
  const command = useCommandKeys();
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState("");
  const [payAfterPublish, setPayAfterPublish] = useState(false);
  const [date, setDate] = useState(phDay(new Date()));
  const [method, setMethod] = useState("BANK");
  const [reference, setReference] = useState("");
  const [results, setResults] = useState<{ name: string; message: string }[]>([]);
  const isReview = stage === "review";
  const eligible = statements.filter(entry => isReview ? entry.status !== "PUBLISHED" && !entry.issues.length : entry.status === "PUBLISHED" && entry.paymentState !== "PAID");
  const chosen = eligible.filter(entry => selected.includes(entry.id));
  const selectionRevision = chosen.map(entry => entry.id + ":" + entry.revision).join(";");
  const payment = !isReview || payAfterPublish;
  async function submit() {
    setResults([]);
    await mutate(async () => {
      const completed: typeof results = [];
      let failures = 0;
      for (const statement of chosen) {
        let revision = statement.revision;
        let result: PayrollCommandResult = { success: true, id: statement.id, revision };
        if (isReview && statement.status === "DRAFT") {
          result = await approvePayrollAction(command("APPROVE", { statementId: statement.id, expectedRevision: revision }));
          if (result.success) revision = result.revision!;
        }
        if (isReview && result.success) {
          result = await publishPayrollAction(command("PUBLISH", { statementId: statement.id, expectedRevision: revision }));
          if (result.success) revision = result.revision!;
        }
        if (payment && result.success && decimal(outstanding(statement.net, statement.paidAmount)).gt(0)) result = await recordPayrollPaymentAction(command("PAYMENT", { statementId: statement.id, expectedRevision: revision, amount: outstanding(statement.net, statement.paidAmount), date, method, reference: reference + " / " + statement.employeeId }));
        completed.push({ name: statement.employeeName, message: result.success ? (payment ? "Payment recorded" : "Published") : result.error });
        if (!result.success) failures++;
        setResults([...completed]);
      }
      return failures ? { success: false, code: "BLOCKED", error: failures + " employee operations need attention. Completed operations were saved." } : { success: true, id: chosen[0]?.id ?? "" };
    }, "Selected employee operations completed");
  }
  if (!eligible.length) return null;
  return <section className={styles.panel}><h3>{isReview ? "Publish selected payslips" : "Record selected payments"}</h3><p className={styles.help}>{isReview ? "Review each source breakdown below, then select the employees to approve and publish." : "Select employees whose full remaining balances were paid. Use the individual form for installments."}</p>
    <div className={styles.choices}>{eligible.map(entry => <label key={entry.id} className={styles.choice}><input type="checkbox" disabled={busy} checked={selected.includes(entry.id)} onChange={event => setSelected(event.target.checked ? [...selected, entry.id] : selected.filter(id => id !== entry.id))} />{entry.employeeName} · {php(isReview ? entry.net : outstanding(entry.net, entry.paidAmount))}</label>)}</div>
    {isReview && <><label className={styles.choice}><input type="checkbox" checked={reviewed === selectionRevision && Boolean(selectionRevision)} onChange={event => setReviewed(event.target.checked ? selectionRevision : "")} />I reviewed all selected statements and their sources.</label><label className={styles.choice}><input type="checkbox" checked={payAfterPublish} onChange={event => setPayAfterPublish(event.target.checked)} />Also record the external payments already made.</label></>}
    {payment && <div className={styles.fields}><label>Actual payment date<input type="date" max={phDay(new Date())} value={date} onChange={event => setDate(event.target.value)} /></label><label>Method<Select value={method} onValueChange={setMethod}><SelectTrigger className={styles.select} aria-label="Bulk payment method"><SelectValue /></SelectTrigger><SelectContent className={styles.menu}>{["BANK", "CASH", "WALLET"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label><label>Batch reference<input maxLength={150} value={reference} onChange={event => setReference(event.target.value)} /></label></div>}
    <button className={styles.primary + " mt-4"} disabled={busy || !active || !chosen.length || (isReview && reviewed !== selectionRevision) || (payment && (!date || !reference.trim()))} onClick={() => void submit()}>{isReview ? payment ? "Publish and record payments" : "Approve and publish selected" : "Record full payments"}</button>
    {results.length > 0 && <ul aria-live="polite">{results.map(entry => <li key={entry.name}>{entry.name}: {entry.message}</li>)}</ul>}
  </section>;
}
