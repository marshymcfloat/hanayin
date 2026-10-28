"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Root as ScrollAreaRoot, Viewport as ScrollAreaViewport } from "@radix-ui/react-scroll-area";
import { toast } from "sonner";
import { getEmployeeAttendanceHistory, previewAttendanceImpactAction, updateAttendanceStatus } from "@/features/workforce/actions/attendance-admin";
import { updateLeaveRequestStatus } from "@/features/workforce/actions/leave-request";
import type { AttendanceConfirmedChange, OwnerAttendancePreviewData } from "@/features/workforce/types/owner-attendance-preview";
import type { AttendanceStatus } from "@/prisma/generated/prisma/enums";
import { CatalogEditorOverlay, CatalogEditorFooter } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { useOwnerPreviewContext, useOwnerPreviewRevoke } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollBar } from "@/components/ui/scroll-area";
import { attendanceDateLabel, attendanceLabels, attendanceTimeLabel, AttendanceStatusLabel } from "@/components/dashboard/design-study/OwnerAttendanceDisplay";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import ui from "@/components/dashboard/design-study/owner-attendance.module.css";
import { useTeamDraftGuard } from "@/components/dashboard/design-study/useTeamDraftGuard";

type Employee = OwnerAttendancePreviewData["employees"][number];
type Leave = OwnerAttendancePreviewData["leaveRequests"][number];
export type AttendanceEditorTarget = { kind: "status"; employee: Employee; date: string } | { kind: "history"; employee: Employee } | { kind: "leave"; request: Leave; decision: "APPROVED" | "REJECTED" };
type Result = { success: boolean; error?: string };
type FormProps = { busy: boolean; fontClassName: string; close: () => void; submit: (task: () => Promise<Result>, message: string, change: AttendanceConfirmedChange) => Promise<void> };

export function OwnerAttendanceEditor({ target, open, onOpenChange, onExited, onChanged, fontClassName }: { target: AttendanceEditorTarget; open: boolean; onOpenChange: (open: boolean) => void; onExited: () => void; onChanged?: (change: AttendanceConfirmedChange) => void; fontClassName: string }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const revoke = useOwnerPreviewRevoke();
  const guard = useTeamDraftGuard(() => onOpenChange(false));
  async function submit(task: () => Promise<Result>, message: string, change: AttendanceConfirmedChange) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const result = await task();
      if (!result.success) {
        toast.error(result.error || "The change could not be saved. Your draft is still here.");
        if (result.error === "Forbidden" || result.error === "Unauthorized") revoke();
        return;
      }
      toast.success(message);
      setSaved(true);
      onOpenChange(false);
      onChanged?.(change);
    } catch { toast.error("The change could not be confirmed. Refresh before trying again."); }
    finally { lock.current = false; setBusy(false); }
  }
  const close = () => { if (!lock.current) guard.close(); };
  const title = target.kind === "history" ? "Attendance history" : target.kind === "status" ? "Correct attendance status" : target.decision === "APPROVED" ? "Approve leave request" : "Decline leave request";
  const person = target.kind === "leave" ? target.request.employeeName : target.employee.name;
  const common = { busy, fontClassName, close, submit };
  return <CatalogEditorOverlay open={open} onOpenChange={next => { if (!next) close(); }} onExited={onExited} title={title} description={`${person} · Philippine time (UTC+8)`} restoreFocusKey={target.kind === "leave" ? saved ? "leave-requests" : `leave:${target.request.id}:${target.decision}` : `attendance:${target.employee.id}`} className={`${styles.editor} ${ui.sheet} ${fontClassName}`}>
    {guard.confirmation}<div className={ui.form} style={guard.confirming ? { display: "none" } : undefined} onChangeCapture={guard.markChanged}>
    {target.kind === "status" ? <StatusForm employee={target.employee} date={target.date} {...common} markChanged={guard.markChanged} /> : target.kind === "leave" ? <LeaveForm request={target.request} decision={target.decision} {...common} /> : <AttendanceHistory employee={target.employee} close={close} />}
    </div>
  </CatalogEditorOverlay>;
}

function ScrollBody({ children }: { children: ReactNode }) {
  return <ScrollAreaRoot type="scroll" scrollHideDelay={800} className={styles.editorScroll}><ScrollAreaViewport data-slot="scroll-area-viewport" className="size-full" tabIndex={0} aria-label="Attendance details"><div className={styles.editorFields}>{children}</div></ScrollAreaViewport><ScrollBar /></ScrollAreaRoot>;
}
function FormFrame({ children, busy, close, onSubmit, label, disabled = false }: { children: ReactNode; busy: boolean; close: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; label: string; disabled?: boolean }) {
  return <form className={ui.form} onSubmit={onSubmit}><ScrollBody><fieldset disabled={busy} className={ui.fields}>{children}</fieldset></ScrollBody><CatalogEditorFooter className={styles.editorFooter}><button type="button" className={styles.secondary} disabled={busy} onClick={close}>Cancel</button><button type="submit" className={styles.primary} disabled={busy || disabled}>{busy ? "Saving…" : label}</button></CatalogEditorFooter></form>;
}
function StatusForm({ employee, date, markChanged, ...props }: { employee: Employee; date: string; markChanged: () => void } & FormProps) {
  const [status, setStatus] = useState<AttendanceStatus | "">(employee.status === "UNRECORDED" ? "" : employee.status);
  const [acknowledged, setAcknowledged] = useState(false);
  const identity = useOwnerPreviewContext();
  const revoke = useOwnerPreviewRevoke();
  const blocking = status === "ABSENT" || status === "OFF" || status === "LEAVE";
  const impact = useQuery({ queryKey: ownerPreviewKeys.section(identity, "attendance", "impact", { employeeId: employee.id, date }), queryFn: async () => {
    const result = await previewAttendanceImpactAction(employee.id, new Date(`${date}T12:00:00+08:00`));
    if (!result.success) { if (result.error === "Forbidden" || result.error === "Unauthorized") revoke(); throw new Error("Could not check affected bookings."); }
    return result.bookings;
  }, enabled: blocking, staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false });
  const disabled = !status || status === employee.status || (blocking && (!impact.data || impact.isFetching || impact.isError || (impact.data.length > 0 && !acknowledged)));
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !status) return;
    void props.submit(() => updateAttendanceStatus(employee.id, new Date(`${date}T12:00:00+08:00`), status), "Attendance status updated.", { type: "status", employeeId: employee.id, date, status });
  }
  return <FormFrame {...props} onSubmit={save} label="Save status" disabled={disabled}>
    <p className={ui.help}>{attendanceDateLabel(date)} · Current status: {attendanceLabels[employee.status]}. Status corrections can affect payroll and booking availability. Recorded clock-in and clock-out times stay unchanged.</p>
    <label className={ui.field}>Attendance status<Select value={status} disabled={props.busy} onValueChange={(value: AttendanceStatus) => { setStatus(value); setAcknowledged(false); markChanged(); }}><SelectTrigger className={styles.categorySelect} aria-label="Attendance status"><SelectValue placeholder="Choose a recorded status" /></SelectTrigger><SelectContent className={`${styles.menu} ${ui.menu} ${props.fontClassName}`}>{(["PRESENT", "LATE", "ABSENT", "OFF", "LEAVE"] as const).map(value => <SelectItem key={value} value={value}>{attendanceLabels[value]}</SelectItem>)}</SelectContent></Select></label>
    {blocking && <div className={ui.impact}>{impact.isPending || impact.isFetching ? <p role="status">Checking assigned bookings…</p> : impact.isError ? <><p role="alert">Could not check affected bookings. Nothing has been saved.</p><button type="button" className={styles.secondary} onClick={() => { void impact.refetch(); }}>Retry booking check</button></> : impact.data?.length ? <><strong>{impact.data.length} assigned {impact.data.length === 1 ? "booking needs" : "bookings need"} review.</strong><ul>{impact.data.map(booking => <li key={booking.bookingId}>Booking #{booking.bookingId} · {booking.customerName || "Customer name unavailable"} · {attendanceTimeLabel(booking.scheduledAt)}<br />{booking.serviceNames.join(", ")}</li>)}</ul><label className={ui.choice}><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />I will review these assignments after changing this status.</label></> : <p>No assigned active bookings found for this date.</p>}</div>}
  </FormFrame>;
}
function LeaveForm({ request, decision, ...props }: { request: Leave; decision: "APPROVED" | "REJECTED" } & FormProps) {
  const [comment, setComment] = useState("");
  const [paid, setPaid] = useState(false);
  function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void props.submit(() => updateLeaveRequestStatus(request.id, decision, comment.trim() || undefined, decision === "APPROVED" ? paid : undefined), decision === "APPROVED" ? "Leave approved." : "Leave declined.", { type: "leave", requestId: request.id, status: decision }); }
  return <FormFrame {...props} onSubmit={save} label={decision === "APPROVED" ? "Confirm approval" : "Confirm decline"}>
    <p className={ui.help}>{attendanceDateLabel(request.startDate)} – {attendanceDateLabel(request.endDate)}</p><p className={ui.leaveReason}>{request.reason}</p>
    <p className={ui.help}>{decision === "APPROVED" ? "Approval reserves eligible leave dates and may affect assigned bookings. Paid leave enters payroll only after its work date. Review the dates and payment treatment before confirming." : "This will decline the employee’s request. Add a note to explain your decision."}</p>
    <label className={ui.field}>Note to employee (optional)<textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} /></label>
    {decision === "APPROVED" && <label className={ui.choice}><input type="checkbox" checked={paid} onChange={event => setPaid(event.target.checked)} />Paid leave · Count these leave days as paid for payroll.</label>}
  </FormFrame>;
}
function AttendanceHistory({ employee, close }: { employee: Employee; close: () => void }) {
  const identity = useOwnerPreviewContext();
  const revoke = useOwnerPreviewRevoke();
  const query = useQuery({ queryKey: ownerPreviewKeys.section(identity, "attendance", "history", { employeeId: employee.id }), queryFn: async () => {
    const result = await getEmployeeAttendanceHistory(employee.id);
    if (!result.success) { if (result.error === "Forbidden" || result.error === "Unauthorized") revoke(); throw new Error("Could not load attendance history."); }
    return result.data;
  }, gcTime: 0, staleTime: 0, retry: false });
  return <><ScrollBody><p className={ui.help}>Latest 90 recorded days. All dates and times use Philippine time.</p>{!query.data && query.isPending ? <div role="status" aria-label="Loading attendance history" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className={styles.skeleton} style={{ height: 75, marginBottom: 12 }} />)}</div> : <>{query.isError && <div className={styles.notice} role="alert"><p>Attendance history could not be refreshed.</p><button className={styles.secondary} type="button" onClick={() => { void query.refetch(); }}>Retry history</button></div>}{query.data?.length === 0 ? <p className={ui.help}>No attendance recorded yet.</p> : <ul className={ui.history}>{query.data?.map(record => <li key={record.id}><strong>{attendanceDateLabel(record.date)}</strong><AttendanceStatusLabel status={record.status} /><p>Time in: {attendanceTimeLabel(record.time_in)} · Time out: {attendanceTimeLabel(record.time_out)}{record.status === "LEAVE" && ` · ${record.is_paid_leave ? "Paid" : "Unpaid"} leave`}</p></li>)}</ul>}</>}</ScrollBody><CatalogEditorFooter className={styles.editorFooter}><button type="button" className={styles.secondary} onClick={close}>Close</button></CatalogEditorFooter></>;
}
