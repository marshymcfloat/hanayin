"use client";
import { toast } from "sonner";
import { useState, type FormEvent } from "react";
import { getPayrollAttendanceReviewAction, correctPayrollAttendanceAction } from "@/features/workforce/actions/payroll-attendance";
import type { PayrollWorkspaceView } from "@/features/payroll/v2/contracts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import styles from "./payroll.module.css";
import { useCommandKeys } from "./useCommandKeys";
const localTime = (value: string) => value ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16) : "";

export function AttendanceReview({ employees, busy, onChanged }: { employees: Pick<PayrollWorkspaceView["employees"][number], "id" | "name">[]; busy: boolean; onChanged: () => void }) {
  const [employee, setEmployee] = useState(String(employees[0]?.id ?? ""));
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("PRESENT");
  const [fullDay, setFullDay] = useState(false);
  const [review, setReview] = useState<Extract<Awaited<ReturnType<typeof getPayrollAttendanceReviewAction>>, { success: true }>["data"] | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const command = useCommandKeys();
  const [breaks, setBreaks] = useState<{ start: string; end: string }[]>([]);
  async function load() {
    setPending(true); setMessage("");
    try { const result = await getPayrollAttendanceReviewAction(Number(employee), date); if (result.success) { setReview(result.data); setStatus(result.data.status === "LEAVE" ? "PRESENT" : result.data.status); setBreaks(result.data.breaks.map(entry => ({ start: localTime(entry.start), end: localTime(entry.end) }))); } else setMessage(result.error); }
    catch { setMessage("Attendance could not be loaded."); }
    finally { setPending(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!review) return;
    const form = new FormData(event.currentTarget); setPending(true); setMessage("");
    const start = String(form.get("startedAt") ?? ""); const end = String(form.get("endedAt") ?? "");
    if (Boolean(start) !== Boolean(end) && !fullDay) { setMessage("Provide both clock times, or explicitly confirm a full working day."); setPending(false); return; }
    try {
      const result = await correctPayrollAttendanceAction(command("ATTENDANCE_CORRECTION", { expectedRevision: review.revision, employeeId: Number(employee), date, status, confirmFullDay: fullDay, reason: form.get("reason"),
        startedAt: start && end ? new Date(start + "+08:00").toISOString() : undefined, endedAt: start && end ? new Date(end + "+08:00").toISOString() : undefined, breaks: start && end ? breaks.map(entry => ({ start: new Date(entry.start + "+08:00").toISOString(), end: new Date(entry.end + "+08:00").toISOString() })) : [] }));
      if (result.success) { setReview(null); setMessage("Correction saved. Recalculate the affected statement and review it again."); toast.success("Correction saved. Recalculate the affected statement."); onChanged(); }
      else { setMessage(result.error); toast.error(result.error); }
    } catch { setMessage("Correction was not confirmed. Retry with the same request."); toast.error("Correction was not confirmed. Retry with the same request."); }
    finally { setPending(false); }
  }
  return <section className={styles.panel}><h3>Review attendance here</h3><div className={styles.fields}><label>Attendance employee<Select value={employee} onValueChange={value => { setEmployee(value); setReview(null); }}><SelectTrigger className={styles.select} aria-label="Attendance employee"><SelectValue /></SelectTrigger><SelectContent className={styles.menu}>{employees.map(entry => <SelectItem value={String(entry.id)} key={entry.id}>{entry.name}</SelectItem>)}</SelectContent></Select></label><label>Work date<input type="date" value={date} onChange={event => { setDate(event.target.value); setReview(null); }} /></label></div><button className={styles.secondary + " mt-3"} disabled={busy || pending || !date} onClick={() => void load()}>Load attendance</button>{message && <p role="status" className={styles.notice}>{message}</p>}{review && <form onSubmit={submit}><p className={styles.help}>{review.locked ? "This work was already paid. Its evidence is preserved; create a payroll adjustment." : "Confirm what happened and record the correction reason."}</p><div className={styles.fields}><label>Confirmed status<Select value={status} onValueChange={setStatus}><SelectTrigger className={styles.select} aria-label="Confirmed status"><SelectValue /></SelectTrigger><SelectContent className={styles.menu}>{["PRESENT", "LATE", "ABSENT", "OFF"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label><label>Clock in (Philippines)<input name="startedAt" type="datetime-local" defaultValue={localTime(review.startedAt)} /></label><label>Clock out (Philippines)<input name="endedAt" type="datetime-local" defaultValue={localTime(review.endedAt)} /></label><label>Correction reason<input name="reason" required minLength={5} maxLength={1000} /></label></div><div className={styles.panel}><h4>Reviewed unpaid breaks</h4>{breaks.map((entry, index) => <div key={index} className={styles.fields}><label>Break starts<input required type="datetime-local" value={entry.start} onChange={event => setBreaks(breaks.map((item, position) => position === index ? { ...item, start: event.target.value } : item))} /></label><label>Break ends<input required type="datetime-local" value={entry.end} onChange={event => setBreaks(breaks.map((item, position) => position === index ? { ...item, end: event.target.value } : item))} /></label><button type="button" className={styles.secondary} onClick={() => setBreaks(breaks.filter((_, position) => position !== index))}>Remove break</button></div>)}<button type="button" className={styles.secondary} onClick={() => setBreaks([...breaks, { start: "", end: "" }])}>Add unpaid break</button><p className={styles.help}>An empty list confirms that no unpaid break should be deducted.</p></div><label className={styles.choice}><input type="checkbox" checked={fullDay} onChange={event => setFullDay(event.target.checked)} />Confirm a full working day without complete clock records</label><button className={styles.primary + " mt-3"} disabled={busy || pending || review.locked}>Save reviewed correction</button></form>}</section>;
}

