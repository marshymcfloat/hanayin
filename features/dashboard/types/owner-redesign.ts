export type InsightSpan = "Week" | "Month" | "Year";
export type OwnerRedesignPeriod = {
  range: string;
  labels: string[];
  revenue: number[];
  bookings: number[];
  topServices: { id: number; name: string; revenue: number }[];
  staff: { id: string; name: string; count: number; revenue: number }[];
  topCustomers: { id: string; name: string; visits: number; amount: number }[];
};
export type OwnerRedesignAnalytics = {
  generatedAt: string;
  business: { name: string; slug: string };
  summary: { revenue: number; previousRevenue: number; bookings: number; previousBookings: number; customers: number; visits: number; average: number };
  periods: Record<InsightSpan, OwnerRedesignPeriod>;
  expenses: { label: string; amount: number }[];
};
