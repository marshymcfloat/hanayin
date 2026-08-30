"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import EmployeeServedHistory from "./EmployeeServedHistory";
import PendingServicesList from "./PendingServicesList";
import EmployeePaymentsQueue, {
  type EmployeePaymentBooking,
} from "./EmployeePaymentsQueue";
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
  type LeaveRequest,
  type Service,
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
import {
  claimServiceAction,
  getEmployeeServiceWorkAction,
  markServiceServedAction,
  unclaimServiceAction,
  unserveServiceAction,
} from "@/lib/server actions/dashboard";
import { formatPH } from "@/lib/date-utils";
import { getApplicableDiscount } from "@/lib/utils/pricing";
import {
  restoreServiceWorkItem,
  transitionServiceWork,
  type EmployeeServiceWorkData,
  type EmployeeServiceWorkItem,
  type ServiceWorkTransition,
} from "./service-work-state";

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

function WorkspaceRefreshButton({
  pending,
  onRefresh,
}: {
  pending: boolean;
  onRefresh: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-11 rounded-full"
      aria-label={pending ? "Refreshing service work" : "Refresh service work"}
      title={pending ? "Refreshing service work" : "Refresh service work"}
      disabled={pending}
      onClick={onRefresh}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <RefreshCcw className="size-4" />
      )}
    </Button>
  );
}

export type TodayAttendance =
  | {
      time_in: Date | null;
      time_out: Date | null;
    }
  | null
  | undefined;

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
  activeServices,
  completedServices,
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
  services,
  packages,
  categories,
  saleEvents,
  leaveRequests,
}: {
  businessName: string | null;
  businessSlug: string;
  businessId: string;
  activeServices: ServedService[];
  completedServices: ServedService[];
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
  services: Service[];
  packages: PackageWithItems[];
  categories: string[];
  saleEvents: SaleEventForPricing[];
  leaveRequests: LeaveRequest[];
}) {
  const [serviceWorkTab, setServiceWorkTab] = useState("in-progress");
  const [pendingActionIds, setPendingActionIds] = useState<Set<number>>(
    () => new Set(),
  );
  const pendingActionIdsRef = useRef(new Set<number>());
  const queryClient = useQueryClient();
  const serviceWorkQueryKey = [
    "employee-service-work",
    businessSlug,
    currentEmployeeId,
  ] as const;
  const initialServiceWork = useMemo<EmployeeServiceWorkData>(
    () => ({
      pending: pendingServices,
      active: activeServices,
      completed: completedServices,
    }),
    [pendingServices, activeServices, completedServices],
  );
  const {
    data: serviceWork = initialServiceWork,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: serviceWorkQueryKey,
    queryFn: async () => {
      const result = await getEmployeeServiceWorkAction();
      if (!result.success || !("data" in result)) {
        throw new Error(result.error || "Unable to refresh service work.");
      }
      return result.data as EmployeeServiceWorkData;
    },
    initialData: initialServiceWork,
    refetchInterval: pendingActionIds.size > 0 ? false : 5_000,
  });

  const setActionPending = (serviceId: number, pending: boolean) => {
    if (pending) pendingActionIdsRef.current.add(serviceId);
    else pendingActionIdsRef.current.delete(serviceId);
    setPendingActionIds(new Set(pendingActionIdsRef.current));
  };

  const runServiceWorkAction = async ({
    service,
    transition,
    execute,
    errorTitle,
    patch,
  }: {
    service: EmployeeServiceWorkItem;
    transition: ServiceWorkTransition;
    execute: () => Promise<{
      success: boolean;
      error?: string;
      code?: string;
      conflict?: { serviceName: string; scheduledAt: string };
    }>;
    errorTitle: string;
    patch?: Partial<EmployeeServiceWorkItem>;
  }) => {
    if (pendingActionIdsRef.current.has(service.id)) return;
    setActionPending(service.id, true);
    await queryClient.cancelQueries({ queryKey: serviceWorkQueryKey });
    const snapshot =
      queryClient.getQueryData<EmployeeServiceWorkData>(serviceWorkQueryKey) ??
      initialServiceWork;
    queryClient.setQueryData<EmployeeServiceWorkData>(
      serviceWorkQueryKey,
      transitionServiceWork(snapshot, service.id, transition, {
        updated_at: new Date(),
        ...patch,
      }),
    );

    try {
      const result = await execute();
      if (!result.success) {
        queryClient.setQueryData<EmployeeServiceWorkData>(
          serviceWorkQueryKey,
          (current) =>
            restoreServiceWorkItem(current ?? snapshot, snapshot, service.id),
        );
        if (result.code === "SCHEDULE_CONFLICT") {
          const description = result.conflict
            ? `You already have ${result.conflict.serviceName} scheduled at ${formatPH(result.conflict.scheduledAt, "h:mm a")}. Finish, unclaim, reschedule, or reassign it first.`
            : result.error;
          toast.error("Schedule conflict", { description });
        } else {
          toast.error(errorTitle, {
            description: result.error || "Please try again.",
          });
        }
      }
    } catch {
      queryClient.setQueryData<EmployeeServiceWorkData>(
        serviceWorkQueryKey,
        (current) =>
          restoreServiceWorkItem(current ?? snapshot, snapshot, service.id),
      );
      toast.error(errorTitle, {
        description: "Something went wrong. Please try again.",
      });
    } finally {
      setActionPending(service.id, false);
      await queryClient.invalidateQueries({ queryKey: serviceWorkQueryKey });
    }
  };

  const handleClaim = async (service: EmployeeServiceWorkItem) => {
    const discount = getApplicableDiscount(
      service.service.id,
      service.package_id ?? undefined,
      service.price,
      saleEvents,
    );
    setServiceWorkTab("in-progress");
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

  const handleUnclaim = (service: EmployeeServiceWorkItem) =>
    runServiceWorkAction({
      service,
      transition: "unclaim",
      execute: () => unclaimServiceAction(service.id),
      errorTitle: "Unable to unclaim service",
      patch: { final_price: service.price, discount: 0, discount_reason: null },
    });

  const handleMarkServed = (service: EmployeeServiceWorkItem) =>
    runServiceWorkAction({
      service,
      transition: "complete",
      execute: () => markServiceServedAction(service.id, currentEmployeeId),
      errorTitle: "Unable to mark service as served",
    });

  const handleUnserve = async (service: EmployeeServiceWorkItem) => {
    setServiceWorkTab("in-progress");
    await runServiceWorkAction({
      service,
      transition: "unserve",
      execute: () => unserveServiceAction(service.id),
      errorTitle: "Unable to undo completed service",
    });
  };

  const employeeSpecialtySet = useMemo(
    () => getEmployeeSpecialtySet(currentEmployeeSpecialties),
    [currentEmployeeSpecialties],
  );

  const visiblePendingServices = useMemo(
    () =>
      serviceWork.pending.filter((item) =>
        isCategoryAllowedForEmployee(
          item.service.category,
          employeeSpecialtySet,
        ),
      ),
    [serviceWork.pending, employeeSpecialtySet],
  );

  const visibleActiveServices = useMemo(
    () =>
      serviceWork.active.filter((item) =>
        isCategoryAllowedForEmployee(
          item.service.category,
          employeeSpecialtySet,
        ),
      ),
    [serviceWork.active, employeeSpecialtySet],
  );

  const visibleCompletedServices = useMemo(
    () =>
      serviceWork.completed.filter((item) =>
        isCategoryAllowedForEmployee(
          item.service.category,
          employeeSpecialtySet,
        ),
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
    return visibleCompletedServices.filter((s) => {
      const date = new Date(s.updated_at);
      return (
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
      );
    }).length;
  }, [visibleCompletedServices]);

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
          eyebrow="Attendance"
          title="Today's shift"
          icon={Clock}
          count={leaveRequests.length || undefined}
          action={
            <RequestLeaveDialog
              employeeId={currentEmployeeId}
              businessId={businessId}
              businessSlug={businessSlug}
              leavesThisMonth={leaveRequests.length}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-lg px-2.5 text-xs font-medium shadow-none"
                >
                  <CalendarPlus className="mr-1.5 size-3.5" />
                  Request leave
                </Button>
              }
            />
          }
        />
        <PortalCardBody>
          <div
            className={
              leaveRequests.length > 0
                ? "grid gap-4 lg:grid-cols-2 lg:divide-x lg:divide-border"
                : "grid"
            }
          >
            <section aria-labelledby="attendance-heading">
              <h3
                id="attendance-heading"
                className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Shift status
              </h3>
              <AttendanceCard
                employeeId={currentEmployeeId}
                businessSlug={businessSlug}
                todayAttendance={todayAttendance ?? null}
                compact
              />
            </section>
            {leaveRequests.length > 0 ? (
              <section aria-labelledby="leave-heading" className="lg:pl-6">
                <h3
                  id="leave-heading"
                  className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Leave requests
                </h3>
                <EmployeeLeaveClient
                  employeeId={currentEmployeeId}
                  businessId={businessId}
                  businessSlug={businessSlug}
                  requests={leaveRequests}
                  compact
                  showRequestAction={false}
                />
              </section>
            ) : null}
          </div>
        </PortalCardBody>
      </PortalCard>

      <PortalCard className="max-h-[34rem] overflow-hidden md:col-span-2 xl:col-span-12">
        <PortalCardHeader
          eyebrow="Operations"
          title="Service work"
          icon={Briefcase}
          count={visibleActiveServices.length + visiblePendingServices.length}
          action={
            <WorkspaceRefreshButton
              pending={isFetching || pendingActionIds.size > 0}
              onRefresh={() => void refetch()}
            />
          }
        />
        <PortalCardBody className="min-h-0 overflow-hidden">
          <Tabs value={serviceWorkTab} onValueChange={setServiceWorkTab}>
            <TabsList className="grid h-9 w-full grid-cols-3 rounded-lg p-0.5">
              <TabsTrigger
                value="in-progress"
                className="h-8 min-h-0 gap-1.5 rounded-md py-0 text-xs shadow-none data-[state=active]:shadow-sm"
              >
                In Progress
                {visibleActiveServices.length > 0 ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground tabular-nums">
                    {visibleActiveServices.length}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="available"
                className="h-8 min-h-0 gap-1.5 rounded-md py-0 text-xs shadow-none data-[state=active]:shadow-sm"
              >
                Available
                {showQueueSection && visiblePendingServices.length > 0 ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground tabular-nums">
                    {visiblePendingServices.length}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="h-8 min-h-0 rounded-md py-0 text-xs shadow-none data-[state=active]:shadow-sm"
              >
                History
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="in-progress"
              className="mt-2 max-h-[24rem] overflow-x-hidden overflow-y-auto overscroll-contain pr-1 sm:max-h-[27rem]"
            >
              {showServedSection ? (
                <EmployeeServedHistory
                  mode="active"
                  services={visibleActiveServices}
                  employeeSpecialties={currentEmployeeSpecialties}
                  currentEmployeeCommission={currentEmployeeCommission}
                  onMarkServed={handleMarkServed}
                  onUnclaim={handleUnclaim}
                  onUnserve={handleUnserve}
                  pendingActionIds={pendingActionIds}
                />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Your profile cannot complete services.
                </p>
              )}
            </TabsContent>
            <TabsContent
              value="available"
              className="mt-2 max-h-[24rem] overflow-x-hidden overflow-y-auto overscroll-contain pr-1 sm:max-h-[27rem]"
            >
              {showQueueSection ? (
                <PendingServicesList
                  services={visiblePendingServices}
                  employeeSpecialties={currentEmployeeSpecialties}
                  saleEvents={saleEvents}
                  canClaimServices={capabilities.canClaimQueue}
                  showRefresh={false}
                  onClaim={handleClaim}
                  pendingActionIds={pendingActionIds}
                />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Your profile cannot claim available services.
                </p>
              )}
            </TabsContent>
            <TabsContent
              value="history"
              className="mt-2 max-h-[24rem] overflow-x-hidden overflow-y-auto overscroll-contain pr-1 sm:max-h-[27rem]"
            >
              {showServedSection ? (
                <EmployeeServedHistory
                  mode="history"
                  services={visibleCompletedServices}
                  employeeSpecialties={currentEmployeeSpecialties}
                  currentEmployeeCommission={currentEmployeeCommission}
                  onMarkServed={handleMarkServed}
                  onUnclaim={handleUnclaim}
                  onUnserve={handleUnserve}
                  pendingActionIds={pendingActionIds}
                />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No service history is available for this profile.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </PortalCardBody>
      </PortalCard>

      {showPaymentsSection && unsettledPaymentCount > 0 ? (
        <PortalCard className="md:col-span-2 xl:col-span-12">
          <PortalCardHeader
            eyebrow="Payments"
            title="Collect balances"
            count={unsettledPaymentCount}
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

      {capabilities.canQueueOverride &&
      employeeProfile !== StaffProfile.MANAGER ? (
        <PortalCard className="md:col-span-2 xl:col-span-12">
          <PortalCardHeader eyebrow="Override" title="Floor queue" />
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
