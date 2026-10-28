"use client";
import { useState } from "react";
import { toast } from "sonner";
import { exportGovernmentPayrollAction, exportPayrollStatutoryAction } from "@/features/payroll/actions/exports";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import styles from "./payroll.module.css";

export function GovernmentExports() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); const [agency, setAgency] = useState("SSS");
  const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  async function download(official: boolean) {
    setPending(true); setMessage("");
    try {
      const result = await (official ? exportGovernmentPayrollAction : exportPayrollStatutoryAction)({ month, agency });
      if (!result.success) { setMessage(result.error); toast.error(result.error); return; }
      const url = URL.createObjectURL(new Blob([result.file.content], { type: result.file.mime }));
      const link = document.createElement("a"); link.href = url; link.download = result.file.filename; link.click(); URL.revokeObjectURL(url);
      setMessage(official ? "Versioned government file downloaded. Filing and remittance remain external." : "Review register downloaded. This register is not an agency upload file.");
      toast.success(official ? "Government file downloaded." : "Review register downloaded.");
    } catch { setMessage("Export could not be downloaded. Try again."); toast.error("Export could not be downloaded. Try again."); } finally { setPending(false); }
  }
  return <section className={styles.panel}><h3>Government reports</h3><div className={styles.fields}><label>Assessment month<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label><label>Agency<Select value={agency} onValueChange={setAgency}><SelectTrigger className={styles.select} aria-label="Export agency"><SelectValue /></SelectTrigger><SelectContent className={styles.menu}>{["SSS", "PHILHEALTH", "PAGIBIG", "BIR"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label></div><div className={styles.toolbar + " mt-4"}><button className={styles.secondary} disabled={pending || !month} onClick={() => void download(false)}>Download review register</button><button className={styles.secondary} disabled={pending || !month} onClick={() => void download(true)}>Download verified agency format</button></div>{message && <p role="status">{message}</p>}</section>;
}
