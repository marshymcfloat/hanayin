"use client";

import { useMemo } from "react";
import { LogOut, ShieldCheck, User as UserIcon, Wallet, Users } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BookingDialog } from "@/components/dashboard/owner/BookingDialog";
import { GiftCardClaimDialog } from "@/components/dashboard/shared/GiftCardClaimDialog";
import AttendanceCard from "@/components/dashboard/employee/AttendanceCard";
import EmployeePaymentsQueue, {
  type EmployeePaymentBooking,
} from "@/components/dashboard/employee/EmployeePaymentsQueue";
import PendingServicesList, {
  type PendingService,
} from "@/components/dashboard/employee/PendingServicesList";
import EmployeeServedHistory, {
  type ServedService,
} from "@/components/dashboard/employee/EmployeeServedHistory";
import {
  type EmployeeDashboardCapabilities,
  type TodayAttendance,
} from "@/components/dashboard/employee/EmployeeDashboard";
import ManagerQueueBoard, {
  type ManagerQueueEmployee,
  type ManagerQueueService,
} from "@/components/dashboard/manager/ManagerQueueBoard";
import { EmployeeLeaveClient } from "@/components/dashboard/attendance/EmployeeLeaveClient";
import type { PackageWithItems } from "@/components/bookings/BookingForm";
import type { SaleEventForPricing } from "@/lib/utils/pricing";
import {
  getEmployeeSpecialtySet,
  hasAnyAllowedCategoryForEmployee,
  isCategoryAllowedForEmployee,
} from "@/lib/utils/employee-specialties";
import type { LeaveRequest, Service } from "@/prisma/generated/prisma/client";

export default function ManagerDashboard({
  businessName,
  businessSlug,
  businessId,
  currentEmployeeId,
  currentEmployeeSpecialties,
  currentEmployeeCommission,
  todayAttendance,
  capabilities,
  managerQueueServices,
  managerQueueEmployees,
  pendingServices,
  servedHistory,
  todayBookings,
  services,
  packages,
  categories,
  saleEvents,
  leaveRequests,
}: {
  businessName: string | null;
  businessSlug: string;
  businessId: string;
  currentEmployeeId: number;
  currentEmployeeSpecialties: string[];
  currentEmployeeCommission: number;
  todayAttendance: TodayAttendance;
  capabilities: EmployeeDashboardCapabilities;
  managerQueueServices: ManagerQueueService[];
  managerQueueEmployees: ManagerQueueEmployee[];
  pendingServices: PendingService[];
  servedHistory: ServedService[];
  todayBookings: EmployeePaymentBooking[];
  services: Service[];
  packages: PackageWithItems[];
  categories: string[];
  saleEvents: SaleEventForPricing[];
  leaveRequests: LeaveRequest[];
}) {
  const employeeSpecialtySet = useMemo(
    () => getEmployeeSpecialtySet(currentEmployeeSpecialties),
    [currentEmployeeSpecialties],
  );

  const visiblePendingServices = useMemo(
    () =>
      pendingServices.filter((item) =>
        isCategoryAllowedForEmployee(item.service.category, employeeSpecialtySet),
      ),
    [pendingServices, employeeSpecialtySet],
  );

  const visibleServedHistory = useMemo(
    () =>
      servedHistory.filter((item) =>
        isCategoryAllowedForEmployee(item.service.category, employeeSpecialtySet),
      ),
    [servedHistory, employeeSpecialtySet],
  );

  const visibleTodayBookings = useMemo(
    () =>
      todayBookings.filter((booking) =>
        hasAnyAllowedCategoryForEmployee(
          booking.availed_services.map((item) => item.service.category),
          employeeSpecialtySet,
        ),
      ),
    [todayBookings, employeeSpecialtySet],
  );

  const queueSummary = useMemo(() => {
    return managerQueueServices.reduce(
      (summary, service) => {
        if (service.status === "PENDING") summary.pending += 1;
        if (service.status === "CLAIMED" || service.status === "SERVING") {
          summary.active += 1;
        }
        return summary;
      },
      { pending: 0, active: 0 },
    );
  }, [managerQueueServices]);

  const unsettledBookings = useMemo(
    () =>
      visibleTodayBookings.filter((booking) => booking.payment_status !== "PAID")
        .length,
    [visibleTodayBookings],
  );

  const servedTodayCount = useMemo(() => {
    const today = new Date();
    return visibleServedHistory.filter((item) => {
      const date = new Date(item.updated_at);
      return (
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
      );
    }).length;
  }, [visibleServedHistory]);

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
  };

  return (
    <main className="min-h-screen bg-slate-50/50 pb-24 md:pb-12 font-sans">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-4 py-3 flex items-center justify-between md:px-8 md:py-4 shadow-[0_2px_20px_-12px_rgba(0,0,0,0.1)] transition-all duration-300">
        <div className="flex flex-col">
          <h1 className="font-bold text-lg leading-none md:text-xl text-slate-900 tracking-tight">
            {businessName}
          </h1>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-indigo-500 mt-1">
            Manager Operations
          </p>
        </div>

        <div className="flex items-center gap-3">
          {capabilities.canCreateBooking ? (
            <BookingDialog
              services={services}
              packages={packages}
              categories={categories}
              businessSlug={businessSlug}
              allowServiceClaim={capabilities.canClaimQueue}
            />
          ) : null}
          <GiftCardClaimDialog businessSlug={businessSlug} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full ring-2 ring-slate-100 hover:bg-slate-100 transition-all"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-slate-900 text-white text-xs font-medium">
                    <UserIcon className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 rounded-xl shadow-xl border-slate-100"
            >
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer rounded-lg"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="px-4 py-6 md:px-8 max-w-7xl mx-auto space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
          <div className="md:col-span-5 lg:col-span-4 order-1">
            <AttendanceCard
              employeeId={currentEmployeeId}
              businessSlug={businessSlug}
              todayAttendance={todayAttendance ?? null}
              className="h-full shadow-lg shadow-slate-200/50 border-0"
            />
          </div>

          <div className="md:col-span-7 lg:col-span-8 order-2 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                Pending Queue
              </span>
              <p className="mt-3 text-2xl font-bold text-slate-900">
                {queueSummary.pending}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                Active Queue
              </span>
              <p className="mt-3 text-2xl font-bold text-slate-900">
                {queueSummary.active}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                Unsettled
              </span>
              <p className="mt-3 text-2xl font-bold text-slate-900">
                {unsettledBookings}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                Served Today
              </span>
              <p className="mt-3 text-2xl font-bold text-slate-900">
                {servedTodayCount}
              </p>
            </div>
          </div>
        </section>

        {capabilities.canQueueOverride ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">
                Team Queue Control
              </h2>
            </div>
            <ManagerQueueBoard
              businessSlug={businessSlug}
              initialServices={managerQueueServices}
              initialEmployees={managerQueueEmployees}
            />
          </section>
        ) : (
          <section className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
            Manager queue overrides are not enabled for your profile.
          </section>
        )}

        {capabilities.canCollectPayment ? (
          <section>
            <EmployeePaymentsQueue
              businessSlug={businessSlug}
              bookings={visibleTodayBookings}
              employeeSpecialties={currentEmployeeSpecialties}
            />
          </section>
        ) : null}

        {capabilities.canClaimQueue || capabilities.canServeQueue ? (
          <section className="grid grid-cols-1 xl:grid-cols-12 gap-8 md:gap-10">
            <div className="xl:col-span-7 space-y-5">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-600" />
                <h3 className="text-lg font-bold text-slate-900">
                  My Claimable Queue
                </h3>
              </div>
              {capabilities.canClaimQueue ? (
                <PendingServicesList
                  services={visiblePendingServices}
                  businessSlug={businessSlug}
                  currentEmployeeId={currentEmployeeId}
                  employeeSpecialties={currentEmployeeSpecialties}
                  saleEvents={saleEvents}
                  canClaimServices={capabilities.canClaimQueue}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
                  Queue claiming is disabled for your current manager policy.
                </div>
              )}
            </div>

            <div className="xl:col-span-5 space-y-5">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-slate-600" />
                <h3 className="text-lg font-bold text-slate-900">
                  My Served History
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  {visibleServedHistory.length}
                </Badge>
              </div>
              {capabilities.canServeQueue ? (
                <EmployeeServedHistory
                  services={visibleServedHistory}
                  employeeSpecialties={currentEmployeeSpecialties}
                  currentEmployeeId={currentEmployeeId}
                  currentEmployeeCommission={currentEmployeeCommission}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
                  Service completion actions are disabled for your manager policy.
                </div>
              )}
            </div>
          </section>
        ) : null}

        <section>
          <EmployeeLeaveClient
            employeeId={currentEmployeeId}
            businessId={businessId}
            businessSlug={businessSlug}
            requests={leaveRequests}
          />
        </section>
      </div>
    </main>
  );
}
