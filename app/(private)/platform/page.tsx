import {
  isPrismaAccelerateResourceLimitError,
  prisma,
  supportsOnboardingApplicationModel,
} from "@/prisma/prisma";
import { connection } from "next/server";
import Link from "next/link";
import {
  PlatformMetricCard,
  PlatformPageHeader,
  formatPhpFromCentavos,
  formatPlatformDate,
  platformPanelClass,
} from "./_components/platform-ui";
import { SUBSCRIPTION_PLAN_CODES } from "@/features/billing/subscription-service";

const ONE_HOUR_MS = 1000 * 60 * 60;
const DAYS_7_MS = 1000 * 60 * 60 * 24 * 7;

const KPI_TARGETS = {
  onboardingLeadHours: 24,
  invoiceLeadHours: 72,
  outboxFailureRatePercent: 2,
  ciPassRatePercent: 95,
  flakyRuns: 0,
} as const;

type WeeklyKpiSnapshot = {
  onboarding: {
    totalApplications: number;
    contactedApplications: number;
    avgLeadHours: number | null;
    contactRatePercent: number;
  };
  invoices: {
    paidInvoices: number;
    avgLeadHours: number | null;
  };
  outbox: {
    totalMessages: number;
    failedMessages: number;
    terminalFailures: number;
    failureRatePercent: number;
  };
  ci: {
    enabled: boolean;
    passRatePercent: number | null;
    completedRuns: number;
    flakyRuns: number;
    note: string | null;
    repo: string | null;
  };
};

function formatAgeFromDate(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const totalHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days <= 0) return `${hours}h`;
  return `${days}d ${hours}h`;
}

function getWeekWindowStart() {
  return new Date(Date.now() - DAYS_7_MS);
}

function toDurationHours(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / ONE_HOUR_MS);
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

function getMetadataStatus(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const status = (metadata as Record<string, unknown>).status;
  return typeof status === "string" ? status.toUpperCase() : null;
}

async function fetchCiWeeklyKpi(
  windowStart: Date,
): Promise<WeeklyKpiSnapshot["ci"]> {
  const repo =
    process.env.GITHUB_MONITOR_REPO || process.env.GITHUB_REPOSITORY || null;
  if (!repo) {
    return {
      enabled: false,
      passRatePercent: null,
      completedRuns: 0,
      flakyRuns: 0,
      note: "Set GITHUB_MONITOR_REPO to enable CI telemetry.",
      repo: null,
    };
  }

  const token = process.env.GITHUB_MONITOR_TOKEN || process.env.GITHUB_TOKEN;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=50`,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "serviceflow-platform-monitor",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      },
    );

    if (!response.ok) {
      return {
        enabled: false,
        passRatePercent: null,
        completedRuns: 0,
        flakyRuns: 0,
        note: `GitHub Actions API returned ${response.status}.`,
        repo,
      };
    }

    const data = (await response.json()) as {
      workflow_runs?: Array<{
        status?: string;
        conclusion?: string | null;
        created_at?: string;
        run_attempt?: number;
      }>;
    };

    const runs = (data.workflow_runs ?? []).filter((run) => {
      const createdAt = run.created_at ? new Date(run.created_at) : null;
      return createdAt && createdAt >= windowStart;
    });

    const completed = runs.filter((run) => run.status === "completed");
    const passed = completed.filter((run) => run.conclusion === "success");
    const flakyRuns = completed.filter(
      (run) => (run.run_attempt ?? 1) > 1,
    ).length;
    const passRatePercent =
      completed.length === 0 ? null : (passed.length / completed.length) * 100;

    return {
      enabled: true,
      passRatePercent,
      completedRuns: completed.length,
      flakyRuns,
      note: token ? null : "Using unauthenticated GitHub API (rate-limited).",
      repo,
    };
  } catch (error) {
    return {
      enabled: false,
      passRatePercent: null,
      completedRuns: 0,
      flakyRuns: 0,
      note:
        error instanceof Error
          ? `CI telemetry unavailable: ${error.message}`
          : "CI telemetry unavailable.",
      repo,
    };
  }
}

export default async function PlatformOverviewPage() {
  await connection();

  const hasOnboardingModel = supportsOnboardingApplicationModel();
  const degradedMetrics: string[] = [];

  async function getMetric(metricLabel: string, query: () => Promise<number>) {
    try {
      return await query();
    } catch (error) {
      if (isPrismaAccelerateResourceLimitError(error)) {
        degradedMetrics.push(metricLabel);
        return 0;
      }
      throw error;
    }
  }

  async function getOptionalMetric<T>(
    metricLabel: string,
    query: () => Promise<T>,
  ) {
    try {
      return await query();
    } catch (error) {
      if (isPrismaAccelerateResourceLimitError(error)) {
        degradedMetrics.push(metricLabel);
        return null;
      }
      throw error;
    }
  }

  const weekWindowStart = getWeekWindowStart();

  // Run all KPI queries concurrently. They're independent reads; serial awaits
  // were the dominant cost on this page.
  const [
    activeSubs,
    trialingSubs,
    graceSubs,
    suspendedSubs,
    legacyOrInactivePlanSubs,
    pendingReferrals,
    pendingApplications,
    pendingUpgradeRequests,
    revenueCollected,
    oldestPendingApplication,
    oldestOpenInvoice,
    oldestPendingUpgradeRequest,
  ] = await Promise.all([
    getMetric("active subscriptions", () =>
      prisma.businessSubscription.count({ where: { status: "ACTIVE" } }),
    ),
    getMetric("trialing subscriptions", () =>
      prisma.businessSubscription.count({ where: { status: "TRIALING" } }),
    ),
    getMetric("grace-period subscriptions", () =>
      prisma.businessSubscription.count({ where: { status: "GRACE_PERIOD" } }),
    ),
    getMetric("suspended subscriptions", () =>
      prisma.businessSubscription.count({ where: { status: "SUSPENDED" } }),
    ),
    getMetric("legacy/inactive plan subscriptions", () =>
      prisma.businessSubscription.count({
        where: {
          OR: [
            { plan: { code: { notIn: [...SUBSCRIPTION_PLAN_CODES] } } },
            { plan: { is_active: false } },
          ],
        },
      }),
    ),
    getMetric("pending referrals", () =>
      prisma.referralAttribution.count({
        where: { status: { in: ["PENDING", "QUALIFIED"] } },
      }),
    ),
    hasOnboardingModel
      ? getMetric("pending applications", () =>
          prisma.onboardingApplication.count({
            where: { status: { in: ["NEW", "CONTACTED", "APPROVED"] } },
          }),
        )
      : Promise.resolve(0),
    getMetric("pending upgrade requests", () =>
      prisma.subscriptionPlanUpgradeRequest.count({
        where: { status: "PENDING" },
      }),
    ),
    getMetric("collected revenue", async () => {
      const paidInvoices = await prisma.subscriptionInvoice.aggregate({
        where: { status: "PAID" },
        _sum: { amount_paid: true },
      });
      return paidInvoices._sum.amount_paid ?? 0;
    }),
    hasOnboardingModel
      ? getOptionalMetric("oldest pending application", () =>
          prisma.onboardingApplication.findFirst({
            where: { status: { in: ["NEW", "CONTACTED", "APPROVED"] } },
            select: {
              business_name: true,
              owner_email: true,
              created_at: true,
            },
            orderBy: { created_at: "asc" },
          }),
        )
      : Promise.resolve(null),
    getOptionalMetric("oldest open invoice", () =>
      prisma.subscriptionInvoice.findFirst({
        where: { status: "OPEN" },
        select: {
          id: true,
          created_at: true,
          amount_due: true,
          business: { select: { name: true, slug: true } },
        },
        orderBy: { created_at: "asc" },
      }),
    ),
    getOptionalMetric("oldest pending upgrade request", () =>
      prisma.subscriptionPlanUpgradeRequest.findFirst({
        where: { status: "PENDING" },
        select: {
          created_at: true,
          business: { select: { name: true, slug: true } },
          target_plan: { select: { code: true } },
        },
        orderBy: { created_at: "asc" },
      }),
    ),
  ]);
  const weeklyKpis = await getOptionalMetric("weekly kpis", async () => {
    // Independent queries run in parallel. The onboardingStatusLogs query
    // depends on onboardingApplications (it filters by their ids), so it's
    // sequenced after.
    const [onboardingApplications, paidInvoicesInWindow, outboxMessagesInWindow, ciKpi] =
      await Promise.all([
        hasOnboardingModel
          ? prisma.onboardingApplication.findMany({
              where: { created_at: { gte: weekWindowStart } },
              select: { id: true, created_at: true },
              take: 500,
            })
          : Promise.resolve([] as Array<{ id: string; created_at: Date }>),
        prisma.subscriptionInvoice.findMany({
          where: { paid_at: { not: null, gte: weekWindowStart } },
          select: { created_at: true, paid_at: true },
          take: 500,
        }),
        prisma.outboxMessage.findMany({
          where: { created_at: { gte: weekWindowStart } },
          select: { attempts: true, processed: true, last_error: true },
          take: 1000,
        }),
        fetchCiWeeklyKpi(weekWindowStart),
      ]);

    const contactedAtByApplicationId = new Map<string, Date>();
    if (onboardingApplications.length > 0) {
      const onboardingStatusLogs = await prisma.platformActionLog.findMany({
        where: {
          action: "ONBOARDING_APPLICATION_STATUS_UPDATED",
          target_type: "OnboardingApplication",
          target_id: {
            in: onboardingApplications.map((application) => application.id),
          },
        },
        select: {
          target_id: true,
          created_at: true,
          metadata: true,
        },
        take: 1000,
      });

      for (const log of onboardingStatusLogs) {
        const status = getMetadataStatus(log.metadata);
        if (status !== "CONTACTED") continue;
        const existing = contactedAtByApplicationId.get(log.target_id);
        if (!existing || log.created_at < existing) {
          contactedAtByApplicationId.set(log.target_id, log.created_at);
        }
      }
    }

    const onboardingLeadHours = onboardingApplications
      .map((application) => {
        const contactedAt = contactedAtByApplicationId.get(application.id);
        if (!contactedAt) return null;
        return toDurationHours(application.created_at, contactedAt);
      })
      .filter((hours): hours is number => typeof hours === "number");

    const onboardingAverageLeadHours =
      onboardingLeadHours.length === 0
        ? null
        : onboardingLeadHours.reduce((sum, hours) => sum + hours, 0) /
          onboardingLeadHours.length;

    const invoiceLeadHours = paidInvoicesInWindow
      .map((invoice) => {
        if (!invoice.paid_at) return null;
        return toDurationHours(invoice.created_at, invoice.paid_at);
      })
      .filter((hours): hours is number => typeof hours === "number");

    const invoiceAverageLeadHours =
      invoiceLeadHours.length === 0
        ? null
        : invoiceLeadHours.reduce((sum, hours) => sum + hours, 0) /
          invoiceLeadHours.length;

    const failedOutboxMessages = outboxMessagesInWindow.filter(
      (message) => message.attempts > 0 || Boolean(message.last_error),
    );
    const terminalOutboxFailures = outboxMessagesInWindow.filter(
      (message) => !message.processed && message.attempts >= 3,
    );
    const outboxFailureRatePercent =
      outboxMessagesInWindow.length === 0
        ? 0
        : (failedOutboxMessages.length / outboxMessagesInWindow.length) * 100;

    return {
      onboarding: {
        totalApplications: onboardingApplications.length,
        contactedApplications: onboardingLeadHours.length,
        avgLeadHours: onboardingAverageLeadHours,
        contactRatePercent:
          onboardingApplications.length === 0
            ? 0
            : (onboardingLeadHours.length / onboardingApplications.length) *
              100,
      },
      invoices: {
        paidInvoices: paidInvoicesInWindow.length,
        avgLeadHours: invoiceAverageLeadHours,
      },
      outbox: {
        totalMessages: outboxMessagesInWindow.length,
        failedMessages: failedOutboxMessages.length,
        terminalFailures: terminalOutboxFailures.length,
        failureRatePercent: outboxFailureRatePercent,
      },
      ci: ciKpi,
    } satisfies WeeklyKpiSnapshot;
  });

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
