import {
  PhilippinePeso,
  Calendar,
  Users,
  Bell,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import { SalesChart } from "./SalesChart";
import { formatPH } from "@/lib/date-utils";
import {
  Booking,
  Customer,
  AvailedService,
  Service,
  Employee,
  User,
  Voucher,
  Owner,
  BookingPayment,
} from "@/prisma/generated/prisma/client";
import { BookingDialog } from "./BookingDialog";
import { RecentBookingsWidget } from "./RecentBookingsWidget";
import {
  getCachedServices,
  getCachedPackages,
  getCachedBusinessBySlug,
} from "@/lib/data/cached";
import OwnerServiceQueue, {
  OwnerClaimedService,
  OwnerPendingService,
} from "./OwnerServiceQueue";
import { GiftCardClaimDialog } from "../shared/GiftCardClaimDialog";
import Link from "next/link";
import { TodayGrowthOpportunityCard } from "./TodayGrowthOpportunityCard";
import type { OpportunityView } from "@/lib/services/growth/types";
import { cn } from "@/lib/utils";
import { ExpenseWidget } from "./ExpenseWidget";
import type { ExpenseView } from "@/lib/expenses/constants";
import {
  GcashFollowUpQueue,
  GcashVerificationQueue,
} from "@/components/dashboard/shared/GcashVerificationQueue";
import type {
  GcashFollowUpItem,
  GcashVerificationItem,
} from "@/lib/types/manual-gcash";

type BookingWithDetails = Booking & {
  // Nullable for anonymous walk-ins; render via getBookingCustomerName.
  customer: Customer | null;
  vouchers: Voucher[];
  payments?: BookingPayment[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: (Employee & { user: User }) | null;
    served_by_owner: (Owner & { user: User }) | null;
  })[];
};

// ── KPI Card ───────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl p-5 relative overflow-hidden",
        accent
          ? "bg-gradient-to-br from-primary to-primary/75 shadow-lg shadow-primary/20"
          : "bg-card border border-border shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200 cursor-default",
      )}
    >
      {/* Decorative circles — accent card only */}
      {accent && (
        <>
          <div className="absolute -right-5 -top-5 h-24 w-24 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -right-1 -bottom-8 h-20 w-20 rounded-full bg-white/5 pointer-events-none" />
        </>
      )}

      {/* Top row: label + icon */}
      <div className="flex items-center justify-between gap-2 relative">
        <p
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wider",
            accent ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        <div
          className={cn(
            "h-9 w-9 shrink-0 rounded-xl flex items-center justify-center",
            accent ? "bg-white/20" : "bg-primary/10",
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              accent ? "text-primary-foreground" : "text-primary",
            )}
          />
        </div>
      </div>

      {/* Value */}
      <p
        className={cn(
          "text-[2rem] font-bold tabular-nums mt-3 leading-none relative",
          accent ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>

      {/* Sub label */}
      {sub && (
        <p
          className={cn(
            "text-[11px] mt-1.5 relative",
            accent ? "text-primary-foreground/55" : "text-muted-foreground",
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Metric progress bar ────────────────────────────────────
function MetricBar({
  label,
  value,
  caption,
}: {
  label: string;
  value: number;
  caption: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    pct >= 70
      ? "bg-primary"
      : pct >= 40
        ? "bg-amber-400"
        : "bg-destructive/60";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-bold text-foreground tabular-nums">
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">{caption}</p>
    </div>
  );
}

// ── Section card wrapper ───────────────────────────────────
function SideCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow duration-200",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────
export default async function OwnerDashboard({
  businessName,
  businessSlug,
  totalSales,
  bookingsToday,
  presentEmployeesToday,
  bookings,
  allBookings,
  pendingServices,
  ownerClaimedServices,
  payroll,
  flowRemindersThisWeek,
  bookingMetrics,
  staffingConflictAlerts,
  todayGrowthOpportunity,
  growthEnabled,
  reportsEnabled,
  todayExpenseTotal,
  todayRecentExpenses,
  gcashVerificationItems,
  gcashFollowUpItems,
}: {
  businessName: string;
  businessSlug: string;
  totalSales: number;
  bookingsToday: number;
  presentEmployeesToday: number;
  bookings: { id: number; created_at: Date; grand_total: number }[];
  allBookings: BookingWithDetails[];
  pendingServices: OwnerPendingService[];
  ownerClaimedServices: OwnerClaimedService[];
  payroll: {
    id: number;
    total_salary: number;
    starting_date: Date;
    ending_date: Date;
    employee: { user: { name: string } };
  }[];
  flowRemindersThisWeek: number;
  bookingMetrics: {
    slotLookupSuccessRate: number;
    bookingSubmitSuccessRate: number;
    conflictRejectionRate: number;
    publicConversionRate: number;
    slotLookupTotal: number;
    submitAttempts: number;
    publicStarted: number;
    publicCompleted: number;
    overrideBookingsCount?: number;
    requiredStaffRejections?: number;
  };
  staffingConflictAlerts: {
    id: string;
    bookingId: number;
    customerName: string;
    scheduledAt: string;
    trigger: string;
    reason: string;
    detectedAt: Date;
  }[];
  todayGrowthOpportunity: OpportunityView | null;
  growthEnabled: boolean;
  reportsEnabled: boolean;
  todayExpenseTotal: number;
  todayRecentExpenses: ExpenseView[];
  gcashVerificationItems: GcashVerificationItem[];
  gcashFollowUpItems: GcashFollowUpItem[];
}) {
  const business = await getCachedBusinessBySlug(businessSlug);
  const services = business ? await getCachedServices(business.id) : [];
  const packages = business ? await getCachedPackages(business.id) : [];
  const categories = Array.from(new Set(services.map((s) => s.category)));

  const totalSalesFormatted =
    totalSales >= 1000
      ? `₱${(totalSales / 1000).toFixed(1)}k`
      : `₱${totalSales}`;

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="shrink-0 bg-card border-b border-border px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate leading-none">
            {businessName}
          </p>
          <p className="text-[10px] text-primary font-semibold uppercase tracking-widest mt-0.5">
            Owner Dashboard
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BookingDialog
            services={services}
            packages={packages}
            categories={categories}
            businessSlug={businessSlug}
          />
          <GiftCardClaimDialog businessSlug={businessSlug} />
        </div>
      </header>

      {/* ── Scrollable body ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-4 sm:space-y-5">

          {/* ── KPI Cards ───────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              icon={PhilippinePeso}
              label="Revenue"
              value={totalSalesFormatted}
              sub="This month"
              accent
            />
            <KpiCard
              icon={Calendar}
              label="Bookings Today"
              value={bookingsToday}
              sub="Scheduled"
            />
            <KpiCard
              icon={Users}
              label="Active Staff"
              value={presentEmployeesToday}
              sub="Checked in"
            />
            <KpiCard
              icon={Bell}
              label="Reminders"
              value={flowRemindersThisWeek}
              sub="This week"
            />
          </div>

          <GcashVerificationQueue
            businessSlug={businessSlug}
            items={gcashVerificationItems.slice(0, 3)}
            total={gcashVerificationItems.length}
            compact
          />
          <GcashFollowUpQueue
            businessSlug={businessSlug}
            items={gcashFollowUpItems}
            compact
          />

          {/*
           * ── Combined main + sidebar ──────────────────────────
           * Mobile order (flex column):
           *   1. Sidebar (order-1) — Growth, Alerts, Queue  ← most actionable
           *   2. Chart + Bookings (order-2)
           *   3. Funnel (order-3)
           * Desktop (lg:grid):
           *   Left col-8: Chart → Bookings
           *   Right col-4: Sidebar items (stacked)
           */}
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 sm:gap-5">

            {/* ── RIGHT sidebar — mobile: first, desktop: right ── */}
            <div className="order-1 lg:order-2 lg:col-span-4 flex flex-col gap-4">

              {/* Growth Opportunity */}
              <SideCard className="overflow-hidden">
                {growthEnabled ? (
                  <TodayGrowthOpportunityCard
                    businessSlug={businessSlug}
                    initialOpportunity={todayGrowthOpportunity}
                  />
                ) : (
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                        <TrendingUp className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        Growth Opportunities
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Unlock AI-powered growth suggestions on Plus and Pro plans.
                    </p>
                    <Link
                      href={`/app/${businessSlug}/billing`}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      Upgrade plan →
                    </Link>
                  </div>
                )}
              </SideCard>

              {/* Staffing Alerts */}
              <SideCard className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      Staffing Alerts
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-2.5 py-1 rounded-full",
                      staffingConflictAlerts.length > 0
                        ? "bg-amber-100 text-amber-700"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {staffingConflictAlerts.length > 0
                      ? staffingConflictAlerts.length
                      : "Clear"}
                  </span>
                </div>

                {staffingConflictAlerts.length === 0 ? (
                  <div className="flex items-center gap-2.5 rounded-xl bg-primary/5 border border-primary/15 px-3 py-3">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-xs text-primary font-medium">
                      All staffing looks good
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {staffingConflictAlerts.slice(0, 3).map((alert) => (
                      <Link
                        key={alert.id}
                        href={`/app/${businessSlug}/bookings?q=${alert.bookingId}`}
                        className="block rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 hover:bg-amber-100 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[11px] font-semibold text-foreground truncate">
                            #{alert.bookingId} {alert.customerName}
                          </p>
                          <span className="text-[9px] text-amber-600 font-medium shrink-0">
                            Open →
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {alert.scheduledAt
                            ? formatPH(new Date(alert.scheduledAt), "MMM d, h:mm a")
                            : "Unscheduled"}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </SideCard>

              {/* Expense Widget */}
              <ExpenseWidget
                businessSlug={businessSlug}
                initialTotal={todayExpenseTotal}
                initialExpenses={todayRecentExpenses}
              />

              {/* Service Queue — compact widget */}
              <SideCard className="overflow-hidden min-h-[280px] lg:flex-1">
                <div className="flex items-center gap-2 px-5 pt-4 pb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Live Queue
                  </p>
                  <span className="ml-auto text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full tabular-nums">
                    {pendingServices.length + ownerClaimedServices.length}
                  </span>
                </div>
                <OwnerServiceQueue
                  businessSlug={businessSlug}
                  pendingServices={pendingServices}
                  claimedServices={ownerClaimedServices}
                  variant="embedded"
                  className="h-full"
                />
              </SideCard>

              {/* Booking Funnel — least urgent, bottom on mobile */}
              <SideCard className="p-5 order-3 lg:order-none">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-foreground">
                    Booking Funnel
                  </p>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
                    7d
                  </span>
                </div>
                <div className="space-y-4">
                  <MetricBar
                    label="Slot Lookup"
                    value={bookingMetrics.slotLookupSuccessRate}
                    caption={`${bookingMetrics.slotLookupTotal} lookups`}
                  />
                  <MetricBar
                    label="Booking Submit"
                    value={bookingMetrics.bookingSubmitSuccessRate}
                    caption={`${bookingMetrics.submitAttempts} attempts`}
                  />
                  <MetricBar
                    label="Public Conv."
                    value={bookingMetrics.publicConversionRate}
                    caption={`${bookingMetrics.publicCompleted}/${bookingMetrics.publicStarted} completed`}
                  />
                </div>
              </SideCard>

            </div>

            {/* ── LEFT main — mobile: second, desktop: left ── */}
            <div className="order-2 lg:order-1 lg:col-span-8 flex flex-col gap-4 sm:gap-5">

              {/* Chart — hero */}
              <SalesChart
                bookings={bookings}
                allBookings={allBookings}
                payroll={payroll}
                businessSlug={businessSlug}
                reportsEnabled={reportsEnabled}
                variant="card"
                className="w-full"
              />

              {/* Recent Bookings */}
              <div className="pb-6 lg:pb-0">
                <RecentBookingsWidget
                  bookings={allBookings}
                  businessSlug={businessSlug}
                />
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
