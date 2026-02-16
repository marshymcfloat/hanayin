import { getCurrentDateTimePH, TIMEZONE_PH } from "@/lib/date-utils";
import { asPercentage, median, roundTo, safeDivide } from "@/lib/services/reports/calculations";
import type {
  AdvancedReportPayloadMap,
  AdvancedReportTab,
  AttributionReportPayload,
  CohortsReportPayload,
  CoreReportTab,
  CustomersReportPayload,
  OperationsReportPayload,
  OpportunityRoiReportPayload,
  OverviewReportPayload,
  ReportDateRange,
  ReportGroupBy,
  ReportPayloadMap,
  RevenueReportPayload,
  StaffPerformanceRow,
  TopCustomerRow,
  TopServiceRow,
} from "@/lib/types/reports";
import { prisma } from "@/prisma/prisma";

const BOOKED_STATUSES = new Set(["HOLD", "ACCEPTED", "COMPLETED"]);
const NON_CANCELLED_STATUS = { not: "CANCELLED" as const };
const DAY_MS = 24 * 60 * 60 * 1000;

type PrismaClientLike = typeof prisma;

type TimeBucket = {
  key: string;
  label: string;
  startAt: Date;
  endAt: Date;
};

function getPhDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_PH,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number.parseInt(
    parts.find((part) => part.type === "year")?.value ?? "1970",
    10,
  );
  const month = Number.parseInt(
    parts.find((part) => part.type === "month")?.value ?? "1",
    10,
  );
  const day = Number.parseInt(
    parts.find((part) => part.type === "day")?.value ?? "1",
    10,
  );

  return { year, month, day };
}

function toPhDate(year: number, month: number, day: number, endOfDay = false) {
  const hh = endOfDay ? "23" : "00";
  const mm = endOfDay ? "59" : "00";
  const ss = endOfDay ? "59.999" : "00";
  return new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${hh}:${mm}:${ss}+08:00`,
  );
}

function formatBucketLabel(date: Date, groupBy: ReportGroupBy) {
  if (groupBy === "month") {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: TIMEZONE_PH,
      month: "short",
      year: "numeric",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIMEZONE_PH,
    month: "short",
    day: "numeric",
  }).format(date);
}

function shiftPhDateByDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function startOfPhWeek(date: Date) {
  const parts = getPhDateParts(date);
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayOfWeek = utcDate.getUTCDay();
  const diffFromMonday = (dayOfWeek + 6) % 7;
  return shiftPhDateByDays(toPhDate(parts.year, parts.month, parts.day), -diffFromMonday);
}

function ymdKey(date: Date) {
  const parts = getPhDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function monthKey(date: Date) {
  const parts = getPhDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function bucketKeyForDate(date: Date, groupBy: ReportGroupBy) {
  if (groupBy === "day") return ymdKey(date);
  if (groupBy === "month") return monthKey(date);
  return ymdKey(startOfPhWeek(date));
}

function buildBuckets(range: ReportDateRange): TimeBucket[] {
  const buckets: TimeBucket[] = [];

  if (range.groupBy === "day") {
    let cursor = new Date(range.startAt);
    while (cursor.getTime() <= range.endAt.getTime()) {
      const key = ymdKey(cursor);
      const startAt = toPhDate(
        getPhDateParts(cursor).year,
        getPhDateParts(cursor).month,
        getPhDateParts(cursor).day,
      );
      const endAt = toPhDate(
        getPhDateParts(cursor).year,
        getPhDateParts(cursor).month,
        getPhDateParts(cursor).day,
        true,
      );
      buckets.push({
        key,
        label: formatBucketLabel(cursor, "day"),
        startAt,
        endAt,
      });
      cursor = shiftPhDateByDays(cursor, 1);
    }
    return buckets;
  }

  if (range.groupBy === "week") {
    let cursor = startOfPhWeek(range.startAt);
    while (cursor.getTime() <= range.endAt.getTime()) {
      const key = ymdKey(cursor);
      const weekEnd = shiftPhDateByDays(cursor, 6);
      buckets.push({
        key,
        label: formatBucketLabel(cursor, "week"),
        startAt: new Date(cursor),
        endAt:
          weekEnd.getTime() > range.endAt.getTime()
            ? new Date(range.endAt)
            : toPhDate(
                getPhDateParts(weekEnd).year,
                getPhDateParts(weekEnd).month,
                getPhDateParts(weekEnd).day,
                true,
              ),
      });
      cursor = shiftPhDateByDays(cursor, 7);
    }
    return buckets;
  }

  let { year, month } = getPhDateParts(range.startAt);
  while (true) {
    const firstDay = toPhDate(year, month, 1);
    if (firstDay.getTime() > range.endAt.getTime()) break;

    const nextMonth =
      month === 12
        ? { year: year + 1, month: 1 }
        : { year, month: month + 1 };
    const nextFirst = toPhDate(nextMonth.year, nextMonth.month, 1);
    const lastDay = new Date(nextFirst.getTime() - 1);
    buckets.push({
      key: `${year}-${String(month).padStart(2, "0")}`,
      label: formatBucketLabel(firstDay, "month"),
      startAt: firstDay,
      endAt: lastDay.getTime() > range.endAt.getTime() ? new Date(range.endAt) : lastDay,
    });

    year = nextMonth.year;
    month = nextMonth.month;
  }

  return buckets;
}

function buildTopCustomersFromBookings(
  bookings: Array<{
    customer_id: string;
    grand_total: number;
    customer: { name: string };
  }>,
) {
  const map = new Map<string, TopCustomerRow>();
  for (const booking of bookings) {
    const existing = map.get(booking.customer_id);
    if (existing) {
      existing.bookings += 1;
      existing.spend += booking.grand_total;
      continue;
    }

    map.set(booking.customer_id, {
      customerId: booking.customer_id,
      customerName: booking.customer.name,
      bookings: 1,
      spend: booking.grand_total,
    });
  }

  return [...map.values()].sort((a, b) => b.spend - a.spend).slice(0, 10);
}

function formatMonthLabelFromKey(cohortKey: string) {
  const [yearRaw, monthRaw] = cohortKey.split("-");
  const year = Number.parseInt(yearRaw ?? "1970", 10);
  const month = Number.parseInt(monthRaw ?? "1", 10);
  const date = toPhDate(year, month, 1);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIMEZONE_PH,
    month: "short",
    year: "numeric",
  }).format(date);
}

type CampaignEventValue = {
  event_type:
    | "POST_PUBLISHED"
    | "CLICK_RECORDED"
    | "DM_INQUIRY"
    | "BOOKING_ATTRIBUTED"
    | "PROMO_REDEEMED"
    | "MANUAL_FEEDBACK";
  value: number | null;
  occurred_at: Date;
};

type CampaignEventSummary = {
  published: number;
  clicks: number;
  inquiries: number;
  attributedBookings: number;
  promoRedemptions: number;
};

function createEmptyCampaignEventSummary(): CampaignEventSummary {
  return {
    published: 0,
    clicks: 0,
    inquiries: 0,
    attributedBookings: 0,
    promoRedemptions: 0,
  };
}

function getEventValue(value: number | null | undefined) {
  return typeof value === "number" ? value : 1;
}

function addCampaignEventToSummary(
  summary: CampaignEventSummary,
  event: Pick<CampaignEventValue, "event_type" | "value">,
) {
  const value = getEventValue(event.value);
  if (event.event_type === "POST_PUBLISHED") {
    summary.published += value;
    return;
  }
  if (event.event_type === "CLICK_RECORDED") {
    summary.clicks += value;
    return;
  }
  if (event.event_type === "DM_INQUIRY") {
    summary.inquiries += value;
    return;
  }
  if (event.event_type === "BOOKING_ATTRIBUTED") {
    summary.attributedBookings += value;
    return;
  }
  if (event.event_type === "PROMO_REDEEMED") {
    summary.promoRedemptions += value;
  }
}

function getAttributionScore(summary: CampaignEventSummary) {
  return (
    summary.attributedBookings +
    summary.promoRedemptions * 2 +
    summary.inquiries +
    summary.clicks * 0.2 +
    summary.published * 0.5
  );
}

function getAttributedValue(summary: CampaignEventSummary) {
  return summary.attributedBookings + summary.promoRedemptions;
}

export async function getOverviewReportData({
  businessId,
  range,
  db = prisma,
}: {
  businessId: string;
  range: ReportDateRange;
  db?: PrismaClientLike;
}): Promise<OverviewReportPayload> {
  const [bookings, serviceRows] = await Promise.all([
    db.booking.findMany({
      where: {
        business_id: businessId,
        created_at: {
          gte: range.startAt,
          lte: range.endAt,
        },
      },
      select: {
        id: true,
        customer_id: true,
        status: true,
        grand_total: true,
        amount_paid: true,
        total_discount: true,
        created_at: true,
        customer: {
          select: {
            name: true,
          },
        },
      },
    }),
    db.availedService.findMany({
      where: {
        booking: {
          business_id: businessId,
          created_at: {
            gte: range.startAt,
            lte: range.endAt,
          },
          status: NON_CANCELLED_STATUS,
        },
      },
      select: {
        service_id: true,
        final_price: true,
        estimated_cost: true,
        service: {
          select: {
            name: true,
            category: true,
          },
        },
      },
    }),
  ]);

  const bookedBookings = bookings.filter((booking) => BOOKED_STATUSES.has(booking.status));
  const bookedRevenue = bookedBookings.reduce((sum, booking) => sum + booking.grand_total, 0);
  const collectedRevenue = bookings
    .filter((booking) => booking.status !== "CANCELLED")
    .reduce((sum, booking) => sum + booking.amount_paid, 0);
  const totalDiscount = bookedBookings.reduce((sum, booking) => sum + booking.total_discount, 0);
  const grossBeforeDiscount = bookedBookings.reduce(
    (sum, booking) => sum + booking.grand_total + booking.total_discount,
    0,
  );
  const grossRevenue = serviceRows.reduce((sum, row) => sum + row.final_price, 0);
  const estimatedCost = serviceRows.reduce(
    (sum, row) => sum + (row.estimated_cost ?? 0),
    0,
  );
  const estimatedNetRevenue = grossRevenue - estimatedCost;
  const acceptedOrCompletedCount = bookings.filter(
    (booking) => booking.status === "ACCEPTED" || booking.status === "COMPLETED",
  ).length;
  const completedCount = bookings.filter((booking) => booking.status === "COMPLETED").length;

  const statusBreakdown = {
    hold: bookings.filter((booking) => booking.status === "HOLD").length,
    accepted: bookings.filter((booking) => booking.status === "ACCEPTED").length,
    completed: completedCount,
    cancelled: bookings.filter((booking) => booking.status === "CANCELLED").length,
  };

  const buckets = buildBuckets(range);
  const trendMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      {
        bucketKey: bucket.key,
        label: bucket.label,
        bookings: 0,
        bookedRevenue: 0,
        collectedRevenue: 0,
      },
    ]),
  );

  for (const booking of bookings) {
    const key = bucketKeyForDate(booking.created_at, range.groupBy);
    const trend = trendMap.get(key);
    if (!trend) continue;
    trend.bookings += 1;
    if (BOOKED_STATUSES.has(booking.status)) {
      trend.bookedRevenue += booking.grand_total;
    }
    if (booking.status !== "CANCELLED") {
      trend.collectedRevenue += booking.amount_paid;
    }
  }

  const topServiceMap = new Map<number, TopServiceRow>();
  for (const row of serviceRows) {
    const existing = topServiceMap.get(row.service_id);
    if (existing) {
      existing.revenue += row.final_price;
      existing.timesBooked += 1;
      continue;
    }

    topServiceMap.set(row.service_id, {
      serviceId: row.service_id,
      serviceName: row.service.name,
      category: row.service.category,
      revenue: row.final_price,
      timesBooked: 1,
    });
  }

  return {
    range,
    kpis: {
      bookedRevenue: roundTo(bookedRevenue),
      collectedRevenue: roundTo(collectedRevenue),
      outstandingBalance: roundTo(bookedRevenue - collectedRevenue),
      averageTicket: roundTo(safeDivide(bookedRevenue, bookedBookings.length)),
      discountRate: roundTo(asPercentage(totalDiscount, grossBeforeDiscount)),
      grossRevenue: roundTo(grossRevenue),
      estimatedCost: roundTo(estimatedCost),
      estimatedNetRevenue: roundTo(estimatedNetRevenue),
      estimatedNetMargin: roundTo(asPercentage(estimatedNetRevenue, grossRevenue)),
      completionRate: roundTo(asPercentage(completedCount, acceptedOrCompletedCount)),
      totalBookings: bookings.length,
    },
    bookingVolume: statusBreakdown,
    trend: buckets
      .map((bucket) => trendMap.get(bucket.key))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        ...item,
        bookedRevenue: roundTo(item.bookedRevenue),
        collectedRevenue: roundTo(item.collectedRevenue),
      })),
    topServices: [...topServiceMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((item) => ({
        ...item,
        revenue: roundTo(item.revenue),
      })),
    topCustomers: buildTopCustomersFromBookings(
      bookedBookings.map((booking) => ({
        customer_id: booking.customer_id,
        grand_total: booking.grand_total,
        customer: booking.customer,
      })),
    ).map((item) => ({
      ...item,
      spend: roundTo(item.spend),
    })),
  };
}

export async function getRevenueReportData({
  businessId,
  range,
  db = prisma,
}: {
  businessId: string;
  range: ReportDateRange;
  db?: PrismaClientLike;
}): Promise<RevenueReportPayload> {
  const [bookings, availedServices] = await Promise.all([
    db.booking.findMany({
      where: {
        business_id: businessId,
        created_at: {
          gte: range.startAt,
          lte: range.endAt,
        },
      },
      select: {
        status: true,
        grand_total: true,
        amount_paid: true,
        total_discount: true,
        created_at: true,
        payment_method: true,
      },
    }),
    db.availedService.findMany({
      where: {
        booking: {
          business_id: businessId,
          created_at: {
            gte: range.startAt,
            lte: range.endAt,
          },
          status: NON_CANCELLED_STATUS,
        },
      },
      select: {
        final_price: true,
        estimated_cost: true,
        service: {
          select: {
            category: true,
          },
        },
      },
    }),
  ]);

  const bookedBookings = bookings.filter((booking) => BOOKED_STATUSES.has(booking.status));
  const bookedRevenue = bookedBookings.reduce((sum, booking) => sum + booking.grand_total, 0);
  const collectedRevenue = bookings
    .filter((booking) => booking.status !== "CANCELLED")
    .reduce((sum, booking) => sum + booking.amount_paid, 0);
  const totalDiscount = bookedBookings.reduce((sum, booking) => sum + booking.total_discount, 0);
  const grossBeforeDiscount = bookedBookings.reduce(
    (sum, booking) => sum + booking.grand_total + booking.total_discount,
    0,
  );
  const grossRevenue = availedServices.reduce((sum, row) => sum + row.final_price, 0);
  const estimatedCost = availedServices.reduce(
    (sum, row) => sum + (row.estimated_cost ?? 0),
    0,
  );
  const estimatedNetRevenue = grossRevenue - estimatedCost;

  const buckets = buildBuckets(range);
  const trendMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      {
        bucketKey: bucket.key,
        label: bucket.label,
        bookedRevenue: 0,
        collectedRevenue: 0,
        discount: 0,
        bookingCount: 0,
      },
    ]),
  );

  for (const booking of bookings) {
    const key = bucketKeyForDate(booking.created_at, range.groupBy);
    const bucket = trendMap.get(key);
    if (!bucket) continue;
    if (BOOKED_STATUSES.has(booking.status)) {
      bucket.bookedRevenue += booking.grand_total;
      bucket.discount += booking.total_discount;
      bucket.bookingCount += 1;
    }
    if (booking.status !== "CANCELLED") {
      bucket.collectedRevenue += booking.amount_paid;
    }
  }

  const categoryMap = new Map<string, { category: string; revenue: number; bookings: number }>();
  for (const row of availedServices) {
    const category = row.service.category || "Uncategorized";
    const existing = categoryMap.get(category);
    if (existing) {
      existing.revenue += row.final_price;
      existing.bookings += 1;
      continue;
    }
    categoryMap.set(category, {
      category,
      revenue: row.final_price,
      bookings: 1,
    });
  }

  const paymentMixMap = new Map<string, { method: string; bookings: number; collectedRevenue: number }>();
  for (const booking of bookings) {
    const method = booking.payment_method;
    const existing = paymentMixMap.get(method);
    if (existing) {
      existing.bookings += 1;
      existing.collectedRevenue += booking.status === "CANCELLED" ? 0 : booking.amount_paid;
      continue;
    }
    paymentMixMap.set(method, {
      method,
      bookings: 1,
      collectedRevenue: booking.status === "CANCELLED" ? 0 : booking.amount_paid,
    });
  }

  return {
    range,
    kpis: {
      bookedRevenue: roundTo(bookedRevenue),
      collectedRevenue: roundTo(collectedRevenue),
      outstandingBalance: roundTo(bookedRevenue - collectedRevenue),
      averageTicket: roundTo(safeDivide(bookedRevenue, bookedBookings.length)),
      discountRate: roundTo(asPercentage(totalDiscount, grossBeforeDiscount)),
      grossRevenue: roundTo(grossRevenue),
      estimatedCost: roundTo(estimatedCost),
      estimatedNetRevenue: roundTo(estimatedNetRevenue),
      estimatedNetMargin: roundTo(asPercentage(estimatedNetRevenue, grossRevenue)),
    },
    trend: buckets
      .map((bucket) => trendMap.get(bucket.key))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        bucketKey: item.bucketKey,
        label: item.label,
        bookedRevenue: roundTo(item.bookedRevenue),
        collectedRevenue: roundTo(item.collectedRevenue),
        discount: roundTo(item.discount),
        averageTicket: roundTo(safeDivide(item.bookedRevenue, item.bookingCount)),
      })),
    topCategories: [...categoryMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((item) => ({
        ...item,
        revenue: roundTo(item.revenue),
      })),
    paymentMix: [...paymentMixMap.values()]
      .sort((a, b) => b.collectedRevenue - a.collectedRevenue)
      .map((item) => ({
        ...item,
        collectedRevenue: roundTo(item.collectedRevenue),
      })),
  };
}

export async function getCustomersReportData({
  businessId,
  range,
  db = prisma,
}: {
  businessId: string;
  range: ReportDateRange;
  db?: PrismaClientLike;
}): Promise<CustomersReportPayload> {
  const [newCustomers, rangeBookings, completedBookings] = await Promise.all([
    db.customer.findMany({
      where: {
        business_id: businessId,
        created_at: {
          gte: range.startAt,
          lte: range.endAt,
        },
      },
      select: {
        id: true,
        name: true,
        created_at: true,
      },
    }),
    db.booking.findMany({
      where: {
        business_id: businessId,
        created_at: {
          gte: range.startAt,
          lte: range.endAt,
        },
        status: NON_CANCELLED_STATUS,
      },
      select: {
        customer_id: true,
        grand_total: true,
        created_at: true,
        customer: {
          select: {
            name: true,
          },
        },
      },
    }),
    db.booking.findMany({
      where: {
        business_id: businessId,
        status: "COMPLETED",
        created_at: {
          lte: range.endAt,
        },
      },
      select: {
        customer_id: true,
        created_at: true,
      },
      orderBy: [
        {
          customer_id: "asc",
        },
        {
          created_at: "asc",
        },
      ],
    }),
  ]);

  const bookingsByCustomer = new Map<string, number>();
  const topCustomerRows = buildTopCustomersFromBookings(rangeBookings).map((item) => ({
    ...item,
    spend: roundTo(item.spend),
  }));

  for (const booking of rangeBookings) {
    const current = bookingsByCustomer.get(booking.customer_id) ?? 0;
    bookingsByCustomer.set(booking.customer_id, current + 1);
  }

  const activeCustomers = bookingsByCustomer.size;
  const repeatCustomers = [...bookingsByCustomer.values()].filter((count) => count >= 2).length;

  const buckets = buildBuckets(range);
  const trendMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      {
        bucketKey: bucket.key,
        label: bucket.label,
        newCustomers: 0,
        activeCustomersSet: new Set<string>(),
        repeatCounter: new Map<string, number>(),
      },
    ]),
  );

  for (const customer of newCustomers) {
    const key = bucketKeyForDate(customer.created_at, range.groupBy);
    const bucket = trendMap.get(key);
    if (!bucket) continue;
    bucket.newCustomers += 1;
  }

  for (const booking of rangeBookings) {
    const key = bucketKeyForDate(booking.created_at, range.groupBy);
    const bucket = trendMap.get(key);
    if (!bucket) continue;
    bucket.activeCustomersSet.add(booking.customer_id);
    bucket.repeatCounter.set(
      booking.customer_id,
      (bucket.repeatCounter.get(booking.customer_id) ?? 0) + 1,
    );
  }

  const completedByCustomer = new Map<string, Date[]>();
  for (const booking of completedBookings) {
    const list = completedByCustomer.get(booking.customer_id) ?? [];
    list.push(booking.created_at);
    completedByCustomer.set(booking.customer_id, list);
  }

  const eligibleRebookingCustomers = new Set<string>();
  const rebookedWithin45Customers = new Set<string>();
  const lastCompletedAtByCustomer = new Map<string, Date>();

  for (const [customerId, dates] of completedByCustomer.entries()) {
    for (let index = 0; index < dates.length; index += 1) {
      const current = dates[index];
      if (current.getTime() >= range.startAt.getTime() && current.getTime() <= range.endAt.getTime()) {
        eligibleRebookingCustomers.add(customerId);
        const next = dates[index + 1];
        if (next && next.getTime() - current.getTime() <= 45 * DAY_MS) {
          rebookedWithin45Customers.add(customerId);
        }
      }
    }

    const last = dates[dates.length - 1];
    if (last) {
      lastCompletedAtByCustomer.set(customerId, last);
    }
  }

  const atRiskCutoff = new Date(range.endAt.getTime() - 60 * DAY_MS);
  const atRiskCustomers60d = [...lastCompletedAtByCustomer.values()].filter(
    (lastCompletedAt) => lastCompletedAt.getTime() < atRiskCutoff.getTime(),
  ).length;

  return {
    range,
    kpis: {
      newCustomers: newCustomers.length,
      activeCustomers,
      repeatCustomers,
      repeatCustomerRate: roundTo(asPercentage(repeatCustomers, activeCustomers)),
      rebookingWithin45Rate: roundTo(
        asPercentage(rebookedWithin45Customers.size, eligibleRebookingCustomers.size),
      ),
      atRiskCustomers60d,
    },
    trend: buckets
      .map((bucket) => trendMap.get(bucket.key))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        bucketKey: item.bucketKey,
        label: item.label,
        newCustomers: item.newCustomers,
        activeCustomers: item.activeCustomersSet.size,
        repeatCustomers: [...item.repeatCounter.values()].filter((count) => count >= 2).length,
      })),
    topCustomers: topCustomerRows,
  };
}

function buildStaffPerformanceRows({
  serviceRows,
  employeeNamesById,
  ownerNamesById,
}: {
  serviceRows: Array<{
    served_by_id: number | null;
    served_by_owner_id: number | null;
    final_price: number;
  }>;
  employeeNamesById: Map<number, string>;
  ownerNamesById: Map<number, string>;
}) {
  const performanceMap = new Map<string, StaffPerformanceRow>();

  for (const row of serviceRows) {
    if (row.served_by_id) {
      const key = `EMPLOYEE:${row.served_by_id}`;
      const current = performanceMap.get(key);
      if (current) {
        current.completedServices += 1;
        current.revenueContribution += row.final_price;
      } else {
        performanceMap.set(key, {
          providerId: String(row.served_by_id),
          providerType: "EMPLOYEE",
          providerName: employeeNamesById.get(row.served_by_id) ?? `Employee ${row.served_by_id}`,
          completedServices: 1,
          revenueContribution: row.final_price,
        });
      }
      continue;
    }

    if (row.served_by_owner_id) {
      const key = `OWNER:${row.served_by_owner_id}`;
      const current = performanceMap.get(key);
      if (current) {
        current.completedServices += 1;
        current.revenueContribution += row.final_price;
      } else {
        performanceMap.set(key, {
          providerId: String(row.served_by_owner_id),
          providerType: "OWNER",
          providerName: ownerNamesById.get(row.served_by_owner_id) ?? `Owner ${row.served_by_owner_id}`,
          completedServices: 1,
          revenueContribution: row.final_price,
        });
      }
    }
  }

  return [...performanceMap.values()]
    .sort((a, b) => b.revenueContribution - a.revenueContribution)
    .map((row) => ({
      ...row,
      revenueContribution: roundTo(row.revenueContribution),
    }));
}

export async function getOperationsReportData({
  businessId,
  range,
  db = prisma,
}: {
  businessId: string;
  range: ReportDateRange;
  db?: PrismaClientLike;
}): Promise<OperationsReportPayload> {
  const nowPH = getCurrentDateTimePH();
  const pendingAgeAnchor =
    range.endAt.getTime() < nowPH.getTime() ? range.endAt : nowPH;

  const [completedServices, pendingServices, payrollRows, collectedBookings] = await Promise.all([
    db.availedService.findMany({
      where: {
        booking: {
          business_id: businessId,
        },
        status: "COMPLETED",
        completed_at: {
          gte: range.startAt,
          lte: range.endAt,
        },
      },
      select: {
        completed_at: true,
        served_by_id: true,
        served_by_owner_id: true,
        final_price: true,
      },
    }),
    db.availedService.findMany({
      where: {
        booking: {
          business_id: businessId,
          status: "ACCEPTED",
        },
        status: "PENDING",
      },
      select: {
        created_at: true,
      },
    }),
    db.payslip.findMany({
      where: {
        status: "PAID",
        employee: {
          business_id: businessId,
        },
        ending_date: {
          gte: range.startAt,
          lte: range.endAt,
        },
      },
      select: {
        total_salary: true,
        ending_date: true,
      },
    }),
    db.booking.findMany({
      where: {
        business_id: businessId,
        status: NON_CANCELLED_STATUS,
        created_at: {
          gte: range.startAt,
          lte: range.endAt,
        },
      },
      select: {
        amount_paid: true,
      },
    }),
  ]);

  const employeeIds = [
    ...new Set(
      completedServices
        .map((row) => row.served_by_id)
        .filter((value): value is number => typeof value === "number"),
    ),
  ];
  const ownerIds = [
    ...new Set(
      completedServices
        .map((row) => row.served_by_owner_id)
        .filter((value): value is number => typeof value === "number"),
    ),
  ];

  const [employees, owners] = await Promise.all([
    employeeIds.length
      ? db.employee.findMany({
          where: {
            id: {
              in: employeeIds,
            },
          },
          select: {
            id: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    ownerIds.length
      ? db.owner.findMany({
          where: {
            id: {
              in: ownerIds,
            },
          },
          select: {
            id: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const employeeNamesById = new Map(employees.map((employee) => [employee.id, employee.user.name]));
  const ownerNamesById = new Map(owners.map((owner) => [owner.id, owner.user.name]));

  const payrollTotal = payrollRows.reduce((sum, row) => sum + row.total_salary, 0);
  const collectedRevenue = collectedBookings.reduce((sum, booking) => sum + booking.amount_paid, 0);
  const pendingAges = pendingServices.map((service) =>
    (pendingAgeAnchor.getTime() - service.created_at.getTime()) / (60 * 60 * 1000),
  );

  const buckets = buildBuckets(range);
  const trendMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      {
        bucketKey: bucket.key,
        label: bucket.label,
        completedServices: 0,
        payroll: 0,
      },
    ]),
  );

  for (const row of completedServices) {
    if (!row.completed_at) continue;
    const key = bucketKeyForDate(row.completed_at, range.groupBy);
    const bucket = trendMap.get(key);
    if (!bucket) continue;
    bucket.completedServices += 1;
  }

  for (const row of payrollRows) {
    const key = bucketKeyForDate(row.ending_date, range.groupBy);
    const bucket = trendMap.get(key);
    if (!bucket) continue;
    bucket.payroll += row.total_salary;
  }

  const staffPerformance = buildStaffPerformanceRows({
    serviceRows: completedServices.map((row) => ({
      served_by_id: row.served_by_id,
      served_by_owner_id: row.served_by_owner_id,
      final_price: row.final_price,
    })),
    employeeNamesById,
    ownerNamesById,
  }).slice(0, 15);

  return {
    range,
    kpis: {
      completedServices: completedServices.length,
      staffContributors: staffPerformance.length,
      payrollTotal: roundTo(payrollTotal),
      payrollRatio: roundTo(asPercentage(payrollTotal, collectedRevenue)),
      pendingQueueCount: pendingServices.length,
      medianPendingAgeHours: roundTo(median(pendingAges)),
    },
    trend: buckets
      .map((bucket) => trendMap.get(bucket.key))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        ...item,
        payroll: roundTo(item.payroll),
      })),
    staffPerformance,
  };
}

export async function getCohortsReportData({
  businessId,
  range,
  db = prisma,
}: {
  businessId: string;
  range: ReportDateRange;
  db?: PrismaClientLike;
}): Promise<CohortsReportPayload> {
  const bookings = await db.booking.findMany({
    where: {
      business_id: businessId,
      status: NON_CANCELLED_STATUS,
      created_at: {
        lte: range.endAt,
      },
    },
    select: {
      customer_id: true,
      created_at: true,
      grand_total: true,
    },
    orderBy: [
      {
        customer_id: "asc",
      },
      {
        created_at: "asc",
      },
    ],
  });

  const bookingsByCustomer = new Map<
    string,
    Array<{
      customer_id: string;
      created_at: Date;
      grand_total: number;
    }>
  >();

  for (const booking of bookings) {
    const customerBookings = bookingsByCustomer.get(booking.customer_id) ?? [];
    customerBookings.push(booking);
    bookingsByCustomer.set(booking.customer_id, customerBookings);
  }

  const cohortRows = new Map<
    string,
    {
      cohortKey: string;
      cohortLabel: string;
      cohortDate: Date;
      customers: number;
      retained30d: number;
      retained60d: number;
      revenue: number;
    }
  >();

  for (const customerBookings of bookingsByCustomer.values()) {
    const firstBooking = customerBookings[0];
    if (!firstBooking) continue;
    if (firstBooking.created_at.getTime() < range.startAt.getTime()) continue;
    if (firstBooking.created_at.getTime() > range.endAt.getTime()) continue;

    const cohortKey = monthKey(firstBooking.created_at);
    const existing = cohortRows.get(cohortKey);
    const row =
      existing ??
      (() => {
        const [yearRaw, monthRaw] = cohortKey.split("-");
        const year = Number.parseInt(yearRaw ?? "1970", 10);
        const month = Number.parseInt(monthRaw ?? "1", 10);
        const initial = {
          cohortKey,
          cohortLabel: formatMonthLabelFromKey(cohortKey),
          cohortDate: toPhDate(year, month, 1),
          customers: 0,
          retained30d: 0,
          retained60d: 0,
          revenue: 0,
        };
        cohortRows.set(cohortKey, initial);
        return initial;
      })();

    row.customers += 1;

    const customerRevenueInRange = customerBookings.reduce((sum, booking) => {
      if (
        booking.created_at.getTime() < range.startAt.getTime() ||
        booking.created_at.getTime() > range.endAt.getTime()
      ) {
        return sum;
      }
      return sum + booking.grand_total;
    }, 0);
    row.revenue += customerRevenueInRange;

    let retained30d = false;
    let retained60d = false;
    for (let index = 1; index < customerBookings.length; index += 1) {
      const repeatBooking = customerBookings[index];
      if (!repeatBooking) continue;
      const deltaDays =
        (repeatBooking.created_at.getTime() - firstBooking.created_at.getTime()) / DAY_MS;

      if (deltaDays <= 30) retained30d = true;
      if (deltaDays <= 60) retained60d = true;
      if (deltaDays > 60) break;
    }

    if (retained30d) row.retained30d += 1;
    if (retained60d) row.retained60d += 1;
  }

  const normalizedCohorts = [...cohortRows.values()]
    .sort((a, b) => a.cohortDate.getTime() - b.cohortDate.getTime())
    .map((row) => ({
      cohortKey: row.cohortKey,
      cohortLabel: row.cohortLabel,
      customers: row.customers,
      retained30d: row.retained30d,
      retained60d: row.retained60d,
      retention30dRate: roundTo(asPercentage(row.retained30d, row.customers)),
      retention60dRate: roundTo(asPercentage(row.retained60d, row.customers)),
      revenue: roundTo(row.revenue),
    }));

  const cohortCustomers = normalizedCohorts.reduce((sum, row) => sum + row.customers, 0);
  const retainedCustomers30d = normalizedCohorts.reduce((sum, row) => sum + row.retained30d, 0);
  const retainedCustomers60d = normalizedCohorts.reduce((sum, row) => sum + row.retained60d, 0);
  const cohortRevenue = normalizedCohorts.reduce((sum, row) => sum + row.revenue, 0);

  return {
    range,
    kpis: {
      cohortCustomers,
      retainedCustomers30d,
      retainedCustomers60d,
      retention30dRate: roundTo(asPercentage(retainedCustomers30d, cohortCustomers)),
      retention60dRate: roundTo(asPercentage(retainedCustomers60d, cohortCustomers)),
      cohortRevenue: roundTo(cohortRevenue),
    },
    trend: normalizedCohorts.map((row) => ({
      bucketKey: row.cohortKey,
      label: row.cohortLabel,
      customers: row.customers,
      retention30dRate: row.retention30dRate,
      retention60dRate: row.retention60dRate,
      revenue: row.revenue,
    })),
    cohorts: [...normalizedCohorts]
      .sort((a, b) => b.revenue - a.revenue || b.customers - a.customers)
      .slice(0, 12),
  };
}

export async function getAttributionReportData({
  businessId,
  range,
  db = prisma,
}: {
  businessId: string;
  range: ReportDateRange;
  db?: PrismaClientLike;
}): Promise<AttributionReportPayload> {
  const campaigns = await db.campaign.findMany({
    where: {
      business_id: businessId,
      created_at: {
        gte: range.startAt,
        lte: range.endAt,
      },
    },
    select: {
      id: true,
      created_at: true,
      status: true,
      offer_type: true,
      opportunity: {
        select: {
          type: true,
        },
      },
      events: {
        where: {
          occurred_at: {
            gte: range.startAt,
            lte: range.endAt,
          },
        },
        select: {
          event_type: true,
          value: true,
          occurred_at: true,
        },
      },
    },
  });

  const buckets = buildBuckets(range);
  const trendMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      {
        bucketKey: bucket.key,
        label: bucket.label,
        campaigns: 0,
        clicks: 0,
        inquiries: 0,
        attributedBookings: 0,
        promoRedemptions: 0,
        attributionScore: 0,
      },
    ]),
  );

  const segmentMap = new Map<
    string,
    {
      segmentType: "OPPORTUNITY_TYPE" | "OFFER_TYPE";
      segment: string;
      campaigns: number;
      publishedCampaigns: number;
      attributedBookings: number;
      promoRedemptions: number;
      attributionScore: number;
    }
  >();

  const totals = {
    publishedCampaigns: 0,
    clicks: 0,
    inquiries: 0,
    attributedBookings: 0,
    promoRedemptions: 0,
    attributionScore: 0,
  };

  for (const campaign of campaigns) {
    const campaignBucket = trendMap.get(bucketKeyForDate(campaign.created_at, range.groupBy));
    if (campaignBucket) {
      campaignBucket.campaigns += 1;
    }

    const campaignSummary = createEmptyCampaignEventSummary();

    for (const event of campaign.events) {
      addCampaignEventToSummary(campaignSummary, event);

      const trendBucket = trendMap.get(bucketKeyForDate(event.occurred_at, range.groupBy));
      if (!trendBucket) continue;

      if (event.event_type === "CLICK_RECORDED") {
        const value = getEventValue(event.value);
        trendBucket.clicks += value;
        trendBucket.attributionScore += value * 0.2;
        continue;
      }
      if (event.event_type === "DM_INQUIRY") {
        const value = getEventValue(event.value);
        trendBucket.inquiries += value;
        trendBucket.attributionScore += value;
        continue;
      }
      if (event.event_type === "BOOKING_ATTRIBUTED") {
        const value = getEventValue(event.value);
        trendBucket.attributedBookings += value;
        trendBucket.attributionScore += value;
        continue;
      }
      if (event.event_type === "PROMO_REDEEMED") {
        const value = getEventValue(event.value);
        trendBucket.promoRedemptions += value;
        trendBucket.attributionScore += value * 2;
        continue;
      }
      if (event.event_type === "POST_PUBLISHED") {
        const value = getEventValue(event.value);
        trendBucket.attributionScore += value * 0.5;
      }
    }

    const isPublishedCampaign =
      campaign.status === "PUBLISHED" || campaignSummary.published > 0;
    if (isPublishedCampaign) {
      totals.publishedCampaigns += 1;
    }

    totals.clicks += campaignSummary.clicks;
    totals.inquiries += campaignSummary.inquiries;
    totals.attributedBookings += campaignSummary.attributedBookings;
    totals.promoRedemptions += campaignSummary.promoRedemptions;
    totals.attributionScore += getAttributionScore(campaignSummary);

    const segmentInputs: Array<{
      segmentType: "OPPORTUNITY_TYPE" | "OFFER_TYPE";
      segment: string;
    }> = [
      {
        segmentType: "OPPORTUNITY_TYPE",
        segment: campaign.opportunity.type,
      },
      {
        segmentType: "OFFER_TYPE",
        segment: campaign.offer_type,
      },
    ];

    for (const segmentInput of segmentInputs) {
      const key = `${segmentInput.segmentType}:${segmentInput.segment}`;
      const existing = segmentMap.get(key);
      if (existing) {
        existing.campaigns += 1;
        existing.publishedCampaigns += isPublishedCampaign ? 1 : 0;
        existing.attributedBookings += campaignSummary.attributedBookings;
        existing.promoRedemptions += campaignSummary.promoRedemptions;
        existing.attributionScore += getAttributionScore(campaignSummary);
      } else {
        segmentMap.set(key, {
          segmentType: segmentInput.segmentType,
          segment: segmentInput.segment,
          campaigns: 1,
          publishedCampaigns: isPublishedCampaign ? 1 : 0,
          attributedBookings: campaignSummary.attributedBookings,
          promoRedemptions: campaignSummary.promoRedemptions,
          attributionScore: getAttributionScore(campaignSummary),
        });
      }
    }
  }

  return {
    range,
    kpis: {
      campaigns: campaigns.length,
      publishedCampaigns: totals.publishedCampaigns,
      clicks: roundTo(totals.clicks),
      inquiries: roundTo(totals.inquiries),
      attributedBookings: roundTo(totals.attributedBookings),
      promoRedemptions: roundTo(totals.promoRedemptions),
      attributionScore: roundTo(totals.attributionScore),
      bookingsPerPublishedCampaign: roundTo(
        asPercentage(totals.attributedBookings, totals.publishedCampaigns),
      ),
    },
    trend: buckets
      .map((bucket) => trendMap.get(bucket.key))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        ...item,
        clicks: roundTo(item.clicks),
        inquiries: roundTo(item.inquiries),
        attributedBookings: roundTo(item.attributedBookings),
        promoRedemptions: roundTo(item.promoRedemptions),
        attributionScore: roundTo(item.attributionScore),
      })),
    topSegments: [...segmentMap.values()]
      .sort((a, b) => b.attributionScore - a.attributionScore)
      .slice(0, 12)
      .map((row) => ({
        ...row,
        attributedBookings: roundTo(row.attributedBookings),
        promoRedemptions: roundTo(row.promoRedemptions),
        attributionScore: roundTo(row.attributionScore),
      })),
  };
}

export async function getOpportunityRoiReportData({
  businessId,
  range,
  db = prisma,
}: {
  businessId: string;
  range: ReportDateRange;
  db?: PrismaClientLike;
}): Promise<OpportunityRoiReportPayload> {
  const [opportunities, collectedBookings] = await Promise.all([
    db.opportunity.findMany({
      where: {
        business_id: businessId,
        created_at: {
          gte: range.startAt,
          lte: range.endAt,
        },
      },
      select: {
        id: true,
        type: true,
        status: true,
        total_score: true,
        created_at: true,
        campaigns: {
          select: {
            events: {
              where: {
                occurred_at: {
                  gte: range.startAt,
                  lte: range.endAt,
                },
              },
              select: {
                event_type: true,
                value: true,
                occurred_at: true,
              },
            },
          },
        },
      },
    }),
    db.booking.findMany({
      where: {
        business_id: businessId,
        status: NON_CANCELLED_STATUS,
        created_at: {
          gte: range.startAt,
          lte: range.endAt,
        },
      },
      select: {
        amount_paid: true,
      },
    }),
  ]);

  const buckets = buildBuckets(range);
  const trendMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      {
        bucketKey: bucket.key,
        label: bucket.label,
        opportunities: 0,
        convertedOpportunities: 0,
        totalScore: 0,
        scoreCount: 0,
        attributedValue: 0,
      },
    ]),
  );

  const segmentMap = new Map<
    string,
    {
      opportunityType: string;
      opportunities: number;
      convertedOpportunities: number;
      totalScore: number;
      scoreCount: number;
      attributedValue: number;
    }
  >();

  let convertedOpportunities = 0;
  let totalScore = 0;
  let attributedValue = 0;

  for (const opportunity of opportunities) {
    const summary = createEmptyCampaignEventSummary();
    for (const campaign of opportunity.campaigns) {
      for (const event of campaign.events) {
        addCampaignEventToSummary(summary, event);
      }
    }

    const opportunityAttributedValue = getAttributedValue(summary);
    const isConverted =
      opportunity.status === "CONVERTED" || opportunity.campaigns.length > 0;
    const scorePercent = opportunity.total_score * 100;

    if (isConverted) {
      convertedOpportunities += 1;
    }
    totalScore += scorePercent;
    attributedValue += opportunityAttributedValue;

    const trendBucket = trendMap.get(bucketKeyForDate(opportunity.created_at, range.groupBy));
    if (trendBucket) {
      trendBucket.opportunities += 1;
      trendBucket.convertedOpportunities += isConverted ? 1 : 0;
      trendBucket.totalScore += scorePercent;
      trendBucket.scoreCount += 1;
      trendBucket.attributedValue += opportunityAttributedValue;
    }

    const segment = segmentMap.get(opportunity.type);
    if (segment) {
      segment.opportunities += 1;
      segment.convertedOpportunities += isConverted ? 1 : 0;
      segment.totalScore += scorePercent;
      segment.scoreCount += 1;
      segment.attributedValue += opportunityAttributedValue;
    } else {
      segmentMap.set(opportunity.type, {
        opportunityType: opportunity.type,
        opportunities: 1,
        convertedOpportunities: isConverted ? 1 : 0,
        totalScore: scorePercent,
        scoreCount: 1,
        attributedValue: opportunityAttributedValue,
      });
    }
  }

  const baselineCollectedRevenue = collectedBookings.reduce(
    (sum, booking) => sum + booking.amount_paid,
    0,
  );

  return {
    range,
    kpis: {
      opportunities: opportunities.length,
      convertedOpportunities,
      conversionRate: roundTo(asPercentage(convertedOpportunities, opportunities.length)),
      averageOpportunityScore: roundTo(safeDivide(totalScore, opportunities.length)),
      attributedValue: roundTo(attributedValue),
      baselineCollectedRevenue: roundTo(baselineCollectedRevenue),
      upliftVsBaselineRate: roundTo(
        asPercentage(attributedValue, baselineCollectedRevenue),
      ),
    },
    trend: buckets
      .map((bucket) => trendMap.get(bucket.key))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        bucketKey: item.bucketKey,
        label: item.label,
        opportunities: item.opportunities,
        convertedOpportunities: item.convertedOpportunities,
        averageScore: roundTo(safeDivide(item.totalScore, item.scoreCount)),
        attributedValue: roundTo(item.attributedValue),
      })),
    topOpportunities: [...segmentMap.values()]
      .sort((a, b) => b.attributedValue - a.attributedValue || b.opportunities - a.opportunities)
      .slice(0, 12)
      .map((row) => ({
        opportunityType: row.opportunityType,
        opportunities: row.opportunities,
        convertedOpportunities: row.convertedOpportunities,
        conversionRate: roundTo(
          asPercentage(row.convertedOpportunities, row.opportunities),
        ),
        averageScore: roundTo(safeDivide(row.totalScore, row.scoreCount)),
        attributedValue: roundTo(row.attributedValue),
      })),
  };
}

export async function getAdvancedReportPayload({
  tab,
  businessId,
  range,
  db = prisma,
}: {
  tab: AdvancedReportTab;
  businessId: string;
  range: ReportDateRange;
  db?: PrismaClientLike;
}): Promise<AdvancedReportPayloadMap[AdvancedReportTab]> {
  if (tab === "cohorts") {
    return getCohortsReportData({ businessId, range, db });
  }
  if (tab === "attribution") {
    return getAttributionReportData({ businessId, range, db });
  }
  return getOpportunityRoiReportData({ businessId, range, db });
}

export async function getCoreReportPayload({
  tab,
  businessId,
  range,
  db = prisma,
}: {
  tab: CoreReportTab;
  businessId: string;
  range: ReportDateRange;
  db?: PrismaClientLike;
}): Promise<ReportPayloadMap[CoreReportTab]> {
  if (tab === "overview") {
    return getOverviewReportData({ businessId, range, db });
  }
  if (tab === "revenue") {
    return getRevenueReportData({ businessId, range, db });
  }
  if (tab === "customers") {
    return getCustomersReportData({ businessId, range, db });
  }
  return getOperationsReportData({ businessId, range, db });
}
