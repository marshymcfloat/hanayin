"use client";

import { useMemo } from "react";

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
import {
  Briefcase,
  CalendarCheck,
  Clock,
  ListTodo,
  Wallet,
} from "lucide-react";

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

  // Bento span rules. xl uses a 12-col bento; mobile/md fall back to
  // single/two-col stacks via the tailwind defaults on each card. The
  // queue + served pair share xl row 2 (8/4) when both are present;
  // either alone takes the full 12.
  const queueServedBothPresent = showQueueSection && showServedSection;

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
          actions={greetingActions}
        />
      }
      heroKpi={
        <HeroKpiGrid
          salaryEstimate={currentEmployeeSalary}
          servedToday={servedTodayCount}
          queuePending={visiblePendingServices.length}
          leavesThisMonth={leaveRequests.length}
        />
      }
    >
      {/* ── Attendance ── */}
      <PortalCard className="md:col-span-1 xl:col-span-4">
        <PortalCardHeader
          eyebrow="Today"
          title="Attendance"
          icon={Clock}
        />
        <PortalCardBody>
          <AttendanceCard
            employeeId={currentEmployeeId}
            businessSlug={businessSlug}
            todayAttendance={todayAttendance ?? null}
          />
        </PortalCardBody>
      </PortalCard>

      {/* ── Leaves ── */}
      <PortalCard className="md:col-span-1 xl:col-span-4">
        <PortalCardHeader
          eyebrow="Time off"
          title="Leave requests"
          count={leaveRequests.length}
          icon={CalendarCheck}
        />
        <PortalCardBody>
          <EmployeeLeaveClient
            employeeId={currentEmployeeId}
            businessId={businessId}
            businessSlug={businessSlug}
            requests={leaveRequests}
          />
        </PortalCardBody>
      </PortalCard>

      {/* ── My bookings ── */}
      {myBookings.length > 0 ? (
        <PortalCard className="md:col-span-2 xl:col-span-4">
          <PortalCardHeader
            eyebrow="Up next"
            title="My bookings"
            count={myBookings.length}
            icon={Briefcase}
          />
          <PortalCardBody scrollable className="max-h-[28rem]">
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
          </PortalCardBody>
        </PortalCard>
      ) : null}

      {/* ── Payments queue (cashier) ── */}
      {showPaymentsSection ? (
        <PortalCard
          className={
            "md:col-span-2 " +
            (showQueueSection ? "xl:col-span-4" : "xl:col-span-12")
          }
        >
          <PortalCardHeader
            eyebrow="Cashier"
            title="Payments queue"
            count={visibleTodayBookings.length}
            icon={Wallet}
          />
          <PortalCardBody>
            <EmployeePaymentsQueue
              businessSlug={businessSlug}
              bookings={visibleTodayBookings}
              employeeSpecialties={currentEmployeeSpecialties}
            />
          </PortalCardBody>
        </PortalCard>
      ) : null}

      {/* ── Pending queue ── */}
      {showQueueSection ? (
        <PortalCard
          className={
            "md:col-span-2 " +
            (queueServedBothPresent
              ? "xl:col-span-7"
              : showPaymentsSection
                ? "xl:col-span-8"
                : "xl:col-span-12")
          }
        >
          <PortalCardHeader
            eyebrow="Queue"
            title="Pending services"
            count={visiblePendingServices.length}
            icon={ListTodo}
          />
          <PortalCardBody scrollable className="max-h-[32rem]">
            <PendingServicesList
              services={visiblePendingServices}
              businessSlug={businessSlug}
              currentEmployeeId={currentEmployeeId}
              employeeSpecialties={currentEmployeeSpecialties}
              saleEvents={saleEvents}
              canClaimServices={capabilities.canClaimQueue}
            />
          </PortalCardBody>
        </PortalCard>
      ) : null}

      {/* ── Served history ── */}
      {showServedSection ? (
        <PortalCard
          className={
            "md:col-span-2 " +
            (queueServedBothPresent ? "xl:col-span-5" : "xl:col-span-12")
          }
        >
          <PortalCardHeader
            eyebrow="Served"
            title="Recent history"
            count={visibleServedHistory.length}
            icon={Briefcase}
          />
          <PortalCardBody scrollable className="max-h-[32rem]">
            <EmployeeServedHistory
              services={visibleServedHistory}
              employeeSpecialties={currentEmployeeSpecialties}
              currentEmployeeId={currentEmployeeId}
              currentEmployeeCommission={currentEmployeeCommission}
            />
          </PortalCardBody>
        </PortalCard>
      ) : null}

      {/* No-queue fallback. Spans the whole row when there's no queue or
          served section to render — keeps the bento balanced rather
          than leaving a gap. */}
      {!showQueueSection && !showServedSection && !showPaymentsSection ? (
        <PortalCard className="md:col-span-2 xl:col-span-12">
          <PortalCardBody className="flex items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No queue activity assigned to your profile yet.
            </p>
          </PortalCardBody>
        </PortalCard>
      ) : null}

      {/* Manager queue board — only when QUEUE_OVERRIDE_ALL is granted.
          Rendered inline in the bento (last) rather than the manager
          band so non-manager queue-override users still see it. The
          dedicated ManagerDashboard handles its own band. */}
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
