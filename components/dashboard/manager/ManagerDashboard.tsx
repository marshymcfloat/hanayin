"use client";

import { useMemo } from "react";
import {
  LogOut,
  ShieldCheck,
  User as UserIcon,
  ListTodo,
  CalendarCheck,
  Activity,
} from "lucide-react";
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
  Employee,
  LeaveRequest,
  Owner,
  Service,
  User,
  Voucher,
} from "@/prisma/generated/prisma/client";

type BookingWithDetails = Booking & {
  customer: Customer | null;
  vouchers: Voucher[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: (Employee & { user: User }) | null;
    served_by_owner: (Owner & { user: User }) | null;
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

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Top Bar ─────────────────────────── */}
      <header className="shrink-0 bg-card border-b border-border px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate leading-none">
              {businessName}
            </p>
            <p className="text-[10px] text-primary font-semibold uppercase tracking-widest mt-0.5">
              Manager Operations
            </p>
          </div>
        </div>

        {/* Stat pills – desktop only, inline in header */}
        <div className="hidden xl:flex items-center gap-2 flex-1 justify-center max-w-2xl">
          <div className="flex items-center gap-1.5 bg-primary/8 rounded-xl px-3 py-1.5">
            <ListTodo className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-bold text-primary tabular-nums">{queueSummary.pending}</span>
            <span className="text-[10px] text-primary/60 font-medium">Pending</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted rounded-xl px-3 py-1.5">
            <Activity className="h-3.5 w-3.5 text-foreground/50" />
            <span className="text-xs font-bold text-foreground tabular-nums">{queueSummary.active}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Active</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted rounded-xl px-3 py-1.5">
            <CalendarCheck className="h-3.5 w-3.5 text-foreground/50" />
            <span className="text-xs font-bold text-foreground tabular-nums">{unsettledBookings}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Unsettled</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted rounded-xl px-3 py-1.5">
            <UserIcon className="h-3.5 w-3.5 text-foreground/50" />
            <span className="text-xs font-bold text-foreground tabular-nums">{servedTodayCount}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Served</span>
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
                className="h-8 w-8 rounded-full ring-1 ring-border hover:bg-muted transition-all"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                    <UserIcon className="h-3.5 w-3.5" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer rounded-lg"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Stat pills — mobile/tablet only ── */}
      <div className="xl:hidden shrink-0 px-4 pt-3 pb-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatPill icon={ListTodo} label="Pending Queue" value={queueSummary.pending} accent />
          <StatPill icon={Activity} label="Active Queue" value={queueSummary.active} />
          <StatPill icon={CalendarCheck} label="Unsettled" value={unsettledBookings} />
          <StatPill icon={UserIcon} label="Served Today" value={servedTodayCount} />
        </div>
      </div>

      {/* ── Main 3-column grid ─────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-0">

          {/* ── LEFT: Attendance + Leave ─── */}
          <div className="lg:col-span-3 flex flex-col border-b lg:border-b-0 lg:border-r border-border overflow-y-auto no-scrollbar">
            <div className="p-4 sm:p-5 border-b border-border">
              <AttendanceCard
                employeeId={currentEmployeeId}
                businessSlug={businessSlug}
                todayAttendance={todayAttendance ?? null}
              />
            </div>
            <div className="p-4 sm:p-5">
              <EmployeeLeaveClient
                employeeId={currentEmployeeId}
                businessId={businessId}
                businessSlug={businessSlug}
                requests={leaveRequests}
              />
            </div>
          </div>

          {/* ── CENTER: Team Queue Board ─── */}
          <div className="lg:col-span-6 flex flex-col border-b lg:border-b-0 lg:border-r border-border overflow-hidden">
            <div className="shrink-0 px-4 sm:px-5 pt-4 pb-2 flex items-center gap-2 border-b border-border">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Team Queue Control
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 sm:p-5">
              {capabilities.canQueueOverride ? (
                <ManagerQueueBoard
                  businessSlug={businessSlug}
                  initialServices={managerQueueServices}
                  initialEmployees={managerQueueEmployees}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground text-center">
                    Queue override is not enabled for your profile.
                  </p>
                </div>
              )}
            </div>

            {/* Payments queue (cashier capability) */}
            {capabilities.canCollectPayment ? (
              <div className="shrink-0 border-t border-border p-4 sm:p-5">
                <EmployeePaymentsQueue
                  businessSlug={businessSlug}
                  bookings={visibleTodayBookings}
                  employeeSpecialties={currentEmployeeSpecialties}
                />
              </div>
            ) : null}
          </div>

          {/* ── RIGHT: My Queue + Served History ── */}
          <div className="lg:col-span-3 flex flex-col overflow-hidden">

            {/* My Claimable Queue */}
            <div className="flex-1 min-h-0 flex flex-col border-b border-border overflow-hidden">
              <div className="shrink-0 px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  My Queue
                </p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
                  {visiblePendingServices.length}
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
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
                  <div className="px-4 py-6">
                    <p className="text-xs text-muted-foreground">
                      Queue claiming is disabled for your manager policy.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* My Served History */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="shrink-0 px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Served History
                </p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
                  {visibleServedHistory.length}
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                {capabilities.canServeQueue ? (
                  <EmployeeServedHistory
                    services={visibleServedHistory}
                    employeeSpecialties={currentEmployeeSpecialties}
                    currentEmployeeId={currentEmployeeId}
                    currentEmployeeCommission={currentEmployeeCommission}
                  />
                ) : (
                  <div className="px-4 py-6">
                    <p className="text-xs text-muted-foreground">
                      Service completion actions are disabled for your manager policy.
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
