import type { OwnerDashboardStudyProps } from "@/components/dashboard/design-study/OwnerDashboardStudy";
import type { OwnerRedesignPeriod } from "@/features/dashboard/types/owner-redesign";
export function dashboardProps(): OwnerDashboardStudyProps & Required<Pick<OwnerDashboardStudyProps, "analytics" | "today" | "queueData" | "growth">> {
  const period: OwnerRedesignPeriod = { range: "Oct 2–8, 2026", labels: ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"], revenue: [0, 0, 0, 0, 0, 0, 280.75], bookings: [0, 0, 0, 0, 0, 0, 1], topServices: [{ id: 1, name: "Gel manicure", revenue: 280.75 }], staff: [{ id: "employee:1", name: "Alex", count: 1, revenue: 280.75 }], topCustomers: [{ id: "c1", name: "Sofia M.", visits: 1, amount: 280.75 }] };
  return {
    analytics: { generatedAt: "2026-10-08T04:00:00Z", business: { name: "Test Studio", slug: "test-studio" }, summary: { revenue: 280.75, previousRevenue: 200, bookings: 1, previousBookings: 2, customers: 1, visits: 1, average: 280.75 }, periods: { Week: period, Month: { ...period, range: "October 2026" }, Year: { ...period, range: "Last 12 months", revenue: [500], bookings: [8], labels: ["Oct"] } }, expenses: [{ label: "Supplies", amount: 250.50 }] },
    today: { generatedAt: "2026-10-08T04:00:00Z", bookings: [{ id: 1, time: "10:00", customer: "Sofia M.", service: "Gel manicure", staff: "Alex", status: "In service", phone: null, duration: "1h", total: 280.75, deposit: 0 }] },
    queueData: { queue: [{ id: 1, service: "Gel manicure", customer: "Sofia M.", time: "10:00", price: 280.75, status: "PENDING" }] },
    growth: { enabled: true, opportunity: null, occupancy: null }, pending: false, refreshing: false, refreshError: false,
    onRefresh: () => {}, onBooking: () => {}, onQueueAction: async () => ({ success: true }), onExpense: async () => ({ success: true }),
  };
}
