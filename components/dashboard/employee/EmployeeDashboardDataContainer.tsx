import EmployeeDashboard from "./EmployeeDashboard";
import ManagerDashboard from "@/components/dashboard/manager/ManagerDashboard";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { redirect } from "next/navigation";
import { StaffProfile } from "@/prisma/generated/prisma/enums";
import { getEmployeeDashboardData } from "@/features/dashboard/queries/employee-dashboard";

export default async function EmployeeDashboardDataContainer({
  businessSlug,
}: {
  businessSlug: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");
  const data = await getEmployeeDashboardData({ businessSlug });
  if (!data) return <div>Error loading dashboard</div>;
  const {
    business,
    employee,
    employeeProfile,
    activeServices,
    completedServices,
    pendingServices,
    managerQueueServices,
    managerQueueEmployees,
    totalEstimatedSalary,
    capabilities,
    todayAttendance,
    todayBookings,
    managerBookings,
    servedHistory,
    services,
    packages,
    categories,
    saleEvents,
  } = data;
  const { getUserLeaveRequests } =
    await import("@/features/workforce/queries/leave-request");
  const leaveRequestsResult = await getUserLeaveRequests(employee.id);
  const leaveRequests = leaveRequestsResult.success
    ? leaveRequestsResult.data || []
    : [];

  return employeeProfile === StaffProfile.MANAGER ? (
    <ManagerDashboard
      businessName={business.name}
      businessSlug={businessSlug}
      businessId={business.id}
      currentEmployeeSpecialties={employee.specialties ?? []}
      currentEmployeeId={employee.id}
      currentEmployeeCommission={employee.commission_percentage}
      todayAttendance={todayAttendance}
      capabilities={capabilities}
      managerQueueServices={managerQueueServices}
      managerQueueEmployees={managerQueueEmployees}
      pendingServices={pendingServices}
      servedHistory={servedHistory}
      todayBookings={todayBookings}
      managerBookings={managerBookings}
      services={services}
      packages={packages}
      categories={categories}
      saleEvents={saleEvents}
      leaveRequests={leaveRequests}
    />
  ) : (
    <EmployeeDashboard
      businessName={business.name}
      businessSlug={businessSlug}
      businessId={business.id}
      currentEmployeeName={employee.user.name}
      activeServices={activeServices}
      completedServices={completedServices}
      pendingServices={pendingServices}
      managerQueueServices={managerQueueServices}
      managerQueueEmployees={managerQueueEmployees}
      currentEmployeeSpecialties={employee.specialties ?? []}
      currentEmployeeId={employee.id}
      currentEmployeeCommission={employee.commission_percentage}
      currentEmployeeSalary={totalEstimatedSalary}
      employeeProfile={employeeProfile}
      capabilities={capabilities}
      todayAttendance={todayAttendance}
      todayBookings={todayBookings}
      services={services}
      packages={packages}
      categories={categories}
      saleEvents={saleEvents}
      leaveRequests={leaveRequests}
    />
  );
}
