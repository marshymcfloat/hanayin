"use client";
import { useState, type FormEvent } from "react";
import { registerPayrollRulesAction, certifyPayrollRulesAction, getPayrollRuleInventoryAction } from "@/features/payroll/actions/rule-registry";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import styles from "./payroll.module.css";

export function PayrollRulesAdmin() {
  const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  const [registered, setRegistered] = useState<{ id: string; hash: string; fixtureHash: string } | null>(null);
  const inventory = useQuery({ queryKey: ["platform-payroll-rule-packages"], queryFn: async () => { const result = await getPayrollRuleInventoryAction(); if (!result.success) throw new Error(result.error); return result.data; }, gcTime: 0, staleTime: 0 });
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const file = new FormData(event.currentTarget).get("package");
    if (!(file instanceof File) || file.size > 1024 * 1024) { setMessage("Choose a rule package smaller than 1 MB."); return; }
    setPending(true);
    try { const result = await registerPayrollRulesAction(JSON.parse(await file.text())); if (result.success) { setRegistered({ id: result.id, hash: result.hash, fixtureHash: result.fixtureHash }); await inventory.refetch(); setMessage("Registered as unverified. Publication remains blocked until independent certification."); } else setMessage(result.error); }
    catch { setMessage("The file is invalid or the registration could not be confirmed."); }
    finally { setPending(false); }
  }
  async function certify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!registered) return;
    const form = new FormData(event.currentTarget); setPending(true);
    try { const result = await certifyPayrollRulesAction({ id: registered.id, expectedHash: registered.hash, reviewer: form.get("reviewer"), qualifications: form.get("qualifications"), evidence: form.get("evidence"), fixtureHash: form.get("fixtureHash") }); setMessage(result.success ? "Independent certification recorded. Businesses still require their own reconciliation and activation." : result.error); }
    catch { setMessage("Certification could not be confirmed."); }
    finally { setPending(false); }
  }
  return <section className={styles.workspace}><header className={styles.header}><div><p>Versioned rules, official sources, and independent certification.</p></div></header>{message && <p role="status" className={styles.notice}>{message}</p>}<form onSubmit={register} className={styles.panel}><h2>Register a reviewed rule package</h2><p className={styles.help}>Upload the calculation package and official issuance manifest. Registration alone cannot enable payslip publication.</p><label className={styles.label}>Rule package JSON<input name="package" type="file" accept="application/json,.json" required disabled={pending} /></label><button className={styles.primary + " mt-4"} disabled={pending}>Register unverified package</button></form><section className={styles.panel}><h2>Registered rule packages</h2>{inventory.isError && <p role="alert">{inventory.error.message}</p>}<Select value={registered?.id ?? ""} onValueChange={value => { const entry = inventory.data?.find(item => item.id === value); if (entry) setRegistered(entry); }}><SelectTrigger className={styles.select} aria-label="Saved rule package"><SelectValue placeholder="Resume a saved package" /></SelectTrigger><SelectContent className={styles.menu}>{inventory.data?.map(entry => <SelectItem value={entry.id} key={entry.id}>{entry.id} · {entry.certified ? "Certified" : "Unverified"} · {entry.from} – {entry.through}</SelectItem>)}</SelectContent></Select></section>{registered && <form onSubmit={certify} className={styles.panel}><h2>Record independent certification · {registered.id}</h2><p className={styles.help}>Fixture manifest SHA-256: {registered.fixtureHash}. The external review must reference this exact manifest.</p><div className={styles.fields}><label>Independent reviewer<input name="reviewer" required minLength={3} /></label><label>Reviewer qualifications<input name="qualifications" required minLength={10} /></label><label>Review evidence reference<input name="evidence" required minLength={20} /></label><label>Reviewed fixture SHA-256<input name="fixtureHash" required pattern="[a-f0-9]{64}" /></label></div><p className={styles.help}>Certification records completed external review. It does not perform or substitute for that review.</p><button className={styles.primary} disabled={pending}>Record certification</button></form>}</section>;
}


