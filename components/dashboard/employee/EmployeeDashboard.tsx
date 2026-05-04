"use client";

import { useMemo } from "react";
import { PhilippinePeso, User as UserIcon, ListTodo, CalendarCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import EmployeeServedHistory from "./EmployeeServedHistory";
import PendingServicesList from "./PendingServicesList";
import EmployeePaymentsQueue, {
  type EmployeePaymentBooking,
} from "./EmployeePaymentsQueue";
import { MyBookingsList } from "./MyBookingsList";
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
  type AvailedService,
  type Booking,
  type Customer,
  type Employee,
  type LeaveRequest,
  type Owner,
  type Service,
  type User,
  type Voucher,
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
  myBookings,
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
  /**
   * Bookings where the current employee is served_by_id on at least one
   * AvailedService — full BookingWithDetails so MyBookingsList can open
   * the role-aware BookingQuickPanel directly. Empty for managers (they
   * use the parallel ManagerDashboard surface instead).
   */
  myBookings: BookingWithDetails[];
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
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <UserIcon className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-bold text-foreground truncate">
              {businessName}
            </p>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
              {roleLabel}
            </p>
          </div>
        </div>

        {/* Stat pills – desktop only, inline in header */}
        <div className="hidden xl:flex items-center gap-1.5 flex-1 justify-center max-w-xl">
          <div className="flex items-center gap-1.5 bg-primary/10 rounded-lg px-3 py-1.5">
            <PhilippinePeso className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-bold text-primary tabular-nums">{salaryFormatted}</span>
            <span className="text-[10px] text-primary/70 font-medium">Salary</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-1.5">
            <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-bold text-foreground tabular-nums">{servedTodayCount}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Served</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-1.5">
            <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-bold text-foreground tabular-nums">{visiblePendingServices.length}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Queue</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-1.5">
            <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-bold text-foreground tabular-nums">{leaveRequests.length}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Leaves</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
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
                className="h-9 w-9 rounded-full hover:bg-accent transition-colors cursor-pointer"
                aria-label="Account menu"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                    <UserIcon className="h-4 w-4" />
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

      {/* ── Stat strip — mobile/tablet (flat, single bordered surface, hairline-divided) ── */}
      <div className="xl:hidden shrink-0 px-4 pt-3 pb-0">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
            <StatPill icon={PhilippinePeso} label="Salary" value={salaryFormatted} accent flat />
            <StatPill icon={UserIcon} label="Served Today" value={servedTodayCount} flat />
            <StatPill icon={ListTodo} label="Queue" value={visiblePendingServices.length} flat />
            <StatPill icon={CalendarCheck} label="Leaves" value={leaveRequests.length} flat />
          </div>
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

            {/* My Bookings — staff see bookings they're assigned to.
                Empty for cashiers (who don't typically serve services)
                and managers (handled by ManagerDashboard instead). */}
            {myBookings.length > 0 ? (
              <div className="shrink-0 border-b border-border">
                <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    My Bookings
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
                    {myBookings.length}
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto no-scrollbar">
                  <MyBookingsList
                    bookings={myBookings}
                    servicesCatalog={services.map((s) => ({
                      id: s.id,
                      name: s.name,
                      category: s.category,
                      price: s.price,
                      duration: s.duration,
                    }))}
                  />
                </div>
              </div>
            ) : null}

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
