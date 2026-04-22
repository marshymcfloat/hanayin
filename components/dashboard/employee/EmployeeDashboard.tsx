"use client";

import { useMemo } from "react";
import { PhilippinePeso, User as UserIcon, ListTodo, CalendarCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import EmployeeServedHistory from "./EmployeeServedHistory";
import PendingServicesList from "./PendingServicesList";
import EmployeePaymentsQueue, {
  type EmployeePaymentBooking,
} from "./EmployeePaymentsQueue";
import AttendanceCard from "./AttendanceCard";
import { signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BookingDialog } from "../owner/BookingDialog";
import { GiftCardClaimDialog } from "../shared/GiftCardClaimDialog";
import { StatPill } from "../shared/StatPill";
import ManagerQueueBoard, {
  type ManagerQueueEmployee,
  type ManagerQueueService,
} from "../manager/ManagerQueueBoard";
import { EmployeeLeaveClient } from "../attendance/EmployeeLeaveClient";
import {
  type Service,
  type LeaveRequest,
} from "@/prisma/generated/prisma/client";
import { StaffProfile } from "@/prisma/generated/prisma/enums";
import { PackageWithItems } from "@/components/bookings/BookingForm";
import type { ServedService } from "./EmployeeServedHistory";
import type { PendingService } from "./PendingServicesList";
import type { SaleEventForPricing } from "@/lib/utils/pricing";
import {
  getEmployeeSpecialtySet,
  hasAnyAllowedCategoryForEmployee,
  isCategoryAllowedForEmployee,
} from "@/lib/utils/employee-specialties";

export type TodayAttendance = {
  time_in: Date | null;
  time_out: Date | null;
} | null | undefined;

export type EmployeeDashboardCapabilities = {
  canCreateBooking: boolean;
  canCollectPayment: boolean;
  canClaimQueue: boolean;
  canServeQueue: boolean;
  canQueueOverride: boolean;
  canManageCatalog: boolean;
};

export default function EmployeeDashboard({
  businessName,
  businessSlug,
  businessId,
  servedHistory,
  pendingServices,
  managerQueueServices,
  managerQueueEmployees,
  currentEmployeeSpecialties,
  currentEmployeeId,
  currentEmployeeCommission,
  currentEmployeeSalary,
  employeeProfile,
  capabilities,
  todayAttendance,
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
  servedHistory: ServedService[];
  pendingServices: PendingService[];
  managerQueueServices: ManagerQueueService[];
  managerQueueEmployees: ManagerQueueEmployee[];
  currentEmployeeSpecialties: string[];
  currentEmployeeId: number;
  currentEmployeeCommission: number;
  currentEmployeeSalary: number;
  employeeProfile: StaffProfile;
  capabilities: EmployeeDashboardCapabilities;
  todayAttendance: TodayAttendance;
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

  const servedTodayCount = useMemo(() => {
    const today = new Date();
    return visibleServedHistory.filter((s) => {
      const date = new Date(s.updated_at);
      return (
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
      );
    }).length;
  }, [visibleServedHistory]);

  const salaryFormatted =
    currentEmployeeSalary >= 1000
      ? `₱${(currentEmployeeSalary / 1000).toFixed(1)}k`
      : `₱${currentEmployeeSalary}`;

  const roleLabel =
    employeeProfile === StaffProfile.MANAGER
      ? "Manager Portal"
      : employeeProfile === StaffProfile.CASHIER
        ? "Cashier Portal"
        : "Employee Portal";

  const showQueueSection = capabilities.canClaimQueue;
  const showServedSection = capabilities.canServeQueue;

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
              {roleLabel}
            </p>
          </div>
        </div>

        {/* Stat pills – desktop only, inline in header */}
        <div className="hidden xl:flex items-center gap-2 flex-1 justify-center max-w-xl">
          <div className="flex items-center gap-1.5 bg-primary/8 rounded-xl px-3 py-1.5">
            <PhilippinePeso className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-bold text-primary tabular-nums">{salaryFormatted}</span>
            <span className="text-[10px] text-primary/60 font-medium">Salary</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted rounded-xl px-3 py-1.5">
            <UserIcon className="h-3.5 w-3.5 text-foreground/50" />
            <span className="text-xs font-bold text-foreground tabular-nums">{servedTodayCount}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Served</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted rounded-xl px-3 py-1.5">
            <ListTodo className="h-3.5 w-3.5 text-foreground/50" />
            <span className="text-xs font-bold text-foreground tabular-nums">{visiblePendingServices.length}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Queue</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted rounded-xl px-3 py-1.5">
            <CalendarCheck className="h-3.5 w-3.5 text-foreground/50" />
            <span className="text-xs font-bold text-foreground tabular-nums">{leaveRequests.length}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Leaves</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
          <StatPill icon={PhilippinePeso} label="Salary" value={salaryFormatted} accent />
          <StatPill icon={UserIcon} label="Served Today" value={servedTodayCount} />
          <StatPill icon={ListTodo} label="Queue" value={visiblePendingServices.length} />
          <StatPill icon={CalendarCheck} label="Leaves" value={leaveRequests.length} />
        </div>
      </div>

      {/* ── Main 2-column grid ─────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-0">

          {/* ── LEFT: Attendance + Leave ─── */}
          <div className="lg:col-span-4 flex flex-col border-b lg:border-b-0 lg:border-r border-border overflow-y-auto no-scrollbar">
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

          {/* ── RIGHT: Queue + Served + Payments ── */}
          <div className="lg:col-span-8 flex flex-col overflow-hidden">

            {/* Payments queue (cashier only) */}
            {capabilities.canCollectPayment ? (
              <div className="shrink-0 border-b border-border p-4 sm:p-5">
                <EmployeePaymentsQueue
                  businessSlug={businessSlug}
                  bookings={visibleTodayBookings}
                  employeeSpecialties={currentEmployeeSpecialties}
                />
              </div>
            ) : null}

            {/* Manager queue override board */}
            {capabilities.canQueueOverride ? (
              <div className="shrink-0 border-b border-border p-4 sm:p-5">
                <ManagerQueueBoard
                  businessSlug={businessSlug}
                  initialServices={managerQueueServices}
                  initialEmployees={managerQueueEmployees}
                />
              </div>
            ) : null}

            {/* Pending queue + served history */}
            {showQueueSection || showServedSection ? (
              <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-1 xl:grid-cols-12">
                {showQueueSection ? (
                  <div className={`${showServedSection ? "xl:col-span-7" : "xl:col-span-12"} flex flex-col border-b xl:border-b-0 xl:border-r border-border overflow-hidden`}>
                    <div className="shrink-0 px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        Current Queue
                      </p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
                        {visiblePendingServices.length}
                      </span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                      <PendingServicesList
                        services={visiblePendingServices}
                        businessSlug={businessSlug}
                        currentEmployeeId={currentEmployeeId}
                        employeeSpecialties={currentEmployeeSpecialties}
                        saleEvents={saleEvents}
                        canClaimServices={capabilities.canClaimQueue}
                      />
                    </div>
                  </div>
                ) : null}

                {showServedSection ? (
                  <div className={`${showQueueSection ? "xl:col-span-5" : "xl:col-span-12"} flex flex-col overflow-hidden`}>
                    <div className="shrink-0 px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        Served History
                      </p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
                        {visibleServedHistory.length}
                      </span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                      <EmployeeServedHistory
                        services={visibleServedHistory}
                        employeeSpecialties={currentEmployeeSpecialties}
                        currentEmployeeId={currentEmployeeId}
                        currentEmployeeCommission={currentEmployeeCommission}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <p className="text-sm text-muted-foreground">
                  No queue activity assigned to your profile.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
