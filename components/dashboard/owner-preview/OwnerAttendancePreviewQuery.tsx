"use client";
import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { OwnerAttendancePreview } from "@/components/dashboard/owner-preview/OwnerAttendancePreview";
import { OwnerPreviewContentSkeleton } from "@/components/dashboard/owner-preview/OwnerPreviewContentSkeleton";
import { OwnerPreviewRefreshControl } from "@/components/dashboard/owner-preview/OwnerPreviewRefreshControl";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { attendancePreviewDateSchema, currentAttendanceDatePH } from "@/features/workforce/owner-attendance-preview-date";
import type { AttendanceConfirmedChange, OwnerAttendancePreviewData } from "@/features/workforce/types/owner-attendance-preview";
import { OwnerAttendanceLoading } from "@/components/dashboard/design-study/OwnerAttendanceLoading";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import { AttendanceReview } from "@/components/payroll/WorkforceReview";
import { AttendanceCorrectionInbox } from "@/components/payroll/AttendanceCorrectionInbox";
import { LeaveReview } from "@/components/payroll/LeaveReview";

const ATTENDANCE_STALE_TIME = 30_000;

export function OwnerAttendancePreviewRoute({ redesign = false, fontClassName = "" }: { redesign?: boolean; fontClassName?: string } = {}) {
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(currentAttendanceDatePH);
  const query = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "attendance", "page", { date: selectedDate }),
    queryFn: ({ signal }) => previewFetch<OwnerAttendancePreviewData>(`/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/attendance?date=${encodeURIComponent(selectedDate)}`, { signal }),
    staleTime: ATTENDANCE_STALE_TIME,
    placeholderData: redesign ? keepPreviousData : undefined,
  });

  if (!query.data && query.isPending) return redesign ? <OwnerAttendanceLoading /> : <OwnerPreviewContentSkeleton />;

  const refreshControl = <OwnerPreviewRefreshControl label="attendance" isFetching={query.isFetching} updatedAt={query.dataUpdatedAt} error={query.isError ? "Refresh failed; showing saved data if available." : null} onRefresh={() => { if (redesign) void refreshTeamQueries(queryClient, ownerPreviewKeys.section(identity, "attendance", "page")); else void query.refetch(); }} />;
  if (!query.data) return redesign ? <section className={`${styles.page} ${fontClassName}`}><header className={styles.header}><div><p className={styles.eyebrow}>Your team · Attendance</p><h1>Attendance</h1></div></header><div className={styles.empty}><div><h2>Attendance unavailable</h2><p role="alert">Could not load records for {selectedDate}. Try refreshing.</p>{refreshControl}</div></div></section> : <main className="px-4 py-8 md:pl-[160px]"><h1 className="text-2xl font-bold">Attendance unavailable</h1><div className="mt-4">{refreshControl}</div></main>;

  function onChanged(change?: AttendanceConfirmedChange) {
    void (async () => {
      await queryClient.cancelQueries({ queryKey: ownerPreviewKeys.page(identity, "attendance") });
      if (change) queryClient.setQueriesData<OwnerAttendancePreviewData>({ queryKey: ownerPreviewKeys.section(identity, "attendance", "page") }, cached => {
        if (!cached) return cached;
        if (change.type === "status") return cached.date === change.date ? { ...cached, employees: cached.employees.map(employee => employee.id === change.employeeId ? { ...employee, status: change.status } : employee) } : cached;
        const pending = cached.leaveRequests.some(request => request.id === change.requestId && request.status === "PENDING");
        return { ...cached, pendingLeaveCount: Math.max(0, cached.pendingLeaveCount - (pending ? 1 : 0)), leaveRequests: cached.leaveRequests.map(request => request.id === change.requestId ? { ...request, status: change.status } : request) };
      });
      await Promise.all(["attendance", "payroll", "bookings", "dashboard", "reports", "notifications"].map(page => queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, page) })));
    })();
  }
  return <><OwnerAttendancePreview redesign={redesign} fontClassName={fontClassName} changingDate={query.isPlaceholderData} businessSlug={identity.businessSlug} businessName={query.data.businessName} data={query.data} selectedDate={selectedDate} onDateChange={date => { if (attendancePreviewDateSchema.safeParse(date).success) setSelectedDate(date); }} refreshControl={refreshControl} onLeaveChanged={onChanged} /><div className={redesign ? "px-6 pb-10" : "px-6 pb-10 md:ml-[160px]"}><AttendanceReview employees={query.data.employees} busy={false} onChanged={onChanged} /><AttendanceCorrectionInbox businessSlug={identity.businessSlug} /><LeaveReview businessSlug={identity.businessSlug} onChanged={onChanged} /></div></>;
}

