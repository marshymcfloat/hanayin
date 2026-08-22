"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";

import EmployeeServedHistory from "./EmployeeServedHistory";
import PendingServicesList from "./PendingServicesList";
import EmployeePaymentsQueue, {
  type EmployeePaymentBooking,
} from "./EmployeePaymentsQueue";
import { MyBookingsList } from "./MyBookingsList";
import AttendanceCard from "./AttendanceCard";
import { BookingDialog } from "../owner/BookingDialog";
import { GiftCardClaimDialog } from "../shared/GiftCardClaimDialog";
import ManagerQueueBoard, {
  type ManagerQueueEmployee,
  type ManagerQueueService,
} from "../manager/ManagerQueueBoard";
import { EmployeeLeaveClient } from "../attendance/EmployeeLeaveClient";
import { RequestLeaveDialog } from "../attendance/RequestLeaveDialog";
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

import { EmployeePortalShell } from "./portal/EmployeePortalShell";
import { GreetingStrip } from "./portal/GreetingStrip";
import { HeroKpiGrid } from "./portal/HeroKpiGrid";
import { AccountDropdown } from "./portal/AccountDropdown";
import {
  PortalCard,
  PortalCardBody,
  PortalCardHeader,
} from "./portal/PortalCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  CalendarPlus,
  Clock,
  Loader2,
  RefreshCcw,
  Wallet,
} from "lucide-react";

function WorkspaceRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-11 rounded-full"
      aria-label={pending ? "Refreshing service work" : "Refresh service work"}
      title={pending ? "Refreshing service work" : "Refresh service work"}
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
    </Button>
  );
}

type BookingWithDetails = Booking & {
  customer: Customer | null;
  vouchers: Voucher[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: (Employee & { user: User }) | null;
    served_by_owner: (Owner & { user: User }) | null;
  })[];
};

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
  /**
   * SOCIAL_POST_REQUEST_CREATE — when true the dashboard exposes
   * navigation to /social-posts/my-requests in the account dropdown.
   * Important for STAFF / CASHIER profiles since they're in the
   * frontdesk shell (no sidebar) and otherwise have no way to reach
   * the request workflow that an owner has granted them.
   */
  canSubmitSocialPost: boolean;
  /**
   * The four booking-modification permissions. Currently the
   * dashboard relies on BookingQuickPanel to resolve these from
   * viewer-context and gate the in-panel actions itself, so these
   * flags are NOT consumed today. They're plumbed through anyway so
   * future dashboard-level gating (e.g. an "Adjust today's prices"
   * shortcut) can read them without a duplicate permission lookup.
   */
  canModifyBooking: boolean;
  canCancelBooking: boolean;
  canMarkNoShow: boolean;
  canAdjustBookingPrice: boolean;
};

export default function EmployeeDashboard({
  businessName,
  businessSlug,
  businessId,
  servedHistory,
  pendingServices,
  managerQueueServices,
  managerQueueEmployees,
  currentEmployeeName,
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
  /**
   * Display name of the signed-in employee, sourced from
   * `employee.user.name`. Drives the personalized greeting in the
   * GreetingStrip ("Good morning, Daniel."). Optional so legacy
   * call sites that haven't updated still render a graceful fallback.
   */
  currentEmployeeName?: string | null;
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

  const unsettledPaymentCount = useMemo(
    () =>
      visibleTodayBookings.filter(
        (booking) =>
          (booking.status === "ACCEPTED" || booking.status === "COMPLETED") &&
          booking.payment_status !== "PAID",
      ).length,
    [visibleTodayBookings],
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

  const roleLabel =
    employeeProfile === StaffProfile.MANAGER
      ? "Manager Portal"
      : employeeProfile === StaffProfile.CASHIER
        ? "Cashier Portal"
        : "Employee Portal";

  const showQueueSection = capabilities.canClaimQueue;
  const showServedSection = capabilities.canServeQueue;
  const showPaymentsSection = capabilities.canCollectPayment;
  const greetingActions = (
    <>
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
      <AccountDropdown
        businessSlug={businessSlug}
        canSubmitSocialPost={capabilities.canSubmitSocialPost}
      />
    </>
  );

  return (
    <EmployeePortalShell
      greeting={
        <GreetingStrip
          name={currentEmployeeName}
          roleLabel={roleLabel}
          subline={businessName ?? undefined}
          salaryEstimate={currentEmployeeSalary}
          actions={greetingActions}
        />
      }
      heroKpi={
        <HeroKpiGrid
          salaryEstimate={currentEmployeeSalary}
          servedToday={servedTodayCount}
          queuePending={visiblePendingServices.length}
        />
      }
    >
      <PortalCard className="md:col-span-2 xl:col-span-12">
        <PortalCardHeader
          eyebrow="Today"
          title="My day"
          icon={Clock}
          count={leaveRequests.length || undefined}
          action={
            <RequestLeaveDialog
              employeeId={currentEmployeeId}
              businessId={businessId}
              businessSlug={businessSlug}
              leavesThisMonth={leaveRequests.length}
              trigger={<Button type="button" variant="outline" className="h-9 rounded-lg px-2.5 text-xs font-medium shadow-none"><CalendarPlus className="mr-1.5 size-3.5" />Request leave</Button>}
            />
          }
        />
        <PortalCardBody>
          <div className={leaveRequests.length > 0 ? "grid gap-4 lg:grid-cols-2 lg:divide-x lg:divide-border" : "grid"}>
            <section aria-labelledby="attendance-heading">
              <h3 id="attendance-heading" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attendance</h3>
              <AttendanceCard employeeId={currentEmployeeId} businessSlug={businessSlug} todayAttendance={todayAttendance ?? null} compact />
            </section>
            {leaveRequests.length > 0 ? <section aria-labelledby="leave-heading" className="lg:pl-6">
              <h3 id="leave-heading" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leave requests</h3>
              <EmployeeLeaveClient employeeId={currentEmployeeId} businessId={businessId} businessSlug={businessSlug} requests={leaveRequests} compact showRequestAction={false} />
            </section> : null}
          </div>
        </PortalCardBody>
      </PortalCard>

      <PortalCard className="max-h-[34rem] overflow-hidden md:col-span-2 xl:col-span-12">
        <PortalCardHeader eyebrow="Operations" title="Service work" icon={Briefcase} count={myBookings.length + visiblePendingServices.length} action={<WorkspaceRefreshButton />} />
        <PortalCardBody className="min-h-0 overflow-hidden">
          <Tabs defaultValue="upcoming">
            <TabsList className="grid h-9 w-full grid-cols-3 rounded-lg p-0.5">
              <TabsTrigger value="upcoming" className="h-8 min-h-0 rounded-md py-0 text-xs shadow-none data-[state=active]:shadow-sm">Upcoming</TabsTrigger>
              <TabsTrigger value="available" className="h-8 min-h-0 rounded-md py-0 text-xs shadow-none data-[state=active]:shadow-sm">Available</TabsTrigger>
              <TabsTrigger value="history" className="h-8 min-h-0 rounded-md py-0 text-xs shadow-none data-[state=active]:shadow-sm">History</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming" className="mt-2 max-h-[24rem] overflow-x-hidden overflow-y-auto overscroll-contain pr-1 sm:max-h-[27rem]">
              <MyBookingsList bookings={myBookings} servicesCatalog={services.map((service) => ({ id: service.id, name: service.name, category: service.category, price: service.price, duration: service.duration }))} />
            </TabsContent>
            <TabsContent value="available" className="mt-2 max-h-[24rem] overflow-x-hidden overflow-y-auto overscroll-contain pr-1 sm:max-h-[27rem]">
              {showQueueSection ? <PendingServicesList services={visiblePendingServices} businessSlug={businessSlug} currentEmployeeId={currentEmployeeId} employeeSpecialties={currentEmployeeSpecialties} saleEvents={saleEvents} canClaimServices={capabilities.canClaimQueue} showRefresh={false} /> : <p className="py-10 text-center text-sm text-muted-foreground">Your profile cannot claim available services.</p>}
            </TabsContent>
            <TabsContent value="history" className="mt-2 max-h-[24rem] overflow-x-hidden overflow-y-auto overscroll-contain pr-1 sm:max-h-[27rem]">
              {showServedSection ? <EmployeeServedHistory services={visibleServedHistory} employeeSpecialties={currentEmployeeSpecialties} currentEmployeeId={currentEmployeeId} currentEmployeeCommission={currentEmployeeCommission} /> : <p className="py-10 text-center text-sm text-muted-foreground">No service history is available for this profile.</p>}
            </TabsContent>
          </Tabs>
        </PortalCardBody>
      </PortalCard>

      {showPaymentsSection && unsettledPaymentCount > 0 ? (
        <PortalCard className="md:col-span-2 xl:col-span-12">
          <PortalCardHeader eyebrow="Payments" title="Collect balances" count={unsettledPaymentCount} icon={Wallet} />
          <PortalCardBody><EmployeePaymentsQueue businessSlug={businessSlug} bookings={visibleTodayBookings} employeeSpecialties={currentEmployeeSpecialties} /></PortalCardBody>
        </PortalCard>
      ) : null}

      {capabilities.canQueueOverride && employeeProfile !== StaffProfile.MANAGER ? (
        <PortalCard className="md:col-span-2 xl:col-span-12">
          <PortalCardHeader
            eyebrow="Override"
            title="Floor queue"
          />
          <PortalCardBody>
            <ManagerQueueBoard
              businessSlug={businessSlug}
              initialServices={managerQueueServices}
              initialEmployees={managerQueueEmployees}
            />
          </PortalCardBody>
        </PortalCard>
      ) : null}
    </EmployeePortalShell>
  );
}
