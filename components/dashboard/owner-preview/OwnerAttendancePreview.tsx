"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, Clock3, Search, UserMinus, UsersRound } from "lucide-react";

import type { AttendanceConfirmedChange, OwnerAttendancePreviewData } from "@/features/workforce/types/owner-attendance-preview";
import { cn } from "@/lib/utils";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";
import { PersonAvatar, StatusChip, WorkforceHeader, WorkforceKpi, WorkforcePageShell, panelClass } from "./OwnerWorkforcePreviewShared";
import { OwnerAttendanceStudy } from "@/components/dashboard/design-study/OwnerAttendanceStudy";

type Employee = OwnerAttendancePreviewData["employees"][number];
type LeaveRequest = OwnerAttendancePreviewData["leaveRequests"][number];

const dateFormat = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const displayDate = (value: string) => dateFormat.format(new Date(value));
const displayTime = (value: string | null) => value ? timeFormat.format(new Date(value)) : "—";
const label = (value: string) => value === "UNRECORDED" ? "Not recorded" : value === "OFF" ? "Off" : value === "LEAVE" ? "On leave" : value[0] + value.slice(1).toLowerCase();

function tone(value: string): "positive" | "warning" | "negative" | "neutral" {
  if (value === "PRESENT" || value === "APPROVED") return "positive";
  if (value === "LATE" || value === "PENDING") return "warning";
  if (value === "ABSENT" || value === "REJECTED") return "negative";
  return "neutral";
}

function AttendanceRow({ employee, index, mobile }: { employee: Employee; index: number; mobile: boolean }) {
  const person = <div className="flex min-w-0 items-center gap-3"><PersonAvatar name={employee.name} tone={index % 2 ? "neutral" : "lime"} /><div className="min-w-0"><p className="truncate font-bold">{employee.name}</p><p className="mt-0.5 text-xs capitalize text-[#696C67]">{employee.role.toLowerCase()}</p></div></div>;
  const status = <StatusChip tone={tone(employee.status)}>{label(employee.status)}</StatusChip>;
  if (mobile) return <article className="p-4"><div className="flex items-start justify-between gap-2">{person}{status}</div><dl className="mt-4 grid grid-cols-2 gap-3 rounded-[16px] bg-[#F8F9F6] p-3"><div><dt className="text-[10px] font-bold uppercase text-[#81847E]">Time in</dt><dd className="mt-1 font-mono text-sm font-semibold">{displayTime(employee.timeIn)}</dd></div><div><dt className="text-[10px] font-bold uppercase text-[#81847E]">Time out</dt><dd className="mt-1 font-mono text-sm font-semibold">{displayTime(employee.timeOut)}</dd></div></dl></article>;
  return <tr className="border-b border-[#ECEEE9] last:border-0"><td className="px-5 py-4">{person}</td><td className="px-5 py-4 font-mono text-xs font-semibold">{displayTime(employee.timeIn)}</td><td className="px-5 py-4 font-mono text-xs font-semibold">{displayTime(employee.timeOut)}</td><td className="px-5 py-4 text-right">{status}</td></tr>;
}

function LeaveRow({ request, index }: { request: LeaveRequest; index: number }) {
  return <article className="p-4 sm:p-5"><div className="flex items-start gap-3"><PersonAvatar name={request.employeeName} tone={index % 2 ? "neutral" : "lime"} /><div><h3 className="font-bold">{request.employeeName}</h3><StatusChip tone={tone(request.status)}>{label(request.status)}</StatusChip><p className="mt-2 text-xs">{displayDate(request.startDate)} – {displayDate(request.endDate)}</p><p className="mt-2 text-xs">{request.reason}</p>{request.status === "PENDING" && <a href="#leave-review" className="mt-3 inline-flex min-h-11 items-center rounded-full border px-4 text-xs font-bold">Review dates and paid treatment below</a>}</div></div></article>;
}
export function OwnerAttendancePreview({ businessSlug, businessName, data, selectedDate, onDateChange, refreshControl, onLeaveChanged, redesign = false, fontClassName = "", changingDate = false }: {
  businessSlug: string;
  businessName: string;
  data: OwnerAttendancePreviewData;
  selectedDate: string;
  onDateChange: (date: string) => void;
  refreshControl: ReactNode;
  onLeaveChanged?: (change?: AttendanceConfirmedChange) => void;
  redesign?: boolean;
  fontClassName?: string;
  changingDate?: boolean;
}) {
  const [tab, setTab] = useState<"daily" | "leave">("daily");
  const [search, setSearch] = useState("");
  const visibleEmployees = data.employees.filter((employee) => `${employee.name} ${employee.role} ${label(employee.status)}`.toLowerCase().includes(search.trim().toLowerCase()));
  const dayLabel = dateFormat.format(new Date(`${selectedDate}T12:00:00+08:00`));
  const count = (status: Employee["status"]) => data.employees.filter((employee) => employee.status === status).length;

  if (redesign) return <OwnerAttendanceStudy data={data} selectedDate={selectedDate} onDateChange={onDateChange} refreshControl={refreshControl} onLeaveChanged={onLeaveChanged} fontClassName={fontClassName} changingDate={changingDate} />;

  return <WorkforcePageShell businessSlug={businessSlug} active="attendance">
    <WorkforceHeader businessSlug={businessSlug} businessName={businessName} eyebrow="Workforce operations" title="Attendance" description="Review recorded team attendance and recent leave requests." action={<div className="flex flex-wrap items-center gap-2 self-start sm:self-auto"><label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E1E3DE] bg-white px-3 text-xs font-semibold"><CalendarDays className="h-4 w-4 text-[#696C67]" aria-hidden="true" /><span className="sr-only">Attendance date</span><input type="date" value={selectedDate} onChange={(event) => { if (event.target.value) onDateChange(event.target.value); }} className="min-h-10 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-[#72CF35]" /></label>{refreshControl}</div>} />
    <section aria-label={`Attendance overview for ${dayLabel}`} className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <WorkforceKpi label="Present" value={String(count("PRESENT"))} detail={`${dayLabel} · recorded`} icon={CheckCircle2} tone="lime" />
      <WorkforceKpi label="Late arrivals" value={String(count("LATE"))} detail={`${dayLabel} · recorded`} icon={Clock3} tone="coral" />
      <WorkforceKpi label="Absent" value={String(count("ABSENT"))} detail="Explicitly marked absent" icon={UserMinus} tone="coral" />
      <WorkforceKpi label="Leave requests" value={String(data.pendingLeaveCount)} detail="Awaiting owner review" icon={UsersRound} />
    </section>
    <section className={cn(panelClass, "mt-5 overflow-hidden")} aria-labelledby="attendance-workspace-heading">
      <div className="border-b border-[#ECEEE9] p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 id="attendance-workspace-heading" className="text-lg font-bold">Team attendance</h2><p className="mt-1 text-xs text-[#696C67]">Recorded status for {dayLabel} and recent leave requests</p></div><AnimatedFilterGroup className="grid grid-cols-2 gap-1.5 rounded-[16px] bg-[#F1F2EF] p-1" label="Attendance sections"><button type="button" aria-pressed={tab === "daily"} onClick={() => setTab("daily")} className={cn("min-h-11 cursor-pointer rounded-[13px] px-4 text-xs font-bold outline-none focus-visible:ring-3 focus-visible:ring-[#72CF35]", tab === "daily" ? "text-white" : "text-[#696C67]")}>Daily attendance</button><button type="button" aria-pressed={tab === "leave"} onClick={() => setTab("leave")} className={cn("min-h-11 cursor-pointer rounded-[13px] px-4 text-xs font-bold outline-none focus-visible:ring-3 focus-visible:ring-[#72CF35]", tab === "leave" ? "text-white" : "text-[#696C67]")}>Leave requests</button></AnimatedFilterGroup></div>{tab === "daily" && <label className="relative mt-4 block sm:max-w-sm"><span className="sr-only">Search attendance</span><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92958F]" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search attendance" className="h-11 w-full rounded-[14px] border border-[#E1E3DE] bg-[#F8F9F6] pl-10 pr-4 text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20" /></label>}</div>
      {tab === "daily" ? visibleEmployees.length ? <><div className="hidden md:block"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[#ECEEE9] text-[10px] font-bold uppercase tracking-[0.07em] text-[#696C67]"><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Time in</th><th className="px-5 py-3">Time out</th><th className="px-5 py-3 text-right">Status</th></tr></thead><tbody>{visibleEmployees.map((employee, index) => <AttendanceRow key={employee.id} employee={employee} index={index} mobile={false} />)}</tbody></table></div><div className="divide-y divide-[#ECEEE9] md:hidden">{visibleEmployees.map((employee, index) => <AttendanceRow key={employee.id} employee={employee} index={index} mobile />)}</div></> : <p className="px-5 py-12 text-center text-sm text-[#696C67]">{data.employees.length ? "No employees match your search." : "No employees found for this business."}</p> : data.leaveRequests.length ? <div className="divide-y divide-[#ECEEE9]">{data.leaveRequests.map((request, index) => <LeaveRow key={request.id} request={request} index={index} />)}</div> : <p className="px-5 py-12 text-center text-sm text-[#696C67]">No recent leave requests.</p>}
    </section>
  </WorkforcePageShell>;
}

