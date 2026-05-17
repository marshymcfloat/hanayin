import {
  applyCreditAdjustmentAction,
  changeBusinessSubscriptionPlanAction,
  clearDemoDataAction,
  convertTrialToPaidAction,
  createBusinessWithSubscriptionAction,
  grantTrialMonthsAction,
  reactivateBusinessAction,
  resendMagicLinkAction,
  reviewSubscriptionPlanUpgradeRequestAction,
  suspendBusinessAction,
} from "@/lib/server actions/platform-admin";
import {
  DEFAULT_SUBSCRIPTION_PLAN_CODE,
  SUBSCRIPTION_PLAN_CODES,
  ensureDefaultPlans,
} from "@/features/billing/subscription-service";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/prisma/prisma";
import {
  buildPlatformErrorPath,
  type PlatformSearchParams,
  buildPlatformSuccessPath,
  getPlatformFlashMessage,
  PlatformFlashNotice,
  rethrowIfRedirectError,
  toActionErrorMessage,
} from "../_components/action-feedback";
import { ConfirmSubmitButton } from "../_components/confirm-submit-button";
import { ImpersonateOwnerButton } from "../_components/ImpersonateOwnerButton";
import {
  PlatformMetricCard,
  PlatformPageHeader,
  PlatformStatusBadge,
  formatPhpFromCentavos,
  formatPlatformDate,
  formatPlatformDateTime,
  platformDangerButtonClass,
  platformInputClass,
  platformPanelClass,
  platformPrimaryButtonClass,
  platformSecondaryButtonClass,
  platformTableCellClass,
  platformTableClass,
  platformTableContainerClass,
  platformTableHeadClass,
  platformTableWrapCellClass,
} from "../_components/platform-ui";
import {
  BUSINESS_STRUCTURE_TEMPLATES,
  normalizeBusinessStructure,
} from "@/lib/business-structure";

type PlatformBusinessesPageProps = {
  searchParams?: PlatformSearchParams;
};

function isSupportedPlanCode(
  value: string,
): value is (typeof SUBSCRIPTION_PLAN_CODES)[number] {
  return SUBSCRIPTION_PLAN_CODES.includes(
    value as (typeof SUBSCRIPTION_PLAN_CODES)[number],
  );
}

export default async function PlatformBusinessesPage({
  searchParams,
}: PlatformBusinessesPageProps) {
  await connection();
  await ensureDefaultPlans();
  const flash = await getPlatformFlashMessage(searchParams);
  const [businesses, catalogPlans, upgradeRequests] = await Promise.all([
    prisma.business.findMany({
      include: {
        subscriptions: {
          include: { plan: true },
        },
        owners: {
          include: {
            user: { select: { contact_number: true, name: true } },
          },
          take: 1,
        },
      },
      orderBy: { created_at: "desc" },
      take: 200,
    }),
    prisma.subscriptionPlan.findMany({
      where: { code: { in: [...SUBSCRIPTION_PLAN_CODES] } },
      select: {
        code: true,
        name: true,
        price_amount: true,
        is_active: true,
      },
      orderBy: [{ price_amount: "asc" }, { code: "asc" }],
    }),
    prisma.subscriptionPlanUpgradeRequest.findMany({
      include: {
        business: { select: { id: true, name: true, slug: true } },
        current_plan: { select: { code: true } },
        target_plan: { select: { code: true, name: true } },
        requested_by_user: { select: { name: true, contact_number: true } },
        reviewed_by_user: { select: { name: true, contact_number: true } },
      },
      orderBy: { created_at: "desc" },
      take: 200,
    }),
  ]);
  const assignablePlans = catalogPlans.filter((plan) => plan.is_active);
  const defaultAssignablePlanCode =
    assignablePlans.find((plan) => plan.code === DEFAULT_SUBSCRIPTION_PLAN_CODE)
      ?.code ??
    assignablePlans[0]?.code ??
    DEFAULT_SUBSCRIPTION_PLAN_CODE;

  async function createBusinessFormAction(formData: FormData) {
    "use server";
    try {
      const businessName = String(formData.get("businessName") || "");
      const businessSlug = String(formData.get("businessSlug") || "");
      const initials = String(formData.get("initials") || "");
      const ownerName = String(formData.get("ownerName") || "");
      const ownerContactNumber = String(
        formData.get("ownerContactNumber") || "",
      );
      const ownerPassword = String(formData.get("ownerPassword") || "");
      const referralCode = String(formData.get("referralCode") || "");
      const rawPlanCode = String(
        formData.get("planCode") || defaultAssignablePlanCode,
      );
      const parsedTrialMonths = Number.parseInt(
        String(formData.get("trialMonths") || "1"),
        10,
      );
      const structure = normalizeBusinessStructure(
        formData.get("structure"),
      );
      const allowEmployeeSelfBooking =
        String(formData.get("allowEmployeeSelfBooking") || "").toLowerCase() ===
        "true";
      const managerCanServe =
        String(formData.get("managerCanServe") || "").toLowerCase() === "true";
      const trialMonths =
        Number.isFinite(parsedTrialMonths) && parsedTrialMonths > 0
          ? Math.min(12, parsedTrialMonths)
          : 1;
      const planCode = isSupportedPlanCode(rawPlanCode)
        ? rawPlanCode
        : DEFAULT_SUBSCRIPTION_PLAN_CODE;

      const result = await createBusinessWithSubscriptionAction({
        businessName,
        businessSlug,
        initials,
        ownerName,
        ownerContactNumber,
        ownerPassword: ownerPassword || undefined,
        referralCode: referralCode || undefined,
        planCode,
        trialMonths,
        structure,
        allowEmployeeSelfBooking,
        managerCanServe,
      });

      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/businesses", result.error));
      }

      redirect(
        buildPlatformSuccessPath(
          "/platform/businesses",
          "Business created successfully.",
        ),
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/businesses",
          toActionErrorMessage(error, "Unable to create business."),
        ),
      );
    }
  }

  async function changeBusinessPlanFormAction(
    businessId: string,
    formData: FormData,
  ) {
    "use server";
    try {
      const rawPlanCode = String(
        formData.get("planCode") || defaultAssignablePlanCode,
      );
      if (!isSupportedPlanCode(rawPlanCode)) {
        redirect(
          buildPlatformErrorPath("/platform/businesses", "Invalid plan code."),
        );
      }

      const result = await changeBusinessSubscriptionPlanAction(
        businessId,
        rawPlanCode,
      );
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/businesses", result.error));
      }

      redirect(
        buildPlatformSuccessPath(
          "/platform/businesses",
          "Business plan updated.",
        ),
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/businesses",
          toActionErrorMessage(error, "Unable to update business plan."),
        ),
      );
    }
  }

  async function grantTrialFormAction(businessId: string, formData: FormData) {
    "use server";
    try {
      const rawMonths = Number.parseInt(
        String(formData.get("trialMonths") || "1"),
        10,
      );
      const months = Math.max(1, Math.min(12, Number.isFinite(rawMonths) ? rawMonths : 1));
      const result = await grantTrialMonthsAction(businessId, months);
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/businesses", result.error));
      }

      redirect(
        buildPlatformSuccessPath(
          "/platform/businesses",
          `Trial extended by ${months} month${months === 1 ? "" : "s"}.`,
        ),
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/businesses",
          toActionErrorMessage(error, "Unable to grant trial month."),
        ),
      );
    }
  }

  async function addCreditFormAction(businessId: string) {
    "use server";
    try {
      const result = await applyCreditAdjustmentAction(
        businessId,
        { months: 1 },
        "Manual admin credit",
      );
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/businesses", result.error));
      }

      redirect(
        buildPlatformSuccessPath(
          "/platform/businesses",
          "Credit adjustment applied.",
        ),
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/businesses",
          toActionErrorMessage(error, "Unable to apply credit adjustment."),
        ),
      );
    }
  }

  async function suspendBusinessFormAction(businessId: string) {
    "use server";
    try {
      const result = await suspendBusinessAction(
        businessId,
        "Admin suspension",
      );
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/businesses", result.error));
      }

      redirect(
        buildPlatformSuccessPath("/platform/businesses", "Business suspended."),
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/businesses",
          toActionErrorMessage(error, "Unable to suspend business."),
        ),
      );
    }
  }

  async function reactivateBusinessFormAction(businessId: string) {
    "use server";
    try {
      const result = await reactivateBusinessAction(businessId);
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/businesses", result.error));
      }

      redirect(
        buildPlatformSuccessPath(
          "/platform/businesses",
          "Business reactivated.",
        ),
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/businesses",
          toActionErrorMessage(error, "Unable to reactivate business."),
        ),
      );
    }
  }

  async function resendMagicLinkFormAction(businessId: string) {
    "use server";
    try {
      const result = await resendMagicLinkAction(businessId);
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/businesses", result.error));
      }
      const message =
        result.data.smsDelivery === "sent"
          ? "Magic link sent via SMS."
          : result.data.smsDelivery === "failed"
            ? "SMS failed; share the link manually from the audit log."
            : "Magic link generated (no phone on file).";
      redirect(buildPlatformSuccessPath("/platform/businesses", message));
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/businesses",
          toActionErrorMessage(error, "Unable to resend magic link."),
        ),
      );
    }
  }

  async function clearDemoDataFormAction(businessId: string) {
    "use server";
    try {
      const result = await clearDemoDataAction(businessId);
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/businesses", result.error));
      }
      redirect(
        buildPlatformSuccessPath("/platform/businesses", "Demo data cleared."),
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/businesses",
          toActionErrorMessage(error, "Unable to clear demo data."),
        ),
      );
    }
  }

  async function convertTrialToPaidFormAction(
    businessId: string,
    formData: FormData,
  ) {
    "use server";
    try {
      const paymentReference = String(formData.get("paymentReference") || "").trim();
      if (!paymentReference) {
        redirect(
          buildPlatformErrorPath(
            "/platform/businesses",
            "Payment reference is required to convert a trial.",
          ),
        );
      }
      const result = await convertTrialToPaidAction({ businessId, paymentReference });
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/businesses", result.error));
      }
      redirect(
        buildPlatformSuccessPath(
          "/platform/businesses",
          "Trial converted to paid.",
        ),
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/businesses",
          toActionErrorMessage(error, "Unable to convert trial."),
        ),
      );
    }
  }

  async function approveUpgradeRequestFormAction(requestId: string) {
    "use server";
    try {
      const result = await reviewSubscriptionPlanUpgradeRequestAction({
        requestId,
        decision: "APPROVE",
      });
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/businesses", result.error));
      }

      redirect(
        buildPlatformSuccessPath(
          "/platform/businesses",
          "Upgrade request approved.",
        ),
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/businesses",
          toActionErrorMessage(error, "Unable to approve upgrade request."),
        ),
      );
    }
  }

  async function rejectUpgradeRequestFormAction(
    requestId: string,
    formData: FormData,
  ) {
    "use server";
    try {
      const reviewNote = String(formData.get("reviewNote") || "").trim();
      const result = await reviewSubscriptionPlanUpgradeRequestAction({
        requestId,
        decision: "REJECT",
        reviewNote: reviewNote || undefined,
      });
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/businesses", result.error));
      }

      redirect(
        buildPlatformSuccessPath(
          "/platform/businesses",
          "Upgrade request rejected.",
        ),
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/businesses",
          toActionErrorMessage(error, "Unable to reject upgrade request."),
        ),
      );
    }
  }

  const activeBusinesses = businesses.filter(
    (business) => business.subscriptions[0]?.status === "ACTIVE",
  ).length;
  const trialingBusinesses = businesses.filter(
    (business) => business.subscriptions[0]?.status === "TRIALING",
  ).length;
  const atRiskBusinesses = businesses.filter((business) =>
    ["GRACE_PERIOD", "SUSPENDED"].includes(
      business.subscriptions[0]?.status ?? "",
    ),
  ).length;
  const legacyOrInactivePlanBusinesses = businesses.filter((business) => {
    const plan = business.subscriptions[0]?.plan;
    if (!plan) return false;
    return !isSupportedPlanCode(plan.code) || !plan.is_active;
  }).length;
  const missingSubscriptionBusinesses = businesses.filter(
    (business) => !business.subscriptions[0],
  ).length;
  const pendingUpgradeRequests = upgradeRequests.filter(
    (request) => request.status === "PENDING",
  ).length;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Business Operations"
        description="Create businesses quickly, monitor subscription health, and resolve payment-risk accounts before churn."
      />
      {flash ? <PlatformFlashNotice flash={flash} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
        <PlatformMetricCard
          label="Total Businesses"
          value={businesses.length}
        />
        <PlatformMetricCard
          label="Active Accounts"
          value={activeBusinesses}
          tone="accent"
        />
        <PlatformMetricCard
          label="Trialing Accounts"
          value={trialingBusinesses}
        />
        <PlatformMetricCard label="At-Risk Accounts" value={atRiskBusinesses} />
        <PlatformMetricCard
          label="Legacy/Inactive Plan"
          value={legacyOrInactivePlanBusinesses}
        />
        <PlatformMetricCard
          label="Missing Subscription"
          value={missingSubscriptionBusinesses}
        />
        <PlatformMetricCard
          label="Pending Upgrades"
          value={pendingUpgradeRequests}
        />
      </div>

      <section className={`${platformPanelClass} p-5 sm:p-6`}>
        <h3 className="text-lg font-semibold tracking-tight text-[var(--pf-text)]">
          Create Business (Admin Onboarding)
        </h3>
        <p className="mt-1 text-sm text-[var(--pf-muted)]">
          Use this form for assisted onboarding when a business needs manual
          setup. Existing businesses keep their current plan unless you change
          it below.
        </p>
        <form
          action={createBusinessFormAction}
          className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-6"
        >
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--pf-text)]">
              Business Name
            </span>
            <input
              name="businessName"
              className={platformInputClass}
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--pf-text)]">
              Business Slug
            </span>
            <input
              name="businessSlug"
              className={platformInputClass}
              placeholder="business-slug"
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--pf-text)]">Initials</span>
            <input
              name="initials"
              className={platformInputClass}
              placeholder="BF"
              maxLength={2}
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--pf-text)]">
              Owner Name
            </span>
            <input name="ownerName" className={platformInputClass} required />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--pf-text)]">
              Owner Contact Number
            </span>
            <input
              name="ownerContactNumber"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="09XX XXX XXXX"
              className={platformInputClass}
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--pf-text)]">
              Temporary Password
            </span>
            <input
              name="ownerPassword"
              className={platformInputClass}
              placeholder="Optional"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-[var(--pf-text)]">
              Referral Code
            </span>
            <input
              name="referralCode"
              className={platformInputClass}
              placeholder="Optional"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--pf-text)]">
              Initial Plan
            </span>
            <select
              name="planCode"
              defaultValue={defaultAssignablePlanCode}
              className={platformInputClass}
              disabled={assignablePlans.length === 0}
              required
            >
              {assignablePlans.length > 0 ? (
                assignablePlans.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.name} ({formatPhpFromCentavos(plan.price_amount)})
                  </option>
                ))
              ) : (
                <option value={DEFAULT_SUBSCRIPTION_PLAN_CODE}>
                  No active plans available
                </option>
              )}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--pf-text)]">
              Trial (months)
            </span>
            <input
              name="trialMonths"
              type="number"
              min={1}
              max={12}
              defaultValue={1}
              className={platformInputClass}
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-[var(--pf-text)]">
              Structure
            </span>
            <select
              name="structure"
              defaultValue="OWNER_EMPLOYEE_SELF_SERVICE"
              className={platformInputClass}
              required
            >
              {BUSINESS_STRUCTURE_TEMPLATES.map((template) => (
                <option key={template.value} value={template.value}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--pf-text)]">
              Allow Staff Self-booking
            </span>
            <select
              name="allowEmployeeSelfBooking"
              defaultValue="true"
              className={platformInputClass}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--pf-text)]">
              Manager Can Serve
            </span>
            <select
              name="managerCanServe"
              defaultValue="true"
              className={platformInputClass}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className={`${platformPrimaryButtonClass} w-full disabled:cursor-not-allowed disabled:opacity-60`}
              disabled={assignablePlans.length === 0}
            >
              Create Business
            </button>
          </div>
        </form>
      </section>

      <section className={`${platformPanelClass} p-5 sm:p-6`}>
        <h3 className="text-lg font-semibold tracking-tight text-[var(--pf-text)]">
          Business Subscriptions
        </h3>
        <p className="mt-1 text-sm text-[var(--pf-muted)]">
          Change plan tiers, grant trial/credit, suspend, and reactivate
          subscriptions without leaving this screen.
        </p>
        <div className={`mt-4 ${platformTableContainerClass}`}>
          <table className={platformTableClass}>
            <thead>
              <tr className="border-b border-[var(--pf-border)]">
                <th className={platformTableHeadClass}>Business</th>
                <th className={platformTableHeadClass}>Owner</th>
                <th className={platformTableHeadClass}>Plan</th>
                <th className={platformTableHeadClass}>Status</th>
                <th className={platformTableHeadClass}>Period End</th>
                <th className={platformTableHeadClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => {
                const subscription = business.subscriptions[0];
                const isLegacyPlan = subscription?.plan
                  ? !isSupportedPlanCode(subscription.plan.code)
                  : false;
                const isInactivePlan = Boolean(
                  subscription?.plan && !subscription.plan.is_active,
                );
                const selectedPlanCode =
                  subscription?.plan &&
                  isSupportedPlanCode(subscription.plan.code)
                    ? subscription.plan.code
                    : defaultAssignablePlanCode;
                const canExtendTrial = subscription?.status === "TRIALING";
                return (
                  <tr
                    key={business.id}
                    className="border-b border-[var(--pf-border)]/80 last:border-0"
                  >
                    <td
                      className={`${platformTableCellClass} min-w-[200px] max-w-[280px] ${platformTableWrapCellClass}`}
                    >
                      <p className="font-semibold text-[var(--pf-text)]">
                        {business.name}
                      </p>
                      <p className="text-xs text-[var(--pf-muted)]">
                        {business.slug}
                      </p>
                      <p className="mt-1 text-xs text-[var(--pf-muted)]">
                        Created {formatPlatformDate(business.created_at)}
                      </p>
                    </td>
                    <td
                      className={`${platformTableCellClass} min-w-[200px] max-w-[260px] ${platformTableWrapCellClass}`}
                    >
                      <p>{business.owners[0]?.user.name ?? "-"}</p>
                      <p className="text-xs text-[var(--pf-muted)]">
                        {business.owners[0]?.user.contact_number ?? "-"}
                      </p>
                    </td>
                    <td className={platformTableCellClass}>
                      <p>{subscription?.plan.code ?? "-"}</p>
                      {isLegacyPlan || isInactivePlan ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {isLegacyPlan ? (
                            <span className="inline-flex h-5 items-center rounded-full border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                              Legacy
                            </span>
                          ) : null}
                          {isInactivePlan ? (
                            <span className="inline-flex h-5 items-center rounded-full border border-slate-200 bg-slate-100 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                              Inactive plan
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className={platformTableCellClass}>
                      <PlatformStatusBadge
                        status={subscription?.status ?? "MISSING"}
                      />
                    </td>
                    <td className={platformTableCellClass}>
                      {subscription?.current_period_end
                        ? formatPlatformDate(subscription.current_period_end)
                        : "-"}
                    </td>
                    <td className={`${platformTableCellClass} min-w-[280px]`}>
                      <div className="space-y-2">
                        <form
                          action={changeBusinessPlanFormAction.bind(
                            null,
                            business.id,
                          )}
                          className="flex flex-wrap gap-2"
                        >
                          <select
                            name="planCode"
                            defaultValue={selectedPlanCode}
                            className={`${platformInputClass} h-9 min-w-[170px]`}
                            disabled={assignablePlans.length === 0}
                          >
                            {assignablePlans.map((plan) => (
                              <option key={plan.code} value={plan.code}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className={platformSecondaryButtonClass}
                            disabled={assignablePlans.length === 0}
                          >
                            Set Plan
                          </button>
                        </form>
                        <div className="flex flex-wrap gap-2">
                          <form
                            action={grantTrialFormAction.bind(
                              null,
                              business.id,
                            )}
                            className="flex items-center gap-1"
                          >
                            <select
                              name="trialMonths"
                              defaultValue="1"
                              disabled={!canExtendTrial}
                              className={`${platformInputClass} h-9 w-20`}
                            >
                              {[1, 2, 3, 6, 9, 12].map((m) => (
                                <option key={m} value={m}>
                                  +{m}m
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className={platformSecondaryButtonClass}
                              disabled={!canExtendTrial}
                              title={
                                canExtendTrial
                                  ? "Extend trial by selected months."
                                  : "Only trialing subscriptions can be extended."
                              }
                            >
                              Extend
                            </button>
                          </form>
                          <form
                            action={addCreditFormAction.bind(null, business.id)}
                          >
                            <button
                              type="submit"
                              className={platformSecondaryButtonClass}
                            >
                              Add Credit +1m
                            </button>
                          </form>
                          <form
                            action={suspendBusinessFormAction.bind(
                              null,
                              business.id,
                            )}
                          >
                            <ConfirmSubmitButton
                              className={platformDangerButtonClass}
                              confirmMessage={`Suspend ${business.name}? This will put the account in suspended mode and block normal write operations until reactivated.`}
                            >
                              Suspend
                            </ConfirmSubmitButton>
                          </form>
                          <form
                            action={reactivateBusinessFormAction.bind(
                              null,
                              business.id,
                            )}
                          >
                            <ConfirmSubmitButton
                              className={`${platformSecondaryButtonClass} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                              confirmMessage={`Reactivate ${business.name}? This resets the billing period start to today and sets a new period end based on the current plan.`}
                            >
                              Reactivate
                            </ConfirmSubmitButton>
                          </form>
                          <form
                            action={resendMagicLinkFormAction.bind(
                              null,
                              business.id,
                            )}
                          >
                            <button
                              type="submit"
                              className={platformSecondaryButtonClass}
                              title="Send a fresh single-use sign-in link via SMS to the owner."
                            >
                              Resend Sign-in Link
                            </button>
                          </form>
                          <ImpersonateOwnerButton
                            businessId={business.id}
                            businessName={business.name}
                            triggerClassName={platformSecondaryButtonClass}
                          />
                          <form
                            action={clearDemoDataFormAction.bind(
                              null,
                              business.id,
                            )}
                          >
                            <ConfirmSubmitButton
                              className={platformSecondaryButtonClass}
                              confirmMessage={`Clear demo data for ${business.name}? This removes only rows flagged as demo (sample services, customers, bookings). Real owner-created data is untouched.`}
                            >
                              Clear Demo Data
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                        {canExtendTrial ? (
                          <form
                            action={convertTrialToPaidFormAction.bind(
                              null,
                              business.id,
                            )}
                            className="mt-2 flex flex-wrap items-center gap-2"
                          >
                            <input
                              name="paymentReference"
                              required
                              placeholder="Payment ref (transfer id, receipt #)"
                              className={`${platformInputClass} h-9 w-64`}
                            />
                            <ConfirmSubmitButton
                              className={`${platformSecondaryButtonClass} border-emerald-300 bg-emerald-100 text-emerald-800`}
                              confirmMessage={`Convert ${business.name} from TRIALING to ACTIVE, mint an invoice, and mark it paid against the entered reference?`}
                            >
                              Convert Trial → Paid
                            </ConfirmSubmitButton>
                          </form>
                        ) : null}
                        <p className="text-[11px] text-amber-700">
                          Reactivate resets period start to today.
                        </p>
                        <p className="text-[11px] text-[var(--pf-muted)]">
                          Credits apply during invoicing; they do not change trial end date immediately.
                        </p>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section id="upgrade-requests" className={`${platformPanelClass} p-5 sm:p-6`}>
        <h3 className="text-lg font-semibold tracking-tight text-[var(--pf-text)]">
          Plan Upgrade Requests
        </h3>
        <p className="mt-1 text-sm text-[var(--pf-muted)]">
          Review owner-submitted upgrade requests and apply plan changes when
          approved.
        </p>
        <div className={`mt-4 ${platformTableContainerClass}`}>
          <table className={platformTableClass}>
            <thead>
              <tr className="border-b border-[var(--pf-border)]">
                <th className={platformTableHeadClass}>Business</th>
                <th className={platformTableHeadClass}>Requested By</th>
                <th className={platformTableHeadClass}>Requested Change</th>
                <th className={platformTableHeadClass}>Status</th>
                <th className={platformTableHeadClass}>Submitted</th>
                <th className={platformTableHeadClass}>Review</th>
              </tr>
            </thead>
            <tbody>
              {upgradeRequests.length === 0 ? (
                <tr>
                  <td
                    className={`${platformTableCellClass} text-[var(--pf-muted)]`}
                    colSpan={6}
                  >
                    No upgrade requests yet.
                  </td>
                </tr>
              ) : (
                upgradeRequests.map((request) => (
                  <tr
                    key={request.id}
                    className="border-b border-[var(--pf-border)]/80 last:border-0"
                  >
                    <td
                      className={`${platformTableCellClass} min-w-[200px] max-w-[280px] ${platformTableWrapCellClass}`}
                    >
                      <p className="font-semibold text-[var(--pf-text)]">
                        {request.business.name}
                      </p>
                      <p className="text-xs text-[var(--pf-muted)]">
                        {request.business.slug}
                      </p>
                    </td>
                    <td
                      className={`${platformTableCellClass} min-w-[180px] max-w-[240px] ${platformTableWrapCellClass}`}
                    >
                      <p>{request.requested_by_user.name}</p>
                      <p className="text-xs text-[var(--pf-muted)]">
                        {request.requested_by_user.contact_number}
                      </p>
                    </td>
                    <td className={platformTableCellClass}>
                      <p className="font-medium">
                        {request.current_plan.code} -&gt; {request.target_plan.code}
                      </p>
                      <p className="text-xs text-[var(--pf-muted)]">
                        {request.target_plan.name}
                      </p>
                      {request.request_note ? (
                        <p className="mt-1 text-xs text-[var(--pf-muted)]">
                          Note: {request.request_note}
                        </p>
                      ) : null}
                    </td>
                    <td className={platformTableCellClass}>
                      <PlatformStatusBadge status={request.status} />
                    </td>
                    <td className={platformTableCellClass}>
                      {formatPlatformDateTime(request.created_at)}
                    </td>
                    <td className={`${platformTableCellClass} min-w-[320px]`}>
                      {request.status === "PENDING" ? (
                        <div className="space-y-2">
                          <form
                            action={approveUpgradeRequestFormAction.bind(
                              null,
                              request.id,
                            )}
                          >
                            <button
                              type="submit"
                              className={`${platformSecondaryButtonClass} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                            >
                              Approve and Set Plan
                            </button>
                          </form>
                          <form
                            action={rejectUpgradeRequestFormAction.bind(
                              null,
                              request.id,
                            )}
                            className="flex flex-wrap gap-2"
                          >
                            <input
                              name="reviewNote"
                              className={`${platformInputClass} h-9 min-w-[200px]`}
                              placeholder="Reason (optional)"
                              maxLength={1000}
                            />
                            <button
                              type="submit"
                              className={platformDangerButtonClass}
                            >
                              Reject
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div className="text-xs text-[var(--pf-muted)]">
                          <p>
                            Reviewed{" "}
                            {request.reviewed_at
                              ? formatPlatformDateTime(request.reviewed_at)
                              : "-"}
                          </p>
                          {request.reviewed_by_user ? (
                            <p>By {request.reviewed_by_user.name}</p>
                          ) : null}
                          {request.review_note ? (
                            <p className="mt-1">Note: {request.review_note}</p>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
