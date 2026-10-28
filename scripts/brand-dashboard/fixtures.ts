import type { OwnerDashboardStudyProps } from "@/components/dashboard/design-study/OwnerDashboardStudy";
import type { OwnerRedesignPeriod } from "@/features/dashboard/types/owner-redesign";

const topServices = [
  { id: 1, name: "Cut & style", revenue: 16800 },
  { id: 2, name: "Hair colour", revenue: 14400 },
  { id: 3, name: "Gel manicure", revenue: 8400 },
  { id: 4, name: "Scalp treatment", revenue: 7200 },
];
const staff = [
  { id: "employee:1", name: "Mira Reyes", count: 32, revenue: 18600 },
  { id: "employee:2", name: "Jules Santos", count: 28, revenue: 16800 },
  { id: "employee:3", name: "Rae Cruz", count: 18, revenue: 11400 },
];
const topCustomers = [
  { id: "sample-1", name: "Sofia M.", visits: 3, amount: 3600 },
  { id: "sample-2", name: "Camille D.", visits: 2, amount: 2400 },
  { id: "sample-3", name: "Alex R.", visits: 2, amount: 1800 },
];
const period: OwnerRedesignPeriod = {
  range: "Oct 3–9, 2026", labels: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
  revenue: [7200, 5400, 3600, 6600, 4800, 7800, 8400], bookings: [12, 10, 7, 12, 9, 14, 16],
  topServices, staff, topCustomers,
};
const generatedAt = "2026-10-09T04:00:00Z";
const business = { name: "Luna Studio", slug: "fictional-luna-studio" };

export const captureProps: OwnerDashboardStudyProps = {
  business, ownerName: "Andrea Lim", pending: false, refreshError: false,
  analytics: {
    business, generatedAt,
    summary: { revenue: 46800, previousRevenue: 39000, bookings: 86, previousBookings: 73, customers: 64, visits: 78, average: 600 },
    periods: {
      Week: period,
      Month: { ...period, range: "October 2026", labels: ["Oct 1", "Oct 2", "Oct 3", "Oct 4", "Oct 5", "Oct 6", "Oct 7", "Oct 8", "Oct 9"], revenue: [1200, 1800, ...period.revenue], bookings: [2, 4, ...period.bookings] },
      Year: { ...period, range: "2026 to date", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"], revenue: [98400, 102600, 117000, 111600, 125400, 132000, 128400, 140400, 144600, 46800], bookings: [172, 181, 208, 198, 218, 229, 226, 241, 248, 86] },
    },
    expenses: [{ label: "Supplies", amount: 4200 }, { label: "Utilities", amount: 1800 }, { label: "Rent", amount: 12000 }],
  },
  today: { generatedAt, bookings: [
    { id: 1, time: "10:00 AM", customer: "Sofia Mendoza", service: "Cut & style", staff: "Mira Reyes", status: "In service", duration: "45 min", total: 600, deposit: 0, phone: null },
    { id: 2, time: "10:30 AM", customer: "Camille Dizon", service: "Hair colour", staff: "Jules Santos", status: "Confirmed", duration: "1h 30m", total: 1800, deposit: 0, phone: null },
    { id: 3, time: "11:00 AM", customer: "Alex Reyes", service: "Scalp treatment", staff: "Rae Cruz", status: "Confirmed", duration: "1h", total: 900, deposit: 0, phone: null },
    { id: 4, time: "11:30 AM", customer: "Jamie Lim", service: "Gel manicure", staff: "Mira Reyes", status: "Pending", duration: "45 min", total: 600, deposit: 0, phone: null },
  ] },
  queueData: { queue: [
    { id: 1, service: "Hair colour", customer: "Camille Dizon", time: "10:30 AM", price: 1800, status: "PENDING" },
    { id: 2, service: "Scalp treatment", customer: "Alex Reyes", time: "11:00 AM", price: 900, status: "PENDING" },
    { id: 3, service: "Cut & style", customer: "Sofia Mendoza", time: "10:00 AM", price: 600, status: "SERVING" },
  ] },
  growth: { enabled: true, occupancy: null, opportunity: null },
  onRefresh: () => {}, onBooking: () => {},
  onQueueAction: async () => ({ success: false, error: "Static marketing capture" }),
  onExpense: async () => ({ success: false, error: "Static marketing capture" }),
};
