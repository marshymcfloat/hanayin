export type OwnerDashboardPreviewRange = "7d" | "month" | "6m" | "1y";

export type OwnerDashboardPreviewKpi = {
  id: "revenue" | "expenses" | "income" | "completion" | "average";
  label: string;
  value: number;
  format: "currency" | "percent";
  change: string;
};

export type OwnerDashboardPreviewFinancialPoint = {
  period: string;
  revenue: number;
  expenses: number;
  cashflow: number;
};

export type OwnerDashboardPreviewRankedItem = {
  name: string;
  detail: string;
  value: number;
  share: number;
};

export type OwnerDashboardPreviewBooking = {
  id: number;
  time: string;
  customer: string;
  service: string;
  staff: string;
  status: "Confirmed" | "In service" | "Pending";
  phone: string | null;
  duration: string;
  total: number;
  deposit: number;
};

export type OwnerDashboardPreviewStaff = {
  id: string;
  name: string;
  role: string;
  bookings: number;
  revenue: number;
  utilization: number | null;
};

export type OwnerDashboardPreviewQueueItem = {
  id: number;
  service: string;
  customer: string;
  time: string;
  price: number;
  status: "PENDING" | "CLAIMED" | "SERVING" | "COMPLETED";
};

export type OwnerDashboardPreviewGrowthOpportunity = {
  id: string;
  reason: string;
  confidence: number;
  timeWindowStart: string;
  timeWindowEnd: string;
  recommendedOfferTypes: string[];
};

export type OwnerDashboardPreviewReadModel = {
  generatedAt: string;
  business: {
    slug: string;
    name: string;
  };
  kpis: OwnerDashboardPreviewKpi[];
  financials: Record<
    OwnerDashboardPreviewRange,
    OwnerDashboardPreviewFinancialPoint[]
  >;
  bookings: OwnerDashboardPreviewBooking[];
  expenseBreakdown: OwnerDashboardPreviewRankedItem[];
  topServices: OwnerDashboardPreviewRankedItem[];
  topCustomers: OwnerDashboardPreviewRankedItem[];
  staff: OwnerDashboardPreviewStaff[];
  queue: OwnerDashboardPreviewQueueItem[];
  growth: {
    enabled: boolean;
    opportunity: OwnerDashboardPreviewGrowthOpportunity | null;
    occupancy: null;
  };
  availability: {
    staffUtilization: "unavailable";
    growthOccupancy: "unavailable";
  };
};

export type OwnerDashboardPerformanceDto = Pick<
  OwnerDashboardPreviewReadModel,
  "generatedAt" | "business" | "kpis" | "expenseBreakdown" | "topServices" | "topCustomers" | "staff"
> & {
  financials: { month: OwnerDashboardPreviewFinancialPoint[] };
  availability: { staffUtilization: "unavailable" };
};

export type OwnerDashboardTodayDto = Pick<OwnerDashboardPreviewReadModel, "generatedAt" | "bookings">;
export type OwnerDashboardQueueDto = Pick<OwnerDashboardPreviewReadModel, "generatedAt" | "queue">;
export type OwnerDashboardGrowthDto = Pick<OwnerDashboardPreviewReadModel, "generatedAt" | "growth"> & {
  availability: { growthOccupancy: "unavailable" };
};
export type OwnerDashboardFinancialRangeDto = {
  generatedAt: string;
  range: OwnerDashboardPreviewRange;
  points: OwnerDashboardPreviewFinancialPoint[];
};
