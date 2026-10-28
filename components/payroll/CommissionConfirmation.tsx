"use client";
import { useState, type FormEvent } from "react";
import { confirmHistoricalPayrollCommissionAction, type getPayrollWorkspaceAction } from "@/features/payroll/actions/lifecycle";
import type { PayrollCommandResult } from "@/features/payroll/v2/contracts";
import { useCommandKeys } from "./useCommandKeys";
import { php } from "./StatementDetails";
import styles from "./payroll.module.css";
type History = Extract<Awaited<ReturnType<typeof getPayrollWorkspaceAction>>, { success: true }>["historical"];
export function CommissionConfirmation({ historical, busy, mutate }: { historical: History; busy: boolean; mutate: (command: () => Promise<PayrollCommandResult>, message: string) => Promise<unknown> }) {
  const command = useCommandKeys();
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>, entry: History["records"][number]) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setMessage("");
    const result = await mutate(() => confirmHistoricalPayrollCommissionAction(command("COMMISSION_CONFIRM", { serviceId: entry.id, expectedRevision: entry.revision, rate: form.get("rate"), base: form.get("base"), payableOn: form.get("payableOn") || undefined, evidence: form.get("evidence") })), "Commission evidence recorded; recalculate its statement");
    if (result) setMessage("Source confirmation saved.");
  }
  if (!historical.count) return null;
  return <section className={styles.panel}><h3>Unallocated commissions needing confirmation · {historical.count}</h3><p className={styles.help}>Historical rates cannot be inferred from current salary settings. Confirm the rate, base, and actual date of full customer payment from evidence. The next batch appears as records are resolved.</p>{message && <p role="status">{message}</p>}{historical.records.map(entry => <form className={styles.panel} key={entry.id} onSubmit={event => void submit(event, entry)}><p>{entry.employeeName} · service #{entry.id} · work date {entry.earnedOn ?? "requires correction"}</p><div className={styles.fields}><label>Confirmed commission percentage<input name="rate" required inputMode="decimal" /></label><label>Confirmed commission base<input name="base" required inputMode="decimal" defaultValue={entry.recordedBase} /></label>{entry.paid && <label>Customer fully paid on<input name="payableOn" type="date" required /></label>}<label>Rate and payment evidence<input name="evidence" required minLength={10} maxLength={1000} /></label></div><p className={styles.help}>Recorded booking base: {php(entry.recordedBase)}. {entry.paid ? "Full payment is recorded; verify its date." : "This commission will remain unavailable until full customer payment."}</p><button className={styles.secondary + " mt-4"} disabled={busy || !entry.earnedOn}>Confirm captured evidence</button></form>)}</section>;
}
