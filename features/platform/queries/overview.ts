import {
  isPrismaAccelerateResourceLimitError,
  prisma,
  supportsOnboardingApplicationModel,
} from "@/prisma/prisma";
import { SUBSCRIPTION_PLAN_CODES } from "@/features/billing/subscription-service";
import { requirePlatformAdmin } from "@/lib/auth/guards";
const ONE_HOUR_MS = 1000 * 60 * 60;
const DAYS_7_MS = 1000 * 60 * 60 * 24 * 7;

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

function getWeekWindowStart() {
  return new Date(Date.now() - DAYS_7_MS);
}

function toDurationHours(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / ONE_HOUR_MS);
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

export async function getPlatformOverviewData() {
 const auth = await requirePlatformAdmin();
 if (!auth.success) return null;
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

 return { hasOnboardingModel, degradedMetrics, activeSubs, trialingSubs, graceSubs, suspendedSubs, legacyOrInactivePlanSubs, pendingReferrals, pendingApplications, pendingUpgradeRequests, revenueCollected, oldestPendingApplication, oldestOpenInvoice, oldestPendingUpgradeRequest, weeklyKpis, weekWindowStart };
}
