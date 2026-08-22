import EmployeeDashboard from "./EmployeeDashboard";
import ManagerDashboard from "@/components/dashboard/manager/ManagerDashboard";
import { prisma } from "@/prisma/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next auth/options";
import { redirect } from "next/navigation";
import { getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import {
  getCachedBusinessBySlug,
  getCachedServices,
  getCachedPackages,
} from "@/lib/data/cached";
import {
  hasStaffPermission,
  resolveTenantActorContext,
} from "@/lib/auth/staff-access";
import { StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";
import type {
  ManagerQueueEmployee,
  ManagerQueueService,
} from "@/components/dashboard/manager/ManagerQueueBoard";
import {
  AvailedServiceStatus,
  BookingStatus,
} from "@/prisma/generated/prisma/client";

export default async function EmployeeDashboardDataContainer({
  businessSlug,
}: {
  businessSlug: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/");
  }

  const business = await getCachedBusinessBySlug(businessSlug);

  const employee = await prisma.employee.findFirst({
    where: {
      user_id: session.user.id,
      business_id: business?.id,
    },
    include: {
      user: true,
    },
  });

  if (!employee || !business) {
    return <div>Error loading dashboard</div>;
  }

  const actorContext = await resolveTenantActorContext(
    businessSlug,
    session.user.id,
  );
  if (!actorContext.success || actorContext.actorType !== "EMPLOYEE") {
    return <div>Error loading dashboard</div>;
  }

  const capabilities = {
    canCreateBooking: hasStaffPermission(
      actorContext,
      StaffPermission.BOOKING_CREATE,
    ),
    canCollectPayment: hasStaffPermission(
      actorContext,
      StaffPermission.PAYMENT_COLLECT,
    ),
    canClaimQueue: hasStaffPermission(
      actorContext,
      StaffPermission.QUEUE_CLAIM_SELF,
    ),
    canServeQueue: hasStaffPermission(
      actorContext,
      StaffPermission.QUEUE_SERVE_SELF,
    ),
    canQueueOverride: hasStaffPermission(
      actorContext,
      StaffPermission.QUEUE_OVERRIDE_ALL,
    ),
    canManageCatalog: hasStaffPermission(
      actorContext,
      StaffPermission.CATALOG_MANAGE,
    ),
    canSubmitSocialPost: hasStaffPermission(
      actorContext,
      StaffPermission.SOCIAL_POST_REQUEST_CREATE,
    ),
    // The four booking-modification flags. Not currently consumed by
    // the dashboard surface itself (BookingQuickPanel resolves them
    // via viewer-context for in-panel gating), but plumbed so future
    // dashboard-level gating can reuse the same source of truth.
    canModifyBooking: hasStaffPermission(
      actorContext,
      StaffPermission.BOOKING_MODIFY,
    ),
    canCancelBooking: hasStaffPermission(
      actorContext,
      StaffPermission.BOOKING_CANCEL,
    ),
    canMarkNoShow: hasStaffPermission(
      actorContext,
      StaffPermission.BOOKING_MARK_NO_SHOW,
    ),
    canAdjustBookingPrice: hasStaffPermission(
      actorContext,
      StaffPermission.BOOKING_ADJUST_PRICE,
    ),
  };

  const employeeProfile = actorContext.profile ?? StaffProfile.STAFF;

  let managerQueueServices: ManagerQueueService[] = [];
  let managerQueueEmployees: ManagerQueueEmployee[] = [];
  if (capabilities.canQueueOverride) {
    const [queueServices, queueEmployees] = await Promise.all([
      prisma.availedService.findMany({
        where: {
          booking: {
            business_id: business.id,
            status: BookingStatus.ACCEPTED,
          },
          status: {
            in: [
              AvailedServiceStatus.PENDING,
              AvailedServiceStatus.CLAIMED,
              AvailedServiceStatus.SERVING,
            ],
          },
        },
        select: {
          id: true,
          status: true,
          price: true,
          scheduled_at: true,
          package: {
            select: {
              name: true,
            },
          },
          service: {
            select: {
              name: true,
              category: true,
              duration: true,
            },
          },
          served_by_id: true,
          booking: {
            select: {
              customer: {
                select: {
                  name: true,
                },
              },
              scheduled_at: true,
              created_at: true,
            },
          },
          served_by: {
            select: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ scheduled_at: "asc" }, { created_at: "asc" }],
        take: 100,
      }),
      prisma.employee.findMany({
        where: {
          business_id: business.id,
        },
        select: {
          id: true,
          specialties: true,
          user: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          user: {
            name: "asc",
          },
        },
      }),
    ]);

    managerQueueServices = queueServices as ManagerQueueService[];
    managerQueueEmployees = queueEmployees as ManagerQueueEmployee[];
  }
  const startOfToday = getStartOfDayPH();
  const endOfToday = getEndOfDayPH();

  const servedHistory = await prisma.availedService.findMany({
    where: {
      served_by_id: employee.id,
      status: { in: ["CLAIMED", "SERVING", "COMPLETED"] },
    },
    include: {
      service: true,
      package: true,
      booking: {
        select: {
          customer: true,
          scheduled_at: true,
          created_at: true,
          downpayment: true,
          downpayment_status: true,
          grand_total: true,
          amount_paid: true,
          payment_status: true,
        },
      },
    },
    orderBy: {
      updated_at: "desc",
    },
    take: 10,
  });

  const pendingServices = await prisma.availedService.findMany({
    where: {
      booking: {
        business_id: business.id,
        status: "ACCEPTED",
      },
      status: "PENDING",
    },
    include: {
      service: true,
      package: true,
      booking: {
        select: {
          customer: true,
          scheduled_at: true,
          created_at: true,
          downpayment: true,
          downpayment_status: true,
          grand_total: true,
          amount_paid: true,
          payment_status: true,
        },
      },
    },
    orderBy: {
      scheduled_at: "asc",
    },
    take: 20,
  });

  const todayBookings = await prisma.booking.findMany({
    where: {
      business_id: business.id,
      status: { in: ["ACCEPTED", "COMPLETED"] },
      OR: [
        {
          scheduled_at: {
            gte: startOfToday,
            lte: endOfToday,
          },
        },
        {
          scheduled_at: null,
          created_at: {
            gte: startOfToday,
            lte: endOfToday,
          },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      payment_status: true,
      payment_method: true,
      grand_total: true,
      amount_paid: true,
      created_at: true,
      scheduled_at: true,
      customer: {
        select: {
          name: true,
          email: true,
        },
      },
      availed_services: {
        select: {
          id: true,
          service: {
            select: {
              name: true,
              category: true,
            },
          },
        },
      },
      payments: {
        where: { status: { in: ["SUCCEEDED", "CANCELED"] } },
        select: {
          id: true,
          status: true,
          payment_method: true,
          amount_principal: true,
          provider_reference: true,
          paid_at: true,
        },
        orderBy: { created_at: "desc" },
      },
    },
    orderBy: [{ scheduled_at: "asc" }, { created_at: "desc" }],
    take: 50,
  });

  // Managers get a parallel "full detail" copy of today's bookings so
  // they can open BookingQuickPanel from their dashboard. We don't widen
  // the lightweight todayBookings query above because the existing
  // payments queue / cashier paths use only the narrow EmployeePaymentBooking
  // shape, and adding joins everywhere would balloon query cost for roles
  // that don't need it. Restricted to MANAGER profile only.
  const managerBookings =
    employeeProfile === StaffProfile.MANAGER
      ? await prisma.booking.findMany({
          where: {
            business_id: business.id,
            status: { not: "CANCELLED" },
            OR: [
              {
                scheduled_at: { gte: startOfToday, lte: endOfToday },
              },
              {
                scheduled_at: null,
                created_at: { gte: startOfToday, lte: endOfToday },
              },
            ],
          },
          include: {
            customer: true,
            vouchers: true,
            availed_services: {
              include: {
                service: true,
                served_by: { include: { user: true } },
                served_by_owner: { include: { user: true } },
              },
            },
          },
          orderBy: [{ scheduled_at: "asc" }, { created_at: "desc" }],
          take: 50,
        })
      : [];

  // Non-manager employees (STAFF, CASHIER) get a "My Bookings" list of
  // bookings where they're the served_by employee on at least one
  // service line. Same full-detail shape as managerBookings so the
  // BookingQuickPanel can open against it directly. Scoped to today
  // and the next 7 days so the list stays focused.
  const sevenDaysFromNow = new Date(endOfToday);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const myBookings =
    employeeProfile !== StaffProfile.MANAGER
      ? await prisma.booking.findMany({
          where: {
            business_id: business.id,
            status: { not: "CANCELLED" },
            availed_services: {
              some: { served_by_id: employee.id },
            },
            OR: [
              {
                scheduled_at: { gte: startOfToday, lte: sevenDaysFromNow },
              },
              {
                scheduled_at: null,
                created_at: { gte: startOfToday, lte: endOfToday },
              },
            ],
          },
          include: {
            customer: true,
            vouchers: true,
            availed_services: {
              include: {
                service: true,
                served_by: { include: { user: true } },
                served_by_owner: { include: { user: true } },
              },
            },
          },
          orderBy: [{ scheduled_at: "asc" }, { created_at: "desc" }],
          take: 50,
        })
      : [];

  const services = await getCachedServices(business.id);
  const packages = await getCachedPackages(business.id);
  const categories = Array.from(new Set(services.map((s) => s.category)));

  const { checkAttendanceStatusAction, getAttendanceCountAction } =
    await import("@/lib/server actions/attendance");
  const attendanceResult = await checkAttendanceStatusAction(employee.id);
  const todayAttendance = attendanceResult.success
    ? attendanceResult.data
    : null;

  const lastPayslip = await prisma.payslip.findFirst({
    where: { employee_id: employee.id },
    orderBy: { ending_date: "desc" },
  });

  const { getActiveSaleEvents } =
    await import("@/lib/server actions/sale-event");
  const saleEventsResult = await getActiveSaleEvents(businessSlug);
  const saleEvents = (saleEventsResult.success && saleEventsResult.data) || [];

  // Start from the day AFTER the last payslip
  const salaryStartDate = lastPayslip
    ? lastPayslip.ending_date
    : getStartOfDayPH(employee.user.created_at);

  const attendanceCountResult = await getAttendanceCountAction(
    employee.id,
    salaryStartDate,
    new Date(),
  );
  const daysPresent = attendanceCountResult.success
    ? (attendanceCountResult.data ?? 0)
    : 0;

  // Calculate attendance-based salary
  const attendanceSalary = daysPresent * (employee.daily_rate || 0);

  // Calculate unpaid commissions since last payslip
  const unpaidCommissions = await prisma.availedService.findMany({
    where: {
      served_by_id: employee.id,
      status: "COMPLETED",
      completed_at: {
        gt: salaryStartDate,
      },
    },
    select: {
      price: true,
      commission_base: true,
    },
  });

  const totalCommissions = unpaidCommissions.reduce((acc, curr) => {
    const base = curr.commission_base ?? curr.price;
    return acc + (base * (employee.commission_percentage || 0)) / 100;
  }, 0);

  const totalEstimatedSalary = attendanceSalary + totalCommissions;

  const { getUserLeaveRequests } = await import("@/app/actions/leave-request");
  const leaveRequestsResult = await getUserLeaveRequests(employee.id);
  const leaveRequests = leaveRequestsResult.success
    ? leaveRequestsResult.data || []
    : [];

  return (
    employeeProfile === StaffProfile.MANAGER ? (
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
        servedHistory={servedHistory}
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
        myBookings={myBookings}
        services={services}
        packages={packages}
        categories={categories}
        saleEvents={saleEvents}
        leaveRequests={leaveRequests}
      />
    )
  );
}
