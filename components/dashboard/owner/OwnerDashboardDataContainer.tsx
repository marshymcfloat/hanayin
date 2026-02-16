import { getCachedBusinessBySlug } from "@/lib/data/cached";

import { authOptions } from "@/lib/next auth/options";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import OwnerDashboard from "./OwnerDashboard";
import { prisma } from "@/prisma/prisma";
import {
  getCurrentDateTimePH,
  getEndOfDayPH,
  getStartOfDayPH,
} from "@/lib/date-utils";
import { getThisWeeksFlowRemindersCount } from "@/lib/data/flow-reminder-queries";
import { getTodayOpportunityViews } from "@/lib/services/growth/opportunities";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";

function toObjectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function OwnerDashboardDataContainer({
  businessSlug,
}: {
  businessSlug: string;
}) {
  const nowPH = getCurrentDateTimePH();
  const startOfToday = getStartOfDayPH(nowPH);
  const endOfToday = getEndOfDayPH(nowPH);
  const metricWindowStart = new Date(
    nowPH.getTime() - 7 * 24 * 60 * 60 * 1000,
  );
  const chartWindowStart = new Date(
    nowPH.getTime() - 400 * 24 * 60 * 60 * 1000,
  );

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  const business = await getCachedBusinessBySlug(businessSlug);
  if (!business) {
    return <div>Error loading dashboard</div>;
  }
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);

  const owner = await prisma.owner.findFirst({
    where: {
      user_id: session.user.id,
      business_id: business.id,
    },
    select: {
      id: true,
    },
  });

  if (!owner) {
    return <div>Error loading dashboard</div>;
  }

  const [
    totalSalesAggregate,
    bookingsTodayCount,
    presentEmployeesTodayRows,
    allBookings,
    pendingServices,
    ownerClaimedServices,
    payrollData,
    flowRemindersThisWeek,
    slotLookupTotal,
    slotLookupSuccess,
    submitAttempts,
    submitSuccess,
    slotJustTakenRejections,
    publicStarted,
    publicCompleted,
    rawConflictSignals,
    chartBookingsDetailed,
    growthOpportunities,
  ] = await Promise.all([
    prisma.booking.aggregate({
      where: {
        business_id: business.id,
        status: { not: "CANCELLED" },
      },
      _sum: {
        grand_total: true,
      },
    }),
    prisma.booking.count({
      where: {
        business_id: business.id,
        created_at: {
          gte: startOfToday,
          lte: endOfToday,
        },
        status: {
          not: "CANCELLED",
        },
      },
    }),
    prisma.employeeAttendance.findMany({
      where: {
        date: { gte: startOfToday, lte: endOfToday },
        status: "PRESENT",
        employee: {
          business_id: business.id,
        },
      },
      select: {
        employee_id: true,
      },
      distinct: ["employee_id"],
    }),
    prisma.booking.findMany({
      where: {
        business_id: business.id,
      },
      include: {
        customer: true,
        availed_services: {
          include: {
            service: true,
            served_by: {
              include: { user: true },
            },
            served_by_owner: {
              include: { user: true },
            },
          },
        },
        vouchers: true,
      },
      orderBy: {
        created_at: "desc",
      },
      take: 120,
    }),
    prisma.availedService.findMany({
      where: {
        booking: {
          business_id: business.id,
          status: { in: ["ACCEPTED"] },
        },
        status: "PENDING",
      },
      select: {
        id: true,
        price: true,
        scheduled_at: true,
        package_id: true,
        package: {
          select: {
            name: true,
          },
        },
        service: {
          select: {
            name: true,
            duration: true,
          },
        },
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
      },
      orderBy: {
        scheduled_at: "asc",
      },
      take: 20,
    }),
    prisma.availedService.findMany({
      where: {
        served_by_owner_id: owner.id,
        status: { in: ["CLAIMED", "SERVING"] },
        booking: {
          business_id: business.id,
          status: { in: ["ACCEPTED"] },
        },
      },
      select: {
        id: true,
        price: true,
        scheduled_at: true,
        claimed_at: true,
        status: true,
        package_id: true,
        package: {
          select: {
            name: true,
          },
        },
        service: {
          select: {
            name: true,
            duration: true,
          },
        },
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
      },
      orderBy: {
        scheduled_at: "asc",
      },
      take: 20,
    }),
    prisma.payslip.findMany({
      where: {
        employee: {
          business_id: business.id,
        },
        status: "PAID",
      },
      select: {
        id: true,
        total_salary: true,
        starting_date: true,
        ending_date: true,
        employee: {
          select: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        ending_date: "desc",
      },
    }),
    getThisWeeksFlowRemindersCount(business.id),
    prisma.auditLog.count({
      where: {
        business_id: business.id,
        entity_type: "BookingMetric",
        created_at: {
          gte: metricWindowStart,
        },
        action: "BOOKING_SLOT_LOOKUP",
      },
    }),
    prisma.auditLog.count({
      where: {
        business_id: business.id,
        entity_type: "BookingMetric",
        created_at: {
          gte: metricWindowStart,
        },
        action: "BOOKING_SLOT_LOOKUP",
        changes: {
          path: ["outcome"],
          equals: "SUCCESS",
        },
      },
    }),
    prisma.auditLog.count({
      where: {
        business_id: business.id,
        entity_type: "BookingMetric",
        created_at: {
          gte: metricWindowStart,
        },
        action: "BOOKING_SUBMIT_ATTEMPT",
      },
    }),
    prisma.auditLog.count({
      where: {
        business_id: business.id,
        entity_type: "BookingMetric",
        created_at: {
          gte: metricWindowStart,
        },
        action: "BOOKING_SUBMIT_SUCCESS",
      },
    }),
    prisma.auditLog.count({
      where: {
        business_id: business.id,
        entity_type: "BookingMetric",
        created_at: {
          gte: metricWindowStart,
        },
        action: "BOOKING_SUBMIT_REJECTION",
        changes: {
          path: ["reason"],
          equals: "SLOT_JUST_TAKEN",
        },
      },
    }),
    prisma.auditLog.count({
      where: {
        business_id: business.id,
        entity_type: "BookingMetric",
        created_at: {
          gte: metricWindowStart,
        },
        action: "PUBLIC_BOOKING_STARTED",
      },
    }),
    prisma.auditLog.count({
      where: {
        business_id: business.id,
        entity_type: "BookingMetric",
        created_at: {
          gte: metricWindowStart,
        },
        action: "PUBLIC_BOOKING_COMPLETED",
      },
    }),
    prisma.outboxMessage.findMany({
      where: {
        business_id: business.id,
        event_type: "BOOKING_STAFFING_CONFLICT_DETECTED",
        created_at: {
          gte: metricWindowStart,
        },
      },
      orderBy: {
        created_at: "desc",
      },
      take: 6,
      select: {
        id: true,
        aggregate_id: true,
        payload: true,
        created_at: true,
      },
    }),
    prisma.booking.findMany({
      where: {
        business_id: business.id,
        status: {
          not: "CANCELLED",
        },
        created_at: {
          gte: chartWindowStart,
        },
      },
      select: {
        id: true,
        created_at: true,
        grand_total: true,
        availed_services: {
          select: {
            price: true,
            service: {
              select: {
                category: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        created_at: "asc",
      },
      take: 1200,
    }),
    entitlements.growth
      ? getTodayOpportunityViews(business.id)
      : Promise.resolve([]),
  ]);

  const totalSales = totalSalesAggregate._sum.grand_total ?? 0;
  const presentEmployeesToday = presentEmployeesTodayRows.length;
  const chartBookings = chartBookingsDetailed.map((booking) => ({
    id: booking.id,
    created_at: booking.created_at,
    grand_total: booking.grand_total,
  }));

  const slotLookupSuccessRate =
    slotLookupTotal > 0 ? (slotLookupSuccess / slotLookupTotal) * 100 : 0;
  const bookingSubmitSuccessRate =
    submitAttempts > 0 ? (submitSuccess / submitAttempts) * 100 : 0;
  const conflictRejectionRate =
    submitAttempts > 0 ? (slotJustTakenRejections / submitAttempts) * 100 : 0;
  const publicConversionRate =
    publicStarted > 0 ? (publicCompleted / publicStarted) * 100 : 0;

  const staffingConflictAlerts = rawConflictSignals.map((signal) => {
    const payload = toObjectRecord(signal.payload);
    return {
      id: signal.id,
      bookingId: Number.parseInt(signal.aggregate_id, 10),
      customerName: String(payload.customerName || "Customer"),
      scheduledAt: String(payload.scheduledAt || ""),
      trigger: String(payload.trigger || "MANUAL_REVALIDATION"),
      reason: String(payload.reason || "Staffing conflict detected."),
      detectedAt: signal.created_at,
    };
  });

  return (
    <OwnerDashboard
      businessName={business.name}
      businessSlug={businessSlug}
      totalSales={totalSales}
      bookingsToday={bookingsTodayCount}
      presentEmployeesToday={presentEmployeesToday}
      bookings={chartBookings}
      allBookings={allBookings}
      pendingServices={pendingServices}
      ownerClaimedServices={ownerClaimedServices}
      payroll={payrollData}
      flowRemindersThisWeek={flowRemindersThisWeek}
      bookingMetrics={{
        slotLookupSuccessRate,
        bookingSubmitSuccessRate,
        conflictRejectionRate,
        publicConversionRate,
        slotLookupTotal,
        submitAttempts,
        publicStarted,
        publicCompleted,
      }}
      staffingConflictAlerts={staffingConflictAlerts}
      todayGrowthOpportunity={growthOpportunities[0] || null}
      growthEnabled={entitlements.growth}
      reportsEnabled={entitlements.reportsCore}
    />
  );
}
