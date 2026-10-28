"use client";

import { useCallback, useMemo, useState } from "react";
import {
  LogOut,
  ShieldCheck,
  User as UserIcon,
  ListTodo,
  CalendarCheck,
  Activity,
  MessageSquarePlus,
} from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
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
import { StatPill } from "@/components/dashboard/shared/StatPill";
import staffTheme from "@/components/dashboard/employee/StaffWorkspaceTheme.module.css";
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
import { useStaffServiceWork } from "@/components/dashboard/employee/useStaffServiceWork";
import type { EmployeeServiceWorkData, EmployeeServiceWorkItem } from "@/components/dashboard/employee/service-work-state";
import { claimServiceAction, markServiceServedAction, unclaimServiceAction, unserveServiceAction } from "@/features/dashboard/actions";
import { getApplicableDiscount } from "@/lib/utils/pricing";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type EmployeeDashboardCapabilities,
  type TodayAttendance,
} from "@/components/dashboard/employee/EmployeeDashboard";
import ManagerQueueBoard, {
  type ManagerQueueEmployee,
  type ManagerQueueService,
} from "@/components/dashboard/manager/ManagerQueueBoard";
import { useManagerServiceCoordinator } from "@/components/dashboard/manager/useManagerServiceCoordinator";
import { ManagerBookingsDialog } from "@/components/dashboard/manager/ManagerBookingsDialog";
import { EmployeeLeaveClient } from "@/components/dashboard/attendance/EmployeeLeaveClient";
import type { PackageWithItems } from "@/components/bookings/BookingForm";
import type { SaleEventForPricing } from "@/lib/utils/pricing";
import {
  getEmployeeSpecialtySet,
  hasAnyAllowedCategoryForEmployee,
  isCategoryAllowedForEmployee,
} from "@/lib/utils/employee-specialties";
import type {
  AvailedService,
  Booking,
  Customer,
  LeaveRequest,
  Service,
  Voucher,
} from "@/prisma/generated/prisma/client";

type BookingWithDetails = Booking & {
  customer: Customer | null;
  vouchers: Voucher[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: { id: number; user: { name: string } } | null;
    served_by_owner: { id: number; user: { name: string } } | null;
  })[];
};

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
  managerBookings,
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
  /**
   * Today's bookings as full BookingWithDetails — used by the
   * ManagerBookingsDialog so the manager can open BookingQuickPanel
   * from their dashboard. Distinct from todayBookings, which is the
   * narrow shape consumed by EmployeePaymentsQueue.
   */
  managerBookings: BookingWithDetails[];
  services: Service[];
  packages: PackageWithItems[];
  categories: string[];
  saleEvents: SaleEventForPricing[];
  leaveRequests: LeaveRequest[];
}) {
  const [boardServices, setBoardServices] = useState(managerQueueServices);
  const onBoardServicesChange = useCallback((next: ManagerQueueService[]) => setBoardServices(next), []);
  const initialServiceWork = useMemo<EmployeeServiceWorkData>(() => ({
    pending: pendingServices,
    active: servedHistory.filter((item) => item.status === "CLAIMED" || item.status === "SERVING"),
    completed: servedHistory.filter((item) => item.status === "COMPLETED"),
  }), [pendingServices, servedHistory]);
  const managerCoordinator = useManagerServiceCoordinator({
    businessSlug,
    employeeId: currentEmployeeId,
    initialOwn: initialServiceWork,
    initialBoard: { services: managerQueueServices, employees: managerQueueEmployees },
  });
  const { serviceWork, pendingActionIds, runServiceWorkAction } = useStaffServiceWork({
    businessSlug,
    employeeId: currentEmployeeId,
    initialData: initialServiceWork,
    managerCoordinator,
  });

  const handleClaim = async (service: EmployeeServiceWorkItem) => {
    const discount = getApplicableDiscount(service.service.id, service.package_id ?? undefined, service.price, saleEvents);
    await runServiceWorkAction({
      service,
      transition: "claim",
      execute: () => claimServiceAction(service.id, currentEmployeeId),
      errorTitle: "Unable to claim service",
      patch: {
        final_price: discount?.finalPrice ?? service.price,
        discount: discount?.discount ?? 0,
        discount_reason: discount?.reason ?? null,
      },
    });
  };
  const handleComplete = (service: EmployeeServiceWorkItem) => runServiceWorkAction({
    service, transition: "complete", execute: () => markServiceServedAction(service.id, currentEmployeeId),
    errorTitle: "Unable to mark service as served",
  });
  const handleUnclaim = (service: EmployeeServiceWorkItem) => runServiceWorkAction({
    service, transition: "unclaim", execute: () => unclaimServiceAction(service.id),
    errorTitle: "Unable to unclaim service",
    patch: { final_price: service.price, discount: 0, discount_reason: null },
  });
  const handleUnserve = (service: EmployeeServiceWorkItem) => runServiceWorkAction({
    service, transition: "unserve", execute: () => unserveServiceAction(service.id),
    errorTitle: "Unable to undo completed service",
  });
  const employeeSpecialtySet = useMemo(
    () => getEmployeeSpecialtySet(currentEmployeeSpecialties),
    [currentEmployeeSpecialties],
  );

  const visiblePendingServices = useMemo(
    () =>
      serviceWork.pending.filter((item) =>
        isCategoryAllowedForEmployee(item.service.category, employeeSpecialtySet),
      ),
    [serviceWork.pending, employeeSpecialtySet],
  );

  const visibleActiveServices = useMemo(
    () =>
      serviceWork.active.filter((item) =>
        isCategoryAllowedForEmployee(item.service.category, employeeSpecialtySet),
      ),
    [serviceWork.active, employeeSpecialtySet],
  );
  const visibleServedHistory = useMemo(
    () => serviceWork.completed.filter((item) =>
      isCategoryAllowedForEmployee(item.service.category, employeeSpecialtySet),
    ),
    [serviceWork.completed, employeeSpecialtySet],
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
    return boardServices.reduce(
      (summary, service) => {
        if (service.status === "PENDING") summary.pending += 1;
        if (service.status === "CLAIMED" || service.status === "SERVING") {
          summary.active += 1;
        }
        return summary;
      },
      { pending: 0, active: 0 },
    );
  }, [boardServices]);

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

  return (
    <div className="min-h-full bg-[#F5F6F3] pb-10 text-[#20211F]">

      {/* ── Top Bar ─────────────────────────── */}
      <header className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 pb-5 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#696C67]">
              Manager workspace
            </p>
            <h1 className="mt-1 truncate text-3xl font-bold tracking-[-0.04em] text-[#20211F] sm:text-4xl">
              Floor operations
            </h1>
            <p className="mt-1 truncate text-sm text-[#696C67]">
              {businessName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ManagerBookingsDialog
            bookings={managerBookings}
            servicesCatalog={services.map((s) => ({
              id: s.id,
              name: s.name,
              category: s.category,
              price: s.price,
              duration: s.duration,
            }))}
          />
          {capabilities.canCreateBooking ? (
            <BookingDialog
              presentation="staff"
              services={services}
              packages={packages}
              categories={categories}
              businessSlug={businessSlug}
              allowServiceClaim={capabilities.canClaimQueue}
            />
          ) : null}
          <GiftCardClaimDialog businessSlug={businessSlug} presentation="staff" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 rounded-full border border-[#E7E9E4] bg-white p-0 text-[#20211F] hover:bg-[#EFF9E8] focus-visible:ring-[#72CF35]"
                aria-label="Account menu"
              >
                <Avatar className="size-10">
                  <AvatarFallback className="bg-[#20211F] text-xs font-medium text-white">
                    <UserIcon className="h-3.5 w-3.5" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={`${staffTheme.workspace} w-56 rounded-2xl border-[#E7E9E4] bg-white p-1.5 text-[#20211F] shadow-[0_18px_45px_rgba(32,33,31,0.15)]`}>
              <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#696C67]">My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* Manager has full sidebar nav so we don't duplicate
                  Bookings / Services / etc. here. The one entry that
                  is NOT in the sidebar is the manager's *own*
                  submitted post requests — sidebar's "Social Posts"
                  links to the team inbox, which is a different
                  destination. */}
              {capabilities.canSubmitSocialPost ? (
                <DropdownMenuItem asChild className="min-h-11 cursor-pointer rounded-lg focus:bg-[#EFF9E8]">
                  <Link
                    href={`/app/${businessSlug}/social-posts/my-requests`}
                  >
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    My post requests
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: "/" })}
                className="min-h-11 cursor-pointer rounded-lg text-[#C74248] focus:bg-[#FFF0F0] focus:text-[#C74248]"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Work summary ── */}
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
          <StatPill icon={ListTodo} label="Pending Queue" value={queueSummary.pending} accent />
          <StatPill icon={Activity} label="Active Queue" value={queueSummary.active} />
          <StatPill icon={CalendarCheck} label="Unsettled" value={unsettledBookings} />
          <StatPill icon={UserIcon} label="Served Today" value={servedTodayCount} />
        </div>
      </div>

      {/* ── Operational workspaces ─────────────── */}
      <div className="mx-auto w-full max-w-[1440px] px-4 pt-5 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 lg:gap-5 xl:grid-cols-12">

          {/* ── LEFT: Attendance + Leave ─── */}
          <div className="flex min-w-0 flex-col gap-4 lg:gap-5 xl:col-span-4">
            <section className="rounded-[28px] border border-[#E7E9E4] bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:p-6">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#696C67]">Today&apos;s shift</p>
              <AttendanceCard
                employeeId={currentEmployeeId}
                businessSlug={businessSlug}
                todayAttendance={todayAttendance ?? null}
              />
            </section>
            <section className="rounded-[28px] border border-[#E7E9E4] bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:p-6">
              <EmployeeLeaveClient
                employeeId={currentEmployeeId}
                businessId={businessId}
                businessSlug={businessSlug}
                requests={leaveRequests}
              />
            </section>
          </div>

          {/* ── CENTER: Team Queue Board ─── */}
          <section className="flex min-w-0 flex-col overflow-hidden rounded-[28px] border border-[#E7E9E4] bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)] xl:col-span-8">
            <div className="flex items-center gap-3 border-b border-[#E7E9E4] px-5 py-5 sm:px-6">
              <span className="grid size-10 place-items-center rounded-[14px] bg-[#B9F379] text-[#20211F]"><ShieldCheck className="size-4" aria-hidden="true" /></span>
              <p className="text-base font-bold tracking-[-0.025em] text-[#20211F]">
                Team Queue Control
              </p>
            </div>

            <div className="min-h-[20rem] p-4 sm:p-6">
              {capabilities.canQueueOverride ? (
                <ManagerQueueBoard
                  managerCoordinator={managerCoordinator}
                  businessSlug={businessSlug}
                  currentEmployeeId={currentEmployeeId}
                  initialServices={managerQueueServices}
                  initialEmployees={managerQueueEmployees}
                  onBoardServicesChange={onBoardServicesChange}
                />
              ) : (
                <div className="flex min-h-[20rem] items-center justify-center">
                  <p className="text-center text-sm text-[#696C67]">
                    Queue override is not enabled for your profile.
                  </p>
                </div>
              )}
            </div>

            {/* Payments queue (cashier capability) */}
            {capabilities.canCollectPayment ? (
              <div className="border-t border-[#E7E9E4] p-4 sm:p-6">
                <EmployeePaymentsQueue
                  businessSlug={businessSlug}
                  bookings={visibleTodayBookings}
                  employeeSpecialties={currentEmployeeSpecialties}
                />
              </div>
            ) : null}
          </section>

          {/* ── RIGHT: My Queue + Served History ── */}
          <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:gap-5 xl:col-span-12">

            {/* My Claimable Queue */}
            <section className="flex min-h-[18rem] min-w-0 flex-col overflow-hidden rounded-[28px] border border-[#E7E9E4] bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)]">
              <div className="flex items-center justify-between border-b border-[#E7E9E4] px-5 py-4 sm:px-6">
                <h2 className="text-base font-bold tracking-[-0.025em] text-[#20211F]">
                  My Queue
                </h2>
                <span className="rounded-full bg-[#EFF9E8] px-2.5 py-1 text-[10px] font-bold tabular-nums text-[#20211F]">
                  {visiblePendingServices.length}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {capabilities.canClaimQueue ? (
                  <PendingServicesList
                    services={visiblePendingServices}
                    businessSlug={businessSlug}
                    currentEmployeeId={currentEmployeeId}
                    employeeSpecialties={currentEmployeeSpecialties}
                    saleEvents={saleEvents}
                    canClaimServices={capabilities.canClaimQueue}
                    showRefresh={false}
                    onClaim={handleClaim}
                    pendingActionIds={pendingActionIds}
                  />
                ) : (
                  <div className="px-5 py-6">
                    <p className="text-sm text-[#696C67]">
                      Queue claiming is disabled for your manager policy.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* My Served History */}
            <section className="flex min-h-[18rem] min-w-0 flex-col overflow-hidden rounded-[28px] border border-[#E7E9E4] bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)]">
              <div className="flex items-center justify-between border-b border-[#E7E9E4] px-5 py-4 sm:px-6">
                <h2 className="text-base font-bold tracking-[-0.025em] text-[#20211F]">
                  My Services
                </h2>
                <span className="rounded-full bg-[#EFF9E8] px-2.5 py-1 text-[10px] font-bold tabular-nums text-[#20211F]">
                  {visibleActiveServices.length + visibleServedHistory.length}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {capabilities.canServeQueue ? (
                  <Tabs defaultValue="active" className="px-3 pb-3">
                    <TabsList className="grid min-h-11 w-full grid-cols-2 rounded-xl bg-[#F5F6F3] p-1">
                      <TabsTrigger value="active" className="min-h-11 rounded-lg text-xs">In progress</TabsTrigger>
                      <TabsTrigger value="history" className="min-h-11 rounded-lg text-xs">History</TabsTrigger>
                    </TabsList>
                    <TabsContent value="active" className="mt-2 max-h-[24rem] overflow-y-auto">
                      <EmployeeServedHistory
                        mode="active"
                        services={visibleActiveServices}
                        employeeSpecialties={currentEmployeeSpecialties}
                        currentEmployeeCommission={currentEmployeeCommission}
                        onMarkServed={handleComplete}
                        onUnclaim={handleUnclaim}
                        onUnserve={handleUnserve}
                        pendingActionIds={pendingActionIds}
                      />
                    </TabsContent>
                    <TabsContent value="history" className="mt-2 max-h-[24rem] overflow-y-auto">
                      <EmployeeServedHistory
                        mode="history"
                        services={visibleServedHistory}
                        employeeSpecialties={currentEmployeeSpecialties}
                        currentEmployeeCommission={currentEmployeeCommission}
                        onMarkServed={handleComplete}
                        onUnclaim={handleUnclaim}
                        onUnserve={handleUnserve}
                        pendingActionIds={pendingActionIds}
                      />
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="px-5 py-6">
                    <p className="text-sm text-[#696C67]">
                      Service completion actions are disabled for your manager policy.
                    </p>
                  </div>
                )}
              </div>
            </section>

          </div>

        </div>
      </div>
    </div>
  );
}
