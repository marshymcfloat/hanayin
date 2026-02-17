"use client";

import { useMemo } from "react";
import { LogOut, User as UserIcon } from "lucide-react";
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
            {employeeProfile === StaffProfile.MANAGER
              ? "Manager Portal"
              : employeeProfile === StaffProfile.CASHIER
                ? "Cashier Portal"
                : "Employee Portal"}
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

      {/*       <div className="md:hidden fixed bottom-6 right-6 z-50">
        <Button
          asChild
          size="icon"
          className="h-14 w-14 rounded-full shadow-xl shadow-indigo-600/30 bg-indigo-600 hover:bg-indigo-700 text-white transition-transform active:scale-90"
        >
          <Link href={`/${businessSlug}/booking`}>
            <Plus className="h-7 w-7" />
            <span className="sr-only">Add Booking</span>
          </Link>
        </Button>
      </div> */}

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

          <div className="md:col-span-7 lg:col-span-8 order-2 grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-indigo-100 transition-colors">
              <div className="flex items-start justify-between">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Est. Salary
                </span>
                <div className="h-8 w-8 rounded-full bg-green-50 flex items-center justify-center text-green-600 group-hover:scale-110 transition-transform">
                  <span className="text-xs font-bold">₱</span>
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight block">
                  ₱{currentEmployeeSalary.toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 mt-1 block font-medium">
                  This Month
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-blue-100 transition-colors">
              <div className="flex items-start justify-between">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Served
                </span>
                <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                  <UserIcon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight block">
                  {
                    visibleServedHistory.filter((s) => {
                      const today = new Date();
                      const date = new Date(s.updated_at);
                      return (
                        date.getDate() === today.getDate() &&
                        date.getMonth() === today.getMonth() &&
                        date.getFullYear() === today.getFullYear()
                      );
                    }).length
                  }
                </span>
                <span className="text-xs text-slate-400 mt-1 block font-medium">
                  Clients Today
                </span>
              </div>
            </div>

            <div className="col-span-2 lg:col-span-1 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-orange-100 transition-colors">
              <div className="flex items-start justify-between">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Queue
                </span>
                <div className="h-8 w-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
                  <span className="text-xs font-bold font-mono">Q</span>
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight block">
                  {visiblePendingServices.length}
                </span>
                <span className="text-xs text-slate-400 mt-1 block font-medium">
                  Waiting
                </span>
              </div>
            </div>
          </div>
        </section>

        {capabilities.canCollectPayment ? (
          <section>
            <EmployeePaymentsQueue
              businessSlug={businessSlug}
              bookings={visibleTodayBookings}
              employeeSpecialties={currentEmployeeSpecialties}
            />
          </section>
        ) : null}

        {capabilities.canQueueOverride ? (
          <section>
            <ManagerQueueBoard
              businessSlug={businessSlug}
              initialServices={managerQueueServices}
              initialEmployees={managerQueueEmployees}
            />
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

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 md:gap-10">
          <section className="xl:col-span-7 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-900">
                  Current Queue
                </h2>
                <span className="hidden md:inline-flex h-6 items-center rounded-full bg-slate-100 px-2.5 text-xs font-bold text-slate-600">
                  {visiblePendingServices.length}
                </span>
              </div>
            </div>

            {capabilities.canClaimQueue ? (
              <div className="-mx-4 md:mx-0">
                <PendingServicesList
                  services={visiblePendingServices}
                  businessSlug={businessSlug}
                  currentEmployeeId={currentEmployeeId}
                  employeeSpecialties={currentEmployeeSpecialties}
                  saleEvents={saleEvents}
                  canClaimServices={capabilities.canClaimQueue}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
                Queue claiming is disabled for your current profile.
              </div>
            )}
          </section>

          <section className="xl:col-span-5 space-y-5">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">
                Served History
              </h2>
            </div>
            {capabilities.canServeQueue ? (
              <div className="-mx-4 md:mx-0">
                <EmployeeServedHistory
                  services={visibleServedHistory}
                  employeeSpecialties={currentEmployeeSpecialties}
                  currentEmployeeId={currentEmployeeId}
                  currentEmployeeCommission={currentEmployeeCommission}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
                Service completion tracking is disabled for your current profile.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
