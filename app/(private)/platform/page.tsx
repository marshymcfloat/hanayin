import { getPlatformOverviewData } from "@/features/platform/queries/overview";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import {
  PlatformMetricCard,
  PlatformPageHeader,
  formatPhpFromCentavos,
  formatPlatformDate,
  platformPanelClass,
} from "./_components/platform-ui";


const KPI_TARGETS = {
  onboardingLeadHours: 24,
  invoiceLeadHours: 72,
  outboxFailureRatePercent: 2,
  ciPassRatePercent: 95,
  flakyRuns: 0,
} as const;

function formatAgeFromDate(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const totalHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days <= 0) return `${hours}h`;
  return `${days}d ${hours}h`;
}

function formatLeadTime(hours: number | null) {
  if (hours === null) return "N/A";
  if (hours >= 48) return `${(hours / 24).toFixed(1)}d`;
  return `${hours.toFixed(1)}h`;
}

function getTargetStatusClass(status: "on-track" | "off-track" | "unknown") {
  if (status === "on-track") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "off-track") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export default async function PlatformOverviewPage() {
  await connection();

  const data = await getPlatformOverviewData();
  if (!data) redirect("/");
  const { hasOnboardingModel, degradedMetrics, activeSubs, trialingSubs, graceSubs, suspendedSubs, legacyOrInactivePlanSubs, pendingReferrals, pendingApplications, pendingUpgradeRequests, revenueCollected, oldestPendingApplication, oldestOpenInvoice, oldestPendingUpgradeRequest, weeklyKpis, weekWindowStart } = data;

  const totalSubscriptions =
    activeSubs + trialingSubs + graceSubs + suspendedSubs;

  const cards = [
    {
      label: "Active Subscriptions",
      value: activeSubs,
      tone: "accent" as const,
    },
    { label: "Trialing Subscriptions", value: trialingSubs },
    { label: "In Grace Period", value: graceSubs },
    { label: "Suspended", value: suspendedSubs },
    { label: "Legacy/Inactive Plan Subs", value: legacyOrInactivePlanSubs },
    { label: "Pending Referrals", value: pendingReferrals },
    { label: "Pending Applications", value: pendingApplications },
    { label: "Pending Upgrades", value: pendingUpgradeRequests },
    {
      label: "Collected Revenue",
      value: formatPhpFromCentavos(revenueCollected),
      tone: "accent" as const,
    },
  ];

  const subscriptionHealth = [
    { label: "Active", count: activeSubs },
    { label: "Trialing", count: trialingSubs },
    { label: "Grace Period", count: graceSubs },
    { label: "Suspended", count: suspendedSubs },
  ];

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Platform Overview"
        description="Track subscription health, onboarding throughput, and billing momentum across all businesses."
        actions={
          <Link
            href="/platform/businesses"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
          >
            Manage Businesses
          </Link>
        }
      />

      {!hasOnboardingModel ? (
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Onboarding applications are temporarily unavailable in this runtime.
          Restart the dev server after `npx prisma generate`.
        </article>
      ) : null}
      {degradedMetrics.length > 0 ? (
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Some platform metrics are temporarily unavailable because Prisma
          Accelerate is rate-limiting requests. Partial data is shown. Retry in
          a minute.
        </article>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <PlatformMetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            tone={card.tone}
          />
        ))}
      </div>

      <section className={`${platformPanelClass} p-6`}>
        <h3 className="text-lg font-bold tracking-tight text-stone-900">
          Subscription mix
        </h3>
        <p className="mt-1 text-sm text-stone-500">
          Keep suspended and grace-period accounts low to protect recurring
          revenue.
        </p>
        <div className="mt-6 space-y-4">
          {subscriptionHealth.map((item) => {
            const percentage =
              totalSubscriptions === 0
                ? 0
                : (item.count / totalSubscriptions) * 100;
            return (
              <article key={item.label} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <p className="font-medium text-stone-900">{item.label}</p>
                  <p className="text-stone-500">
                    {item.count} ({percentage.toFixed(1)}%)
                  </p>
                </div>
                <div className="h-2.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-stone-900"
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <section className={`${platformPanelClass} p-6`}>
          <h3 className="text-base font-semibold text-stone-900">
            Onboarding watchlist
          </h3>
          <p className="mt-2 text-sm text-stone-500">
            {pendingApplications} applications are waiting for review or
            conversion.
          </p>
          <div className="mt-6">
            <Link
              href="/platform/applications"
              className="inline-flex h-8 items-center rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-stone-50"
            >
              Review Applications
            </Link>
          </div>
        </section>

        <section className={`${platformPanelClass} p-6`}>
          <h3 className="text-base font-semibold text-stone-900">
            Referral watchlist
          </h3>
          <p className="mt-2 text-sm text-stone-500">
            {pendingReferrals} referrals are pending qualification or reward
            checks.
          </p>
          <div className="mt-6">
            <Link
              href="/platform/referrals"
              className="inline-flex h-8 items-center rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-stone-50"
            >
              Manage Referrals
            </Link>
          </div>
        </section>

        <section className={`${platformPanelClass} p-6`}>
          <h3 className="text-base font-semibold text-stone-900">
            Upgrade watchlist
          </h3>
          <p className="mt-2 text-sm text-stone-500">
            {pendingUpgradeRequests} owner upgrade requests are waiting for
            review.
          </p>
          <div className="mt-6">
            <Link
              href="/platform/businesses#upgrade-requests"
              className="inline-flex h-8 items-center rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-stone-50"
            >
              Review Upgrade Requests
            </Link>
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className={`${platformPanelClass} p-6`}>
          <h3 className="text-base font-semibold text-stone-900">
            Oldest Pending Application
          </h3>
          {oldestPendingApplication ? (
            <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-semibold text-stone-900">
                {oldestPendingApplication.business_name}
              </p>
              <p className="text-xs text-stone-500">
                {oldestPendingApplication.owner_email}
              </p>
              <p className="mt-2 text-xs font-medium text-rose-600">
                Waiting {formatAgeFromDate(oldestPendingApplication.created_at)}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">
              No pending applications right now.
            </p>
          )}
        </section>

        <section className={`${platformPanelClass} p-6`}>
          <h3 className="text-base font-semibold text-stone-900">
            Oldest Open Invoice
          </h3>
          {oldestOpenInvoice ? (
            <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-semibold text-stone-900">
                {oldestOpenInvoice.business.name}
              </p>
              <p className="text-xs text-stone-500">
                {oldestOpenInvoice.business.slug}
              </p>
              <p className="mt-2 text-xs font-medium text-rose-600">
                Open {formatAgeFromDate(oldestOpenInvoice.created_at)} (
                {formatPhpFromCentavos(oldestOpenInvoice.amount_due)})
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">
              No open invoices right now.
            </p>
          )}
        </section>

        <section className={`${platformPanelClass} p-6`}>
          <h3 className="text-base font-semibold text-stone-900">
            Oldest Pending Upgrade Request
          </h3>
          {oldestPendingUpgradeRequest ? (
            <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-semibold text-stone-900">
                {oldestPendingUpgradeRequest.business.name}
              </p>
              <p className="text-xs text-stone-500">
                {oldestPendingUpgradeRequest.business.slug}
              </p>
              <p className="mt-2 text-xs font-medium text-rose-600">
                Waiting {formatAgeFromDate(oldestPendingUpgradeRequest.created_at)} (
                {oldestPendingUpgradeRequest.target_plan.code})
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">
              No pending upgrade requests right now.
            </p>
          )}
        </section>
      </div>

      <section className={`${platformPanelClass} p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-stone-900">
              Weekly KPI Baseline
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              Rolling 7-day indicators for conversion, collection speed,
              reliability, and quality.
            </p>
          </div>
          <p className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-500">
            Window start: {formatPlatformDate(weekWindowStart)}
          </p>
        </div>

        {weeklyKpis ? (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <PlatformMetricCard
                label="App -> Contact Lead Time"
                value={formatLeadTime(weeklyKpis.onboarding.avgLeadHours)}
              />
              <PlatformMetricCard
                label="Invoice Open -> Paid"
                value={formatLeadTime(weeklyKpis.invoices.avgLeadHours)}
              />
              <PlatformMetricCard
                label="Outbox Failure Rate"
                value={`${weeklyKpis.outbox.failureRatePercent.toFixed(1)}%`}
              />
              <PlatformMetricCard
                label="CI Pass Rate"
                value={
                  weeklyKpis.ci.passRatePercent === null
                    ? "N/A"
                    : `${weeklyKpis.ci.passRatePercent.toFixed(1)}%`
                }
              />
            </div>

            <article className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-5">
              <h4 className="text-sm font-semibold text-stone-900">
                Target status
              </h4>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {(() => {
                  const items: Array<{
                    label: string;
                    target: string;
                    current: string;
                    status: "on-track" | "off-track" | "unknown";
                  }> = [
                    {
                      label: "App -> Contact",
                      target: `<= ${KPI_TARGETS.onboardingLeadHours}h`,
                      current: formatLeadTime(
                        weeklyKpis.onboarding.avgLeadHours,
                      ),
                      status:
                        weeklyKpis.onboarding.avgLeadHours === null
                          ? "unknown"
                          : weeklyKpis.onboarding.avgLeadHours <=
                              KPI_TARGETS.onboardingLeadHours
                            ? "on-track"
                            : "off-track",
                    },
                    {
                      label: "Invoice -> Paid",
                      target: `<= ${KPI_TARGETS.invoiceLeadHours}h`,
                      current: formatLeadTime(weeklyKpis.invoices.avgLeadHours),
                      status:
                        weeklyKpis.invoices.avgLeadHours === null
                          ? "unknown"
                          : weeklyKpis.invoices.avgLeadHours <=
                              KPI_TARGETS.invoiceLeadHours
                            ? "on-track"
                            : "off-track",
                    },
                    {
                      label: "Outbox failure",
                      target: `< ${KPI_TARGETS.outboxFailureRatePercent}%`,
                      current: `${weeklyKpis.outbox.failureRatePercent.toFixed(1)}%`,
                      status:
                        weeklyKpis.outbox.failureRatePercent <=
                        KPI_TARGETS.outboxFailureRatePercent
                          ? "on-track"
                          : "off-track",
                    },
                    {
                      label: "CI pass rate",
                      target: `>= ${KPI_TARGETS.ciPassRatePercent}%`,
                      current:
                        weeklyKpis.ci.passRatePercent === null
                          ? "N/A"
                          : `${weeklyKpis.ci.passRatePercent.toFixed(1)}%`,
                      status:
                        weeklyKpis.ci.passRatePercent === null
                          ? "unknown"
                          : weeklyKpis.ci.passRatePercent >=
                              KPI_TARGETS.ciPassRatePercent
                            ? "on-track"
                            : "off-track",
                    },
                    {
                      label: "Flaky runs",
                      target: `<= ${KPI_TARGETS.flakyRuns}`,
                      current: String(weeklyKpis.ci.flakyRuns),
                      status:
                        weeklyKpis.ci.completedRuns === 0 ||
                        weeklyKpis.ci.flakyRuns <= KPI_TARGETS.flakyRuns
                          ? "on-track"
                          : "off-track",
                    },
                  ];

                  return items.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm font-medium text-stone-900">
                        Current: {item.current}
                      </p>
                      <p className="text-xs text-stone-400 mb-2">
                        Target: {item.target}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getTargetStatusClass(
                          item.status,
                        )}`}
                      >
                        {item.status === "unknown"
                          ? "No data"
                          : item.status === "on-track"
                            ? "On track"
                            : "Off track"}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </article>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-stone-900">
                  Conversion Ops
                </h4>
                <p className="mt-2 text-sm text-stone-500">
                  {weeklyKpis.onboarding.contactedApplications} of{" "}
                  {weeklyKpis.onboarding.totalApplications} new applications
                  contacted (
                  {weeklyKpis.onboarding.contactRatePercent.toFixed(1)}%).
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  {weeklyKpis.invoices.paidInvoices} invoices were settled this
                  week.
                </p>
              </article>

              <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-stone-900">
                  Reliability and Quality
                </h4>
                <p className="mt-2 text-sm text-stone-500">
                  {weeklyKpis.outbox.failedMessages} failed outbox messages out
                  of {weeklyKpis.outbox.totalMessages}, with{" "}
                  {weeklyKpis.outbox.terminalFailures} terminal failures.
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  Flaky CI runs (reruns): {weeklyKpis.ci.flakyRuns}{" "}
                  {weeklyKpis.ci.repo ? `from ${weeklyKpis.ci.repo}` : ""}
                </p>
                {weeklyKpis.ci.note ? (
                  <p className="mt-2 text-xs text-amber-700">
                    {weeklyKpis.ci.note}
                  </p>
                ) : null}
              </article>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-stone-500">
            Weekly KPI data is temporarily unavailable.
          </p>
        )}
      </section>
    </div>
  );
}
