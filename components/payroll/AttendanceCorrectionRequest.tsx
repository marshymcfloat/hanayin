"use client";
import { useRef, useState, type FormEvent } from "react";
import { getMyAttendanceCorrectionSourceAction, requestAttendanceCorrectionAction } from "@/features/workforce/actions/attendance-corrections";
import styles from "./payroll.module.css";

export function AttendanceCorrectionRequest() {
  const [date, setDate] = useState(""); const [source, setSource] = useState<{ revision: number; status: string } | null>(null);
  const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  const key = useRef(crypto.randomUUID());
  async function load() {
    setPending(true);
    try { const result = await getMyAttendanceCorrectionSourceAction(date); if (result.success) setSource(result.data); else setMessage(result.error); }
    finally { setPending(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!source) return;
    const form = new FormData(event.currentTarget); const start = String(form.get("start") ?? ""); const end = String(form.get("end") ?? "");
    setPending(true);
    try {
      const result = await requestAttendanceCorrectionAction({ key: key.current, expectedRevision: source.revision, date, status: "PRESENT", confirmFullDay: form.get("fullDay") === "on", reason: form.get("reason"), breaks: [], startedAt: start ? new Date(start + "+08:00").toISOString() : undefined, endedAt: end ? new Date(end + "+08:00").toISOString() : undefined });
      setMessage(result.success ? "Correction requested. An authorized owner must review it." : result.error);
      if (result.success) { setSource(null); key.current = crypto.randomUUID(); }
    } catch { setMessage("The request was not confirmed. Retry with the same request."); }
    finally { setPending(false); }
  }
  return <section className={styles.panel}><h2>Request an attendance correction</h2><label className={styles.label}>Work date<input className={styles.input} type="date" value={date} onChange={event => { setDate(event.target.value); setSource(null); }} /></label><button className={styles.secondary + " mt-3"} disabled={pending || !date} onClick={() => void load()}>Load my attendance</button>{message && <p role="status" className={styles.notice}>{message}</p>}{source && <form className="mt-4" onSubmit={submit}><p className={styles.help}>Recorded status: {source.status}. A request does not change your pay until reviewed.</p><div className={styles.fields}><label>Proposed clock in (Philippines)<input type="datetime-local" name="start" /></label><label>Proposed clock out (Philippines)<input type="datetime-local" name="end" /></label><label>Correction reason<input name="reason" required minLength={5} maxLength={1000} /></label></div><label className={styles.choice}><input type="checkbox" name="fullDay" />I worked a full day; my clocks are incomplete.</label><button className={styles.primary + " mt-4"} disabled={pending}>Request owner review</button></form>}</section>;
}
