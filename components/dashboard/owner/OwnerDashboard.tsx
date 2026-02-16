import {
  PhilippinePeso,
  Calendar,
  Users,
  Bell,
  AlertTriangle,
  Activity,
} from "lucide-react";
import DashboardCard from "../DashboardCard";
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

type BookingWithDetails = Booking & {
  customer: Customer;
  vouchers: Voucher[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: (Employee & { user: User }) | null;
    served_by_owner: (Owner & { user: User }) | null;
  })[];
};

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
    employee: {
      user: {
        name: string;
      };
    };
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
}) {
  const business = await getCachedBusinessBySlug(businessSlug);
  const services = business ? await getCachedServices(business.id) : [];
  const packages = business ? await getCachedPackages(business.id) : [];
  const categories = Array.from(new Set(services.map((s) => s.category)));

  return (
    <div className="min-h-screen lg:h-screen bg-linear-to-b from-zinc-50 via-white to-zinc-50 flex flex-col overflow-hidden">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-4 py-3 flex items-center justify-between md:px-8 md:py-4 shadow-[0_2px_20px_-12px_rgba(0,0,0,0.1)] transition-all duration-300 shrink-0">
        <div className="flex flex-col">
          <h1 className="font-bold text-lg leading-none md:text-xl text-slate-900 tracking-tight">
            {businessName}
          </h1>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-indigo-500 mt-1">
            Owner Dashboard
          </p>
        </div>

        <div className="flex items-center gap-3">
          <BookingDialog
            services={services}
            packages={packages}
            categories={categories}
            businessSlug={businessSlug}
          />
          <GiftCardClaimDialog businessSlug={businessSlug} />
        </div>
      </header>

      <main className="flex-1 overflow-auto lg:overflow-hidden w-full max-w-[1920px] mx-auto">
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-6 lg:h-full">
          {/* Left Column: Queue & Recent Bookings (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-6 lg:h-full lg:overflow-hidden">
            <section className="bg-white rounded-[28px] border border-zinc-100 flex-1 min-h-[300px] overflow-hidden">
              <OwnerServiceQueue
                businessSlug={businessSlug}
                pendingServices={pendingServices}
                claimedServices={ownerClaimedServices}
                variant="embedded"
                className="h-full"
              />
            </section>

            <section className="bg-white rounded-[28px] border border-zinc-100 flex-1 min-h-[300px] overflow-hidden">
              <RecentBookingsWidget
                bookings={allBookings}
                businessSlug={businessSlug}
                className="h-full border-none shadow-none"
              />
            </section>
          </div>

          {/* Center Column: Charts & Key Metrics (6 cols) */}
          <div className="lg:col-span-6 flex flex-col gap-6 lg:h-full lg:overflow-y-auto no-scrollbar">
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <DashboardCard
                variant="filled"
                Icon={PhilippinePeso}
                description="Total sales this period"
                title="Revenue"
                count={totalSales}
              />
              <DashboardCard
                Icon={Calendar}
                description="Appointments for today"
                title="Bookings"
                count={bookingsToday}
              />
              <DashboardCard
                Icon={Users}
                description="Staff currently present"
                title="Active Staff"
                count={presentEmployeesToday}
              />
              <DashboardCard
                Icon={Bell}
                description="Follow-up reminders sent"
                title="Flow Reminders"
                count={flowRemindersThisWeek}
              />
            </section>

            <section className="bg-white rounded-[28px] border border-zinc-100 p-1 flex-1 min-h-[400px]">
              <SalesChart
                bookings={bookings}
                allBookings={allBookings}
                payroll={payroll}
                businessSlug={businessSlug}
                reportsEnabled={reportsEnabled}
                variant="embedded"
                className="h-full w-full"
              />
            </section>
          </div>

          {/* Right Column: Insights & Alerts (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-6 lg:h-full lg:overflow-y-auto no-scrollbar">
            {growthEnabled ? (
              <section>
                <TodayGrowthOpportunityCard
                  businessSlug={businessSlug}
                  initialOpportunity={todayGrowthOpportunity}
                />
              </section>
            ) : (
              <section className="rounded-[24px] border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-800">
                Growth opportunities are available on Plus and Pro plans.
              </section>
            )}

            <article className="rounded-[24px] border border-zinc-100 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Staffing Alerts
                  </h3>
                </div>
                <span className="text-xs text-zinc-500">
                  {staffingConflictAlerts.length} recent
                </span>
              </div>
              {staffingConflictAlerts.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No future-booking staffing conflicts detected.
                </p>
              ) : (
                <ul className="space-y-2">
                  {staffingConflictAlerts.slice(0, 4).map((alert) => (
                    <li
                      key={alert.id}
                      className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2"
                    >
                      <p className="text-xs font-semibold text-zinc-900">
                        Booking #{alert.bookingId} - {alert.customerName}
                      </p>
                      <p className="text-[11px] text-zinc-700">
                        {alert.scheduledAt
                          ? formatPH(
                              new Date(alert.scheduledAt),
                              "MMM d, h:mm a",
                            )
                          : "Unscheduled"}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-amber-700">
                          {alert.trigger.replaceAll("_", " ")}
                        </span>
                        <Link
                          href={`/app/${businessSlug}/bookings?q=${alert.bookingId}`}
                          className="text-[11px] font-medium text-amber-700 underline underline-offset-2"
                        >
                          Open
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="rounded-[24px] border border-zinc-100 bg-white p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="size-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-zinc-900">
                  Funnel Metrics (7d)
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <MetricPill
                  label="Slot Success"
                  value={`${bookingMetrics.slotLookupSuccessRate.toFixed(1)}%`}
                  caption={`${bookingMetrics.slotLookupTotal} lookups`}
                />
                <MetricPill
                  label="Submit Success"
                  value={`${bookingMetrics.bookingSubmitSuccessRate.toFixed(1)}%`}
                  caption={`${bookingMetrics.submitAttempts} attempts`}
                />
                <MetricPill
                  label="Public Conv."
                  value={`${bookingMetrics.publicConversionRate.toFixed(1)}%`}
                  caption={`${bookingMetrics.publicCompleted} / ${bookingMetrics.publicStarted}`}
                />
              </div>
            </article>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricPill({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
        {label}
      </p>
      <p className="text-lg font-bold text-zinc-900">{value}</p>
      <p className="text-[10px] text-zinc-500">{caption}</p>
    </div>
  );
}

