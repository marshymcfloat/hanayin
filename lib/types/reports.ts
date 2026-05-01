export type ReportTab =
  | "overview"
  | "revenue"
  | "customers"
  | "operations"
  | "expenses"
  | "cohorts"
  | "attribution"
  | "opportunity";

export type CoreReportTab = Extract<
  ReportTab,
  "overview" | "revenue" | "customers" | "operations" | "expenses"
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

export type SmartInsightSeverity = "info" | "warning" | "success" | "alert";

export interface SmartInsight {
  id: string;
  severity: SmartInsightSeverity;
  title: string;
  body: string;
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
  totalExpenses: number;
  trueNetProfit: number;
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
  insights: SmartInsight[];
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
  /**
   * Bookings recorded as anonymous walk-ins (no Customer profile linked) in
   * the period. These bookings count in revenue but are excluded from
   * customer rankings and re-engagement campaigns. Surfaced on the dashboard
   * so owners can see the cost of skipping contact-info collection.
   */
  anonymousWalkInBookings: number;
  anonymousWalkInRevenue: number;
  anonymousWalkInShareOfBookings: number;
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

export interface ExpensesKpis {
  totalExpenses: number;
  entryCount: number;
  avgPerDay: number;
  topCategory: string | null;
  expenseToRevenueRatio: number;
}

export interface ExpenseTrendPoint {
  bucketKey: string;
  label: string;
  total: number;
  count: number;
}

export interface ExpenseCategoryRow {
  category: string;
  categoryLabel: string;
  total: number;
  count: number;
}

export interface ExpenseEntryRow {
  id: number;
  date: Date;
  category: string;
  categoryLabel: string;
  amount: number;
  description: string | null;
  createdByName: string | null;
}

export interface ExpensesReportPayload {
  range: ReportDateRange;
  kpis: ExpensesKpis;
  trend: ExpenseTrendPoint[];
  byCategory: ExpenseCategoryRow[];
  entries: ExpenseEntryRow[];
}

export type ReportPayloadMap = {
  overview: OverviewReportPayload;
  revenue: RevenueReportPayload;
  customers: CustomersReportPayload;
  operations: OperationsReportPayload;
  expenses: ExpensesReportPayload;
};

export type AdvancedReportPayloadMap = {
  cohorts: CohortsReportPayload;
  attribution: AttributionReportPayload;
  opportunity: OpportunityRoiReportPayload;
};
