import { notFound, redirect } from "next/navigation";
import { Role } from "@/prisma/generated/prisma/enums";
import { OwnerAttendanceClient } from "@/components/dashboard/attendance/OwnerAttendanceClient";
import { EmployeeLeaveClient } from "@/components/dashboard/attendance/EmployeeLeaveClient";
import {
  getLeaveRequests,
  getUserLeaveRequests,
} from "@/features/workforce/queries/leave-request";
import { getDailyAttendance } from "@/features/workforce/actions/attendance-admin";
import { getAttendanceWorkspaceContext } from "@/features/workforce/queries/attendance";

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { businessSlug } = await params;
  const { date: dateParam } = await searchParams;
  const contextResult = await getAttendanceWorkspaceContext(businessSlug);
  if (!contextResult.success) {
    if (contextResult.error === "Unauthorized") redirect("/auth/login");
    if (contextResult.error === "Forbidden") redirect("/app");
    notFound();
  }
  const context = contextResult.data;
  const role = context.role;

  if (role === Role.OWNER) {
    const requestsResult = await getLeaveRequests(context.businessId);
    const requests = requestsResult.success ? requestsResult.data || [] : [];

    // Parse date or default to today
    const date = dateParam ? new Date(dateParam) : new Date();
    // Validate date?

    const attendanceResult = await getDailyAttendance(context.businessId, date);
    const dailyAttendance = attendanceResult.success
      ? attendanceResult.data || []
      : [];

    return (
      <OwnerAttendanceClient
        businessId={context.businessId}
        businessSlug={businessSlug}
        leaveRequests={requests}
        initialDailyAttendance={dailyAttendance}
        currentDate={date}
      />
    );
  } else if (role === Role.EMPLOYEE) {
    if (!context.employeeId) {
      return <div>Employee profile not found.</div>;
    }

    const requestsResult = await getUserLeaveRequests(context.employeeId);
    const requests = requestsResult.success ? requestsResult.data || [] : [];

    return (
      <EmployeeLeaveClient
        employeeId={context.employeeId}
        businessId={context.businessId}
        businessSlug={businessSlug}
        requests={requests}
      />
    );
  } else {
    return <div>Access Denied</div>;
  }
}
