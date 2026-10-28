"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MoreHorizontal, Search, UserMinus, UsersRound } from "lucide-react";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currentAttendanceDatePH, shiftAttendanceDate } from "@/features/workforce/owner-attendance-preview-date";
import type { AttendanceConfirmedChange, OwnerAttendancePreviewData } from "@/features/workforce/types/owner-attendance-preview";
import { OwnerAttendanceEditor, type AttendanceEditorTarget } from "@/components/dashboard/design-study/OwnerAttendanceEditor";
import { attendanceLabels, attendanceDateLabel, attendanceTimeLabel, AttendanceStatusLabel } from "@/components/dashboard/design-study/OwnerAttendanceDisplay";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import ui from "@/components/dashboard/design-study/owner-attendance.module.css";
import { useCatalogListState, useCatalogScroll } from "@/components/dashboard/owner-preview/useCatalogListState";
import { useOwnerPreviewContext } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";

export type AttendanceStudyProps = { data: OwnerAttendancePreviewData; selectedDate: string; onDateChange: (date: string) => void; refreshControl: ReactNode; onLeaveChanged?: (change: AttendanceConfirmedChange) => void; fontClassName?: string; changingDate?: boolean };
export function OwnerAttendanceStudy({ data, selectedDate, onDateChange, refreshControl, onLeaveChanged, fontClassName = "", changingDate = false }: AttendanceStudyProps) {
  const identity = useOwnerPreviewContext();
  const scope = `${identity.userId}:${identity.businessId}:Attendance`;
  const [section, setSection] = useCatalogListState(scope, "section", "daily");
  const [search, setSearch] = useCatalogListState(scope, "search", "");
  const [status, setStatus] = useCatalogListState(scope, "status", "ALL");
  const [limit, setLimit] = useCatalogListState(scope, "limit", 12);
  const content = useRef<HTMLDivElement>(null);
  useCatalogScroll(scope, content);
  const [editor, setEditor] = useState<AttendanceEditorTarget | null>(null);
  const [open, setOpen] = useState(false);
  const employees = data.employees.filter(employee => `${employee.name} ${employee.role}`.toLowerCase().includes(search.trim().toLowerCase()) && (status === "ALL" || employee.status === status));
  const count = (value: string) => data.employees.filter(employee => employee.status === value).length;
  function edit(target: AttendanceEditorTarget) { setEditor(target); setOpen(true); }
  return <div className={`${styles.page} ${fontClassName}`}><div ref={content} className={styles.content}>
    <Link href="/redesign/owner-dashboard" className={styles.back}><ArrowLeft size={15} aria-hidden="true" />Dashboard</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>{data.businessName} · Your team</p><h1>Attendance<span className={styles.titleDetail}>, day by day.</span></h1><p className={styles.description}>Review recorded hours, correct daily statuses, and respond to leave requests.</p><span className={ui.timezone}>Philippine time · UTC+8</span></div><div className={styles.refresh}>{refreshControl}</div></header>
    <section className={styles.summary} aria-label={`Attendance overview for ${attendanceDateLabel(data.date)}`}>{[
      { label: "Present", value: count("PRESENT"), detail: "Recorded as present", icon: CheckCircle2 },
      { label: "Late arrivals", value: count("LATE"), detail: "Recorded as late", icon: Clock3 },
      { label: "Absent", value: count("ABSENT"), detail: "Explicitly marked absent", icon: UserMinus },
      { label: "Pending leave", value: data.pendingLeaveCount, detail: "All awaiting owner review", icon: UsersRound },
    ].map(({ label, value, detail, icon: Icon }) => <div key={label} className={styles.metric}><span className={styles.metricLabel}><Icon size={16} aria-hidden="true" />{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</section>
    <div className={ui.toolbar}><AnimatedFilterGroup className={ui.segments} label="Attendance sections">{[["daily", "Daily attendance"], ["leave", "Leave requests"]].map(([value, text]) => <button type="button" key={value} aria-pressed={section === value} aria-controls="attendance-records" onClick={() => setSection(value)}>{text}</button>)}</AnimatedFilterGroup>
      <div className={ui.dateControls}><button type="button" className={styles.secondary} aria-label="Previous attendance day" onClick={() => onDateChange(shiftAttendanceDate(selectedDate, -1))}><ChevronLeft size={16} aria-hidden="true" /></button><input aria-label="Attendance date" type="date" value={selectedDate} onChange={event => { if (event.target.value) onDateChange(event.target.value); }} /><button type="button" className={styles.secondary} aria-label="Next attendance day" onClick={() => onDateChange(shiftAttendanceDate(selectedDate, 1))}><ChevronRight size={16} aria-hidden="true" /></button><button type="button" className={styles.secondary} onClick={() => onDateChange(currentAttendanceDatePH())}>Today</button></div>
    </div>
    {changingDate && <p className={`${styles.notice} ${ui.notice}`} role="status">Loading {attendanceDateLabel(selectedDate)}. Showing {attendanceDateLabel(data.date)} until it is ready.</p>}
    <section id="attendance-records" aria-label={section === "daily" ? "Daily attendance records" : "Recent leave requests"}>
      {section === "daily" ? <><div className={styles.toolbar}><div><h2 className="text-base font-semibold">{attendanceDateLabel(data.date)}</h2><span className={styles.count}>{employees.length} of {data.employees.length} employees · Missing records are not marked absent</span></div><div className={ui.filters}><label className={styles.search}><Search size={16} aria-hidden="true" /><input aria-label="Search attendance" placeholder="Search your team…" value={search} onChange={event => { setSearch(event.target.value); setLimit(12); }} /></label><Select value={status} onValueChange={value => { setStatus(value); setLimit(12); }}><SelectTrigger className={styles.select} aria-label="Filter attendance status"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${ui.menu} ${fontClassName}`}><SelectItem value="ALL">All statuses</SelectItem>{(["PRESENT", "LATE", "ABSENT", "OFF", "LEAVE", "UNRECORDED"] as const).map(value => <SelectItem key={value} value={value}>{attendanceLabels[value]}</SelectItem>)}</SelectContent></Select></div></div>
        <ul className={styles.list}>{employees.slice(0, limit).map(employee => <li className={styles.row} key={employee.id}><div className={ui.row}><div className={styles.serviceIdentity}><span className={styles.serviceIcon} aria-hidden="true"><UsersRound size={18} /></span><div className={styles.serviceCopy}><h3>{employee.name}</h3><span className={styles.metadata}>{employee.role[0] + employee.role.slice(1).toLowerCase()}</span></div></div><dl className={ui.time}><dt>Time in</dt><dd>{attendanceTimeLabel(employee.timeIn)}</dd></dl><dl className={ui.time}><dt>Time out</dt><dd>{attendanceTimeLabel(employee.timeOut)}</dd></dl><AttendanceStatusLabel status={employee.status} /><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={styles.rowActions} aria-label={`Attendance for ${employee.name}`} data-catalog-focus={`attendance:${employee.id}`} disabled={changingDate}><MoreHorizontal size={18} aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className={`${styles.menu} ${ui.menu} ${fontClassName}`}><DropdownMenuItem onSelect={() => edit({ kind: "status", employee, date: data.date })}>Correct status</DropdownMenuItem><DropdownMenuItem onSelect={() => edit({ kind: "history", employee })}>Attendance history</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></li>)}</ul>
        {!employees.length && <div className={`${styles.empty} ${ui.empty}`}><div><h3>{data.employees.length ? "No matching attendance" : "No employees yet"}</h3><p>{data.employees.length ? "Try another name or status." : "Employees will appear here when they join your team."}</p>{data.employees.length > 0 && <button type="button" className={styles.secondary} onClick={() => { setSearch(""); setStatus("ALL"); }}>Clear filters</button>}</div></div>}
        {employees.length > limit && <div className={styles.loadMore}><span>Showing {limit} of {employees.length}</span><button type="button" className={styles.secondary} onClick={() => setLimit(value => value + 12)}>Show more employees</button></div>}
      </> : <><div className={styles.toolbar}><div><h2 className="text-base font-semibold" tabIndex={-1} data-catalog-focus="leave-requests">Recent leave requests</h2><p className={styles.count}>Latest {data.leaveRequests.length} requests, up to 20 · All dates</p></div></div><ul className={styles.list}>{data.leaveRequests.map(request => <li className={styles.row} key={request.id}><div className={ui.leaveHeader}><div><h3>{request.employeeName}</h3><span className={styles.count}>{attendanceDateLabel(request.startDate)} – {attendanceDateLabel(request.endDate)}</span></div><AttendanceStatusLabel status={request.status} /></div><p className={ui.leaveReason}>{request.reason}</p><div className={ui.leaveFooter}><small>Submitted {attendanceDateLabel(request.submittedAt)}</small>{request.status === "PENDING" && <div className={ui.leaveActions}><button type="button" className={styles.secondary} data-catalog-focus={`leave:${request.id}:REJECTED`} onClick={() => edit({ kind: "leave", request, decision: "REJECTED" })}>Decline</button><button type="button" className={styles.primary} data-catalog-focus={`leave:${request.id}:APPROVED`} onClick={() => edit({ kind: "leave", request, decision: "APPROVED" })}>Review approval</button></div>}</div></li>)}</ul>{!data.leaveRequests.length && <div className={`${styles.empty} ${ui.empty}`}><div><h3>No recent leave requests</h3><p>Requests from your employees will appear here for review.</p></div></div>}</>}
    </section>
    {editor && <OwnerAttendanceEditor key={editor.kind === "leave" ? `leave:${editor.request.id}:${editor.decision}` : `${editor.kind}:${editor.employee.id}`} target={editor} open={open} onOpenChange={setOpen} onExited={() => setEditor(null)} onChanged={onLeaveChanged} fontClassName={fontClassName} />}
  </div></div>;
}
