import "server-only";

import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import {
  bookingHistorySelect,
  buildDailyBuckets,
  buildFinancialPoints,
  buildMonthlyBuckets,
  completedServiceSelect,
  formatTime,
  getMonthStart,
  mapOwnerDashboardPreviewReadModel,
  ownerMembership,
  toTodayBooking,
  todayBookingSelect,
} from "@/features/dashboard/queries/owner-dashboard-preview";
import {
  getTenantOwnerClaimedServiceQueue,
  getTenantOwnerRecentlyCompletedServiceQueue,
  getTenantPendingServiceQueue,
} from "@/features/dashboard/queries/service-queues";
import type {
  OwnerDashboardFinancialRangeDto,
  OwnerDashboardGrowthDto,
  OwnerDashboardPerformanceDto,
  OwnerDashboardPreviewRange,
  OwnerDashboardQueueDto,
  OwnerDashboardTodayDto,
} from "@/features/dashboard/types/owner-dashboard-preview";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import { getCurrentDateTimePH, getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import { getTodayOpportunityViews } from "@/lib/services/growth/opportunities";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

type OwnerContext = Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;
type DashboardDatabase = Pick<Prisma.TransactionClient, "business" | "booking" | "availedService" | "expense" | "payslip">;
type ReadOptions = { now?: Date; db?: DashboardDatabase };
const DAY_MS = 24 * 60 * 60 * 1000;

async function currentBusiness(context: OwnerContext, db: DashboardDatabase) {
  return db.business.findFirst({
    where: {
      id: context.businessId,
      slug: context.businessSlug,
      owners: { some: ownerMembership(context) },
    },
    select: { name: true },
  });
}

function completedServiceWhere(
  context: OwnerContext,
  startAt: Date,
  endAt: Date,
): Prisma.AvailedServiceWhereInput {
  return {
    status: "COMPLETED",
    completed_at: { gte: startAt, lte: endAt },
    booking: {
      business_id: context.businessId,
      status: "COMPLETED",
      business: { owners: { some: ownerMembership(context) } },
      OR: [
        { customer_id: null },
        { customer: { business_id: context.businessId } },
      ],
    },
    service: { business_id: context.businessId },
    OR: [
      { package_id: null },
      { package: { business_id: context.businessId } },
    ],
  };
}

function expenseWhere(context: OwnerContext, startAt: Date, endAt: Date): Prisma.ExpenseWhereInput {
  return {
    business_id: context.businessId,
    date: { gte: startAt, lte: endAt },
    business: { owners: { some: ownerMembership(context) } },
  };
}

function payrollWhere(context: OwnerContext, startAt: Date, endAt: Date): Prisma.PayslipWhereInput {
  return {
    status: "PAID",
    ending_date: { gte: startAt, lte: endAt },
    employee: {
      business_id: context.businessId,
      business: { owners: { some: ownerMembership(context) } },
    },
  };
}

export async function getOwnerDashboardPerformance(
  context: OwnerContext,
  options: ReadOptions = {},
): Promise<OwnerDashboardPerformanceDto | null> {
  const db = options.db ?? prisma;
  const now = options.now ?? getCurrentDateTimePH();
  const business = await currentBusiness(context, db);
  if (!business) return null;
  const startAt = getMonthStart(now, -1);
  const endAt = getEndOfDayPH(now);
  const [bookingHistory, completedServices, expenses, payroll] = await Promise.all([
    db.booking.findMany({
      where: {
        business_id: context.businessId,
        created_at: { gte: startAt, lte: endAt },
        business: { owners: { some: ownerMembership(context) } },
      },
      select: bookingHistorySelect,
    }),
    db.availedService.findMany({
      where: completedServiceWhere(context, startAt, endAt),
      select: completedServiceSelect,
      orderBy: { completed_at: "asc" },
    }),
    db.expense.findMany({
      where: expenseWhere(context, startAt, endAt),
      select: { amount: true, category: true, date: true },
      orderBy: { date: "asc" },
    }),
    db.payslip.findMany({
      where: payrollWhere(context, startAt, endAt),
      select: { total_salary: true, ending_date: true },
      orderBy: { ending_date: "asc" },
    }),
  ]);
  const mapped = mapOwnerDashboardPreviewReadModel(context, {
    now,
    businessName: business.name,
    bookingHistory,
    completedServices,
    expenses,
    payroll,
    todayBookings: [],
    pendingQueue: [],
    claimedQueue: [],
    ranges: ["month"],
  });
  return {
    generatedAt: mapped.generatedAt,
    business: mapped.business,
    kpis: mapped.kpis,
    financials: { month: mapped.financials.month },
    expenseBreakdown: mapped.expenseBreakdown,
    topServices: mapped.topServices,
    topCustomers: mapped.topCustomers,
    staff: mapped.staff,
    availability: { staffUtilization: "unavailable" },
  };
}

export async function getOwnerDashboardToday(
  context: OwnerContext,
  options: ReadOptions = {},
): Promise<OwnerDashboardTodayDto | null> {
  const db = options.db ?? prisma;
  const now = options.now ?? getCurrentDateTimePH();
  if (!(await currentBusiness(context, db))) return null;
  const bookings = await db.booking.findMany({
    where: {
      business_id: context.businessId,
      status: { in: ["HOLD", "ACCEPTED"] },
      scheduled_at: { gte: getStartOfDayPH(now), lte: getEndOfDayPH(now) },
      business: { owners: { some: ownerMembership(context) } },
      OR: [
        { customer_id: null },
        { customer: { business_id: context.businessId } },
      ],
      availed_services: {
        every: {
          service: { business_id: context.businessId },
          OR: [
            { package_id: null },
            { package: { business_id: context.businessId } },
          ],
        },
      },
    },
    select: todayBookingSelect,
    orderBy: { scheduled_at: "asc" },
    take: 8,
  });
  return {
    generatedAt: now.toISOString(),
    bookings: bookings.map((row) => toTodayBooking(row, context.businessId)),
  };
}

export async function getOwnerDashboardQueue(
  context: OwnerContext,
  options: ReadOptions = {},
): Promise<OwnerDashboardQueueDto | null> {
  const db = options.db ?? prisma;
  const now = options.now ?? getCurrentDateTimePH();
  if (!(await currentBusiness(context, db))) return null;
  const [pendingQueue, claimedQueue, completedQueue] = await Promise.all([
    getTenantPendingServiceQueue(context, { take: 20 }),
    getTenantOwnerClaimedServiceQueue(context, { take: 20 }),
    getTenantOwnerRecentlyCompletedServiceQueue(context, { take: 20, since: getStartOfDayPH(now) }),
  ]);
  return {
    generatedAt: now.toISOString(),
    queue: [
      ...pendingQueue.map((item) => ({
        id: item.id,
        service: item.package?.name ?? item.service.name,
        customer: item.booking.customer?.name ?? "Walk-in",
        time: formatTime(item.scheduled_at ?? item.booking.scheduled_at),
        price: Math.round((item.price + Number.EPSILON) * 100) / 100,
        status: "PENDING" as const,
      })),
      ...claimedQueue.map((item) => ({
        id: item.id,
        service: item.package?.name ?? item.service.name,
        customer: item.booking.customer?.name ?? "Walk-in",
        time: formatTime(item.scheduled_at ?? item.booking.scheduled_at),
        price: Math.round((item.final_price + Number.EPSILON) * 100) / 100,
        status: item.status === "SERVING" ? ("SERVING" as const) : ("CLAIMED" as const),
      })),
      ...completedQueue.map((item) => ({
        id: item.id,
        service: item.package?.name ?? item.service.name,
        customer: item.booking.customer?.name ?? "Walk-in",
        time: formatTime(item.scheduled_at ?? item.booking.scheduled_at),
        price: Math.round((item.final_price + Number.EPSILON) * 100) / 100,
        status: "COMPLETED" as const,
      })),
    ],
  };
}

export async function getOwnerDashboardGrowth(
  context: OwnerContext,
  options: ReadOptions = {},
): Promise<OwnerDashboardGrowthDto | null> {
  const db = options.db ?? prisma;
  const now = options.now ?? getCurrentDateTimePH();
  if (!(await currentBusiness(context, db))) return null;
  const entitlements = await getBusinessEntitlementsBySlug(context.businessSlug);
  const opportunities = entitlements.growth
    ? await getTodayOpportunityViews(context.businessId)
    : [];
  const opportunity = opportunities[0];
  return {
    generatedAt: now.toISOString(),
    growth: {
      enabled: entitlements.growth,
      opportunity: opportunity
        ? {
            id: opportunity.id,
            reason: opportunity.reason,
            confidence: opportunity.confidence,
            timeWindowStart: opportunity.timeWindowStart,
            timeWindowEnd: opportunity.timeWindowEnd,
            recommendedOfferTypes: opportunity.recommendedOfferTypes,
          }
        : null,
      occupancy: null,
    },
    availability: { growthOccupancy: "unavailable" },
  };
}

export async function getOwnerDashboardFinancialRange(
  context: OwnerContext,
  range: OwnerDashboardPreviewRange,
  options: ReadOptions = {},
): Promise<OwnerDashboardFinancialRangeDto | null> {
  const db = options.db ?? prisma;
  const now = options.now ?? getCurrentDateTimePH();
  if (!(await currentBusiness(context, db))) return null;
  const endAt = getEndOfDayPH(now);
  const startAt = range === "7d"
    ? getStartOfDayPH(new Date(now.getTime() - 6 * DAY_MS))
    : range === "month"
      ? getMonthStart(now)
      : getMonthStart(now, range === "6m" ? -5 : -11);
  const [services, expenses, payroll] = await Promise.all([
    db.availedService.findMany({
      where: completedServiceWhere(context, startAt, endAt),
      select: { final_price: true, completed_at: true },
    }),
    db.expense.findMany({
      where: expenseWhere(context, startAt, endAt),
      select: { amount: true, date: true },
    }),
    db.payslip.findMany({
      where: payrollWhere(context, startAt, endAt),
      select: { total_salary: true, ending_date: true },
    }),
  ]);
  const buckets = range === "7d"
    ? buildDailyBuckets(startAt, endAt, { weekday: "short" })
    : range === "month"
      ? buildDailyBuckets(startAt, endAt, { day: "numeric" })
      : buildMonthlyBuckets(startAt, endAt);
  return {
    generatedAt: now.toISOString(),
    range,
    points: buildFinancialPoints(buckets, services, expenses, payroll),
  };
}
