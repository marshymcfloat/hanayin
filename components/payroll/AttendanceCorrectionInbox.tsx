"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { getPendingAttendanceCorrectionsAction, decideAttendanceCorrectionAction } from "@/features/workforce/actions/attendance-corrections";
import styles from "./payroll.module.css";
import { useCommandKeys } from "./useCommandKeys";

export function AttendanceCorrectionInbox({ businessSlug }: { businessSlug: string }) {
  const [pending, setPending] = useState(""); const [message, setMessage] = useState("");
  const command = useCommandKeys();
  const query = useQuery({ queryKey: ["attendance-correction-requests", businessSlug], queryFn: async () => {
    const result = await getPendingAttendanceCorrectionsAction(); if (!result.success) throw new Error(result.error); return result.data;
  }, gcTime: 0, staleTime: 0 });
  async function decide(id: string, revision: number, decision: "APPROVED" | "REJECTED", comment: string) {
    setPending(id);
    try { const result = await decideAttendanceCorrectionAction(command("CORRECTION_DECIDE", { expectedRevision: revision, requestId: id, decision, comment })); setMessage(result.success ? "Review saved." : result.error); if (result.success) { toast.success("Review saved. Recalculate the affected payroll statement."); await query.refetch(); } else toast.error(result.error); }
    catch { setMessage("Review could not be confirmed. Refresh before retrying."); toast.error("Review could not be confirmed. Refresh before retrying."); }
    finally { setPending(""); }
  }
  return <section className={styles.panel}><h3>Employee correction requests</h3>{message && <p role="status" className={styles.notice}>{message}</p>}{query.data?.map(entry => <form key={entry.id} onSubmit={event => { event.preventDefault(); void decide(entry.id, entry.revision, "APPROVED", String(new FormData(event.currentTarget).get("comment"))); }}><p><strong>{entry.employeeName}</strong> · {entry.date} · {entry.reason}</p><div className={styles.notice}><p>Proposed status: {entry.proposed.status}{entry.proposed.fullDay ? " · confirms a full day with incomplete clocks" : ""}</p><p>Clock in: {entry.proposed.startedAt ? new Date(entry.proposed.startedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "Missing"} · Clock out: {entry.proposed.endedAt ? new Date(entry.proposed.endedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "Missing"}</p>{entry.proposed.breaks.map((item, index) => <p key={index}>Unpaid break: {new Date(item.start).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} – {new Date(item.end).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p>)}</div><label className={styles.label}>Review comment<input name="comment" required minLength={5} className={styles.input} /></label><div className={styles.toolbar + " mt-3"}><button className={styles.primary} disabled={Boolean(pending)}>Approve correction</button><button type="button" className={styles.secondary} disabled={Boolean(pending)} onClick={event => { const form = event.currentTarget.closest("form")!; void decide(entry.id, entry.revision, "REJECTED", String(new FormData(form).get("comment"))); }}>Reject request</button></div></form>)}{query.data?.length === 0 && <p className={styles.help}>No pending correction requests.</p>}{query.isError && <p role="alert">Correction requests could not be loaded.</p>}</section>;
}

