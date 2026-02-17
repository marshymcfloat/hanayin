import { describe, expect, it } from "vitest";

import { serializeReportCsv } from "@/lib/services/reports/csv";
import type { OverviewReportPayload } from "@/lib/types/reports";

const baseOverviewPayload: OverviewReportPayload = {
  range: {
    preset: "30d",
    start: "2026-01-20",
    end: "2026-02-18",
    startAt: new Date("2026-01-20T00:00:00.000Z"),
    endAt: new Date("2026-02-18T23:59:59.999Z"),
    spanDays: 30,
    label: "Last 30 days",
    groupBy: "day",
    isCustom: false,
  },
  kpis: {
    bookedRevenue: 37444.12,
    collectedRevenue: 33193.12,
    outstandingBalance: 4251,
    averageTicket: 1497.76,
    discountRate: 1.77,
    grossRevenue: 37544.12,
    estimatedCost: 12198.4,
    estimatedNetRevenue: 25345.72,
    estimatedNetMargin: 67.51,
    completionRate: 95.83,
    totalBookings: 28,
  },
  bookingVolume: {
    hold: 1,
    accepted: 1,
    completed: 23,
    cancelled: 3,
  },
  trend: [
    {
      bucketKey: "2026-02-11",
      label: "Feb-11",
      bookings: 4,
      bookedRevenue: 3038,
      collectedRevenue: 3038,
    },
  ],
  topServices: [
    {
      serviceId: 101,
      serviceName: "Hydraderma Facial",
      category: "Skin",
      revenue: 8820,
      timesBooked: 6,
    },
  ],
  topCustomers: [
    {
      customerId: "cust_1",
      customerName: "Customer 3",
      bookings: 2,
      spend: 3745,
    },
  ],
};

describe("serializeReportCsv (overview)", () => {
  it("emits owner-friendly overview rows with consistent columns", () => {
    const csv = serializeReportCsv("overview", baseOverviewPayload);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Section,Item,Metric,Value,Unit,Date,Start Date,End Date");
    expect(csv).toContain("Summary,Overview,Booked Revenue,37444.12,Currency,,2026-01-20,2026-02-18");
    expect(csv).toContain("Booking Volume,Overview,Completed,23,Count,,2026-01-20,2026-02-18");
    expect(csv).toContain("Daily Trend,Feb-11,Bookings,4,Count,2026-02-11,2026-01-20,2026-02-18");
    expect(csv).toContain("Top Services,Hydraderma Facial,Revenue,8820,Currency,,2026-01-20,2026-02-18");
    expect(csv).toContain("Top Customers,Customer 3,Total Spend,3745,Currency,,2026-01-20,2026-02-18");
  });

  it("escapes comma and quote characters in item names", () => {
    const csv = serializeReportCsv("overview", {
      ...baseOverviewPayload,
      topCustomers: [
        {
          customerId: "cust_2",
          customerName: 'Jane "J", Doe',
          bookings: 1,
          spend: 900,
        },
      ],
    });

    expect(csv).toContain(
      'Top Customers,"Jane ""J"", Doe",Total Bookings,1,Count,,2026-01-20,2026-02-18',
    );
  });
});
