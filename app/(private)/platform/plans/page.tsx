import { updateSubscriptionPlanAction } from "@/lib/server actions/platform-admin";
import { SUBSCRIPTION_PLAN_CODES } from "@/features/billing/subscription-service";
import { ensureDefaultPlans } from "@/features/billing/subscription-service";
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
import {
  PlatformMetricCard,
  PlatformPageHeader,
  formatPhpFromCentavos,
  platformInputClass,
  platformPanelClass,
  platformPrimaryButtonClass,
} from "../_components/platform-ui";

type PlatformPlansPageProps = {
  searchParams?: PlatformSearchParams;
};

function isCanonicalSubscriptionPlanCode(
  code: string,
): code is (typeof SUBSCRIPTION_PLAN_CODES)[number] {
  return SUBSCRIPTION_PLAN_CODES.includes(
    code as (typeof SUBSCRIPTION_PLAN_CODES)[number],
  );
}

export default async function PlatformPlansPage({
  searchParams,
}: PlatformPlansPageProps) {
  await connection();
  await ensureDefaultPlans();
  const flash = await getPlatformFlashMessage(searchParams);
  const [plans, legacyOrInactiveAssignments] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      orderBy: [{ is_active: "desc" }, { code: "asc" }],
    }),
    prisma.businessSubscription.count({
      where: {
        OR: [
          {
            plan: {
              code: { notIn: [...SUBSCRIPTION_PLAN_CODES] },
            },
          },
          {
            plan: {
              is_active: false,
            },
          },
        ],
      },
    }),
  ]);

  const activePlans = plans.filter((plan) => plan.is_active).length;
  const monthlyPlans = plans.filter((plan) => plan.billing_interval === "MONTHLY").length;
  const inactivePlans = plans.filter((plan) => !plan.is_active).length;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Subscription Plans"
        description="Control pricing and availability for every plan tier while keeping the catalog clean and current. Existing businesses stay on their current plan until manually reassigned."
      />
      {flash ? <PlatformFlashNotice flash={flash} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PlatformMetricCard label="Total Plans" value={plans.length} />
        <PlatformMetricCard label="Active Plans" value={activePlans} tone="accent" />
        <PlatformMetricCard label="Monthly Plans" value={monthlyPlans} />
        <PlatformMetricCard label="Inactive Plans" value={inactivePlans} />
      </div>

      {legacyOrInactiveAssignments > 0 ? (
        <article className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {legacyOrInactiveAssignments} businesses are still on legacy or inactive plans. Their
          subscriptions continue as-is until moved from <strong>/platform/businesses</strong>.
        </article>
      ) : null}

      <section className={`${platformPanelClass} p-5 sm:p-6`}>
        <div className="grid gap-4 xl:grid-cols-2">
          {plans.map((plan) => {
            const isCanonicalPlan = isCanonicalSubscriptionPlanCode(plan.code);
            async function updatePlanFormAction(formData: FormData) {
              "use server";
              try {
                const priceAmount = Number.parseInt(String(formData.get("priceAmount") || "0"), 10);
                const isActive = formData.get("isActive") === "on";
                const result = await updateSubscriptionPlanAction({
                  planId: plan.id,
                  priceAmount,
                  isActive,
                });

                if (!result.success) {
                  redirect(buildPlatformErrorPath("/platform/plans", result.error));
                }

                redirect(buildPlatformSuccessPath("/platform/plans", "Subscription plan updated."));
              } catch (error) {
                rethrowIfRedirectError(error);
                redirect(
                  buildPlatformErrorPath(
                    "/platform/plans",
                    toActionErrorMessage(error, "Unable to update subscription plan."),
                  ),
                );
              }
            }

            return (
              <form
                key={plan.id}
                action={updatePlanFormAction}
                className="rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-surface-soft)]/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[var(--pf-text)]">{plan.name}</p>
                    <p className="text-xs uppercase tracking-wide text-[var(--pf-muted)]">{plan.code}</p>
                  </div>
                  <span
                    className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold uppercase tracking-wide ${
                      plan.is_active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-100 text-slate-600"
                    }`}
                  >
                    {plan.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <p className="mt-3 text-sm text-[var(--pf-muted)]">
                  Current Price:{" "}
                  <span className="font-semibold text-[var(--pf-text)]">
                    {formatPhpFromCentavos(plan.price_amount)}
                  </span>
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-[var(--pf-text)]">Price (centavos)</span>
                    <input
                      name="priceAmount"
                      type="number"
                      min={0}
                      defaultValue={plan.price_amount}
                      className={platformInputClass}
                    />
                  </label>

                  <label className="mt-6 flex items-center gap-2 text-sm font-medium text-[var(--pf-text)] sm:mt-8">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked={plan.is_active}
                      disabled={!isCanonicalPlan}
                      className="h-4 w-4 rounded border-[var(--pf-border)]"
                    />
                    {isCanonicalPlan ? "Active for checkout" : "Legacy plan (always inactive)"}
                  </label>
                </div>

                <button type="submit" className={`${platformPrimaryButtonClass} mt-4 w-full sm:w-auto`}>
                  Save Plan
                </button>
              </form>
            );
          })}
        </div>
      </section>
    </div>
  );
}
