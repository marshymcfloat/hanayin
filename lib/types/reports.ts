export type ReportTab =
  | "overview"
  | "revenue"
  | "customers"
  | "operations"
  | "cohorts"
  | "attribution"
  | "opportunity";

export type CoreReportTab = Extract<
  ReportTab,
  "overview" | "revenue" | "customers" | "operations"
>;

export type AdvancedReportTab = Extract<
  ReportTab,
  "cohorts" | "attribution" | "opportunity"
>;

export type ReportRangePreset =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "mtd"
  | "custom";

export type ReportGroupBy = "day" | "week" | "month";

export interface ReportDateRange {
  preset: ReportRangePreset;
  start: string;
  end: string;
  startAt: Date;
  endAt: Date;
  spanDays: number;
  label: string;
  groupBy: ReportGroupBy;
  isCustom: boolean;
}

export interface OverviewKpis {
  bookedRevenue: number;
  collectedRevenue: number;
  outstandingBalance: number;
  averageTicket: number;
  discountRate: number;
  grossRevenue: number;
  estimatedCost: number;
  estimatedNetRevenue: number;
  estimatedNetMargin: number;
  completionRate: number;
  totalBookings: number;
}

export interface BookingVolumeBreakdown {
  hold: number;
  accepted: number;
  completed: number;
  cancelled: number;
}

export interface TopServiceRow {
  serviceId: number;
  serviceName: string;
  category: string;
  revenue: number;
  timesBooked: number;
}

export interface TopCustomerRow {
  customerId: string;
  customerName: string;
  bookings: number;
  spend: number;
}

export interface OverviewTrendPoint {
  bucketKey: string;
  label: string;
  bookings: number;
  bookedRevenue: number;
  collectedRevenue: number;
}

export interface OverviewReportPayload {
  range: ReportDateRange;
  kpis: OverviewKpis;
  bookingVolume: BookingVolumeBreakdown;
  trend: OverviewTrendPoint[];
  topServices: TopServiceRow[];
  topCustomers: TopCustomerRow[];
}

export interface RevenueKpis {
  bookedRevenue: number;
  collectedRevenue: number;
  outstandingBalance: number;
  averageTicket: number;
  discountRate: number;
  grossRevenue: number;
  estimatedCost: number;
  estimatedNetRevenue: number;
  estimatedNetMargin: number;
}

export interface RevenueTrendPoint {
  bucketKey: string;
  label: string;
  bookedRevenue: number;
  collectedRevenue: number;
  discount: number;
  averageTicket: number;
}

export interface RevenueCategoryRow {
  category: string;
  revenue: number;
  bookings: number;
}

export interface PaymentMethodRow {
  method: string;
  bookings: number;
  collectedRevenue: number;
}

export interface RevenueReportPayload {
  range: ReportDateRange;
  kpis: RevenueKpis;
  trend: RevenueTrendPoint[];
  topCategories: RevenueCategoryRow[];
  paymentMix: PaymentMethodRow[];
}

export interface CustomersKpis {
  newCustomers: number;
  activeCustomers: number;
  repeatCustomers: number;
  repeatCustomerRate: number;
  rebookingWithin45Rate: number;
  atRiskCustomers60d: number;
}

export interface CustomersTrendPoint {
  bucketKey: string;
  label: string;
  newCustomers: number;
  activeCustomers: number;
  repeatCustomers: number;
}

export interface CustomersReportPayload {
  range: ReportDateRange;
  kpis: CustomersKpis;
  trend: CustomersTrendPoint[];
  topCustomers: TopCustomerRow[];
}

export interface OperationsKpis {
  completedServices: number;
  staffContributors: number;
  payrollTotal: number;
  payrollRatio: number;
  pendingQueueCount: number;
  medianPendingAgeHours: number;
}

export interface StaffPerformanceRow {
  providerId: string;
  providerType: "EMPLOYEE" | "OWNER";
  providerName: string;
  completedServices: number;
  revenueContribution: number;
}

export interface OperationsTrendPoint {
  bucketKey: string;
  label: string;
  completedServices: number;
  payroll: number;
}

export interface OperationsReportPayload {
  range: ReportDateRange;
  kpis: OperationsKpis;
  trend: OperationsTrendPoint[];
  staffPerformance: StaffPerformanceRow[];
}

export interface CohortsKpis {
  cohortCustomers: number;
  retainedCustomers30d: number;
  retainedCustomers60d: number;
  retention30dRate: number;
  retention60dRate: number;
  cohortRevenue: number;
}

export interface CohortsTrendPoint {
  bucketKey: string;
  label: string;
  customers: number;
  retention30dRate: number;
  retention60dRate: number;
  revenue: number;
}

export interface CohortSegmentRow {
  cohortKey: string;
  cohortLabel: string;
  customers: number;
  retained30d: number;
  retained60d: number;
  retention30dRate: number;
  retention60dRate: number;
  revenue: number;
}

export interface CohortsReportPayload {
  range: ReportDateRange;
  kpis: CohortsKpis;
  trend: CohortsTrendPoint[];
  cohorts: CohortSegmentRow[];
}

export interface AttributionKpis {
  campaigns: number;
  publishedCampaigns: number;
  clicks: number;
  inquiries: number;
  attributedBookings: number;
  promoRedemptions: number;
  attributionScore: number;
  bookingsPerPublishedCampaign: number;
}

export interface AttributionTrendPoint {
  bucketKey: string;
  label: string;
  campaigns: number;
  clicks: number;
  inquiries: number;
  attributedBookings: number;
  promoRedemptions: number;
  attributionScore: number;
}

export interface AttributionSegmentRow {
  segmentType: "OPPORTUNITY_TYPE" | "OFFER_TYPE";
  segment: string;
  campaigns: number;
  publishedCampaigns: number;
  attributedBookings: number;
  promoRedemptions: number;
  attributionScore: number;
}

export interface AttributionReportPayload {
  range: ReportDateRange;
  kpis: AttributionKpis;
  trend: AttributionTrendPoint[];
  topSegments: AttributionSegmentRow[];
}

export interface OpportunityRoiKpis {
  opportunities: number;
  convertedOpportunities: number;
  conversionRate: number;
  averageOpportunityScore: number;
  attributedValue: number;
  baselineCollectedRevenue: number;
  upliftVsBaselineRate: number;
}

export interface OpportunityRoiTrendPoint {
  bucketKey: string;
  label: string;
  opportunities: number;
  convertedOpportunities: number;
  averageScore: number;
  attributedValue: number;
}

export interface OpportunityRoiSegmentRow {
  opportunityType: string;
  opportunities: number;
  convertedOpportunities: number;
  conversionRate: number;
  averageScore: number;
  attributedValue: number;
}

export interface OpportunityRoiReportPayload {
  range: ReportDateRange;
  kpis: OpportunityRoiKpis;
  trend: OpportunityRoiTrendPoint[];
  topOpportunities: OpportunityRoiSegmentRow[];
}

export type ReportPayloadMap = {
  overview: OverviewReportPayload;
  revenue: RevenueReportPayload;
  customers: CustomersReportPayload;
  operations: OperationsReportPayload;
};

export type AdvancedReportPayloadMap = {
  cohorts: CohortsReportPayload;
  attribution: AttributionReportPayload;
  opportunity: OpportunityRoiReportPayload;
};
