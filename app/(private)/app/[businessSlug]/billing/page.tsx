import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import {
  ensureBusinessSubscription,
  ensureDefaultPlans,
  ensureReferralCode,
  formatCentavosToPhp,
  getBillingCollectionMode,
  SUBSCRIPTION_PLAN_CODES,
} from "@/features/billing/subscription-service";
import { authOptions } from "@/lib/next auth/options";
import {
  createOwnerSubscriptionInvoiceAction,
  requestOwnerPlanUpgradeAction,
  redirectOwnerSubscriptionCheckoutAction,
  submitManualPaymentReferenceAction,
} from "@/lib/server actions/subscription-owner";
import { prisma } from "@/prisma/prisma";

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getManualPaymentMetadata(metadata: unknown) {
  const record = asObject(metadata);
  return {
    reference: asOptionalString(record.manual_payment_reference),
    submittedAt: asOptionalString(record.manual_payment_submitted_at),
    amountCentavos: asOptionalNumber(record.manual_payment_amount_centavos),
    note: asOptionalString(record.manual_payment_note),
    proofUrl: asOptionalString(record.manual_payment_proof_url),
  };
}

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams?: Promise<{
    manualSubmit?: string;
    upgradeRequest?: string;
    error?: string;
  }>;
}) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const submitSuccess = query?.manualSubmit === "1";
  const upgradeRequestSuccess = query?.upgradeRequest === "1";
  const submitError = query?.error ?? null;

  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  if (!session.user.businessSlug || session.user.businessSlug !== businessSlug) {
    redirect(session.user.businessSlug ? `/app/${session.user.businessSlug}` : "/");
  }

  await ensureDefaultPlans();
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: {
      id: true,
      name: true,
    },
  });
  if (!business) redirect("/");

  await ensureBusinessSubscription(business.id);
  await ensureReferralCode(business.id);

  const subscription = await prisma.businessSubscription.findUnique({
    where: { business_id: business.id },
    include: {
      plan: true,
      credits: {
        orderBy: { created_at: "desc" },
        take: 10,
      },
      invoices: {
        orderBy: { created_at: "desc" },
        take: 20,
      },
      business: {
        include: {
          referral_code: true,
          referral_attributions_as_referrer: {
            include: {
              referred_business: {
                select: { name: true },
              },
            },
            orderBy: { created_at: "desc" },
            take: 20,
          },
        },
      },
    },
  });
  if (!subscription) redirect("/");

  const openInvoice = subscription.invoices.find((invoice) => invoice.status === "OPEN");
  const manualOnly = getBillingCollectionMode() === "MANUAL_ONLY";
  const openInvoiceManualPayment = openInvoice
    ? getManualPaymentMetadata(openInvoice.metadata)
    : null;
  const availableUpgradePlans = await prisma.subscriptionPlan.findMany({
    where: {
      code: { in: [...SUBSCRIPTION_PLAN_CODES] },
      is_active: true,
      price_amount: { gt: subscription.plan.price_amount },
    },
    select: {
      id: true,
      code: true,
      name: true,
      price_amount: true,
    },
    orderBy: [{ price_amount: "asc" }, { code: "asc" }],
  });
  const pendingPlanUpgradeRequest = await prisma.subscriptionPlanUpgradeRequest.findFirst({
    where: {
      business_id: business.id,
      status: "PENDING",
    },
    include: {
      target_plan: {
        select: {
          name: true,
          code: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
  });
  const planUpgradeRequests = await prisma.subscriptionPlanUpgradeRequest.findMany({
    where: {
      business_id: business.id,
    },
    include: {
      current_plan: {
        select: {
          name: true,
          code: true,
        },
      },
      target_plan: {
        select: {
          name: true,
          code: true,
          price_amount: true,
        },
      },
      reviewed_by_user: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: 6,
  });

  async function createInvoiceFormAction() {
    "use server";
    const result = await createOwnerSubscriptionInvoiceAction("OWNER_MANUAL_RENEWAL");
    if (!result.success) {
      throw new Error(result.error);
    }
  }

  async function submitManualPaymentFormAction(formData: FormData) {
    "use server";
    if (!openInvoice) {
      redirect(`/app/${businessSlug}/billing?error=${encodeURIComponent("No open invoice available.")}`);
    }

    const paymentReference = String(formData.get("paymentReference") || "").trim();
    const amountPhpRaw = String(formData.get("amountPhp") || "").trim();
    const note = String(formData.get("note") || "").trim();
    const proofUrl = String(formData.get("proofUrl") || "").trim();

    let amountCentavos: number | undefined;
    if (amountPhpRaw.length > 0) {
      const amountPhp = Number(amountPhpRaw);
      if (!Number.isFinite(amountPhp) || amountPhp <= 0) {
        redirect(
          `/app/${businessSlug}/billing?error=${encodeURIComponent("Amount must be a positive number.")}`,
        );
      }
      amountCentavos = Math.round(amountPhp * 100);
    }

    const result = await submitManualPaymentReferenceAction({
      invoiceId: openInvoice.id,
      paymentReference,
      amountCentavos,
      note: note || undefined,
      proofUrl: proofUrl || undefined,
    });

    if (!result.success) {
      redirect(`/app/${businessSlug}/billing?error=${encodeURIComponent(result.error)}`);
    }

    redirect(`/app/${businessSlug}/billing?manualSubmit=1`);
  }

  async function requestPlanUpgradeFormAction(formData: FormData) {
    "use server";
    const targetPlanCode = String(formData.get("targetPlanCode") || "").trim();
    const note = String(formData.get("note") || "").trim();

    const result = await requestOwnerPlanUpgradeAction({
      targetPlanCode,
      note: note || undefined,
    });

    if (!result.success) {
      redirect(`/app/${businessSlug}/billing?error=${encodeURIComponent(result.error)}`);
    }

    redirect(`/app/${businessSlug}/billing?upgradeRequest=1`);
  }

  return (
    <main className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border bg-white p-6">
          <h1 className="text-2xl font-semibold">Billing and Referral</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {business.name} subscription management.
          </p>
        </div>

        {submitSuccess ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
            Manual payment reference submitted. The ServiceFlow team will validate and mark the
            invoice once confirmed.
          </div>
        ) : null}
        {upgradeRequestSuccess ? (
          <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-800">
            Upgrade request submitted. The ServiceFlow team will review and update your plan.
          </div>
        ) : null}
        {submitError ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
            {submitError}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border bg-white p-5">
            <p className="text-xs uppercase text-muted-foreground">Plan</p>
            <p className="mt-2 text-lg font-semibold">{subscription.plan.name}</p>
            <p className="text-sm text-muted-foreground">{subscription.plan.code}</p>
          </article>
          <article className="rounded-2xl border bg-white p-5">
            <p className="text-xs uppercase text-muted-foreground">Status</p>
            <p className="mt-2 text-lg font-semibold">{subscription.status}</p>
            <p className="text-sm text-muted-foreground">
              Period ends {subscription.current_period_end.toLocaleDateString("en-PH")}
            </p>
          </article>
          <article className="rounded-2xl border bg-white p-5">
            <p className="text-xs uppercase text-muted-foreground">Collection</p>
            <p className="mt-2 text-lg font-semibold">{subscription.collection_method}</p>
            <p className="text-sm text-muted-foreground">
              Recurring {subscription.recurring_enabled ? "enabled" : "disabled"}
            </p>
          </article>
        </section>

        <section className="rounded-2xl border bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Plan Upgrade</h2>
              <p className="text-sm text-muted-foreground">
                Request a higher plan when you need more features and limits.
              </p>
            </div>
          </div>

          {pendingPlanUpgradeRequest ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                Pending request to {pendingPlanUpgradeRequest.target_plan.name} (
                {pendingPlanUpgradeRequest.target_plan.code})
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Submitted {pendingPlanUpgradeRequest.created_at.toLocaleDateString("en-PH")}.
                We will review this request shortly.
              </p>
            </div>
          ) : availableUpgradePlans.length > 0 ? (
            <form action={requestPlanUpgradeFormAction} className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Target plan</span>
                <select
                  name="targetPlanCode"
                  required
                  className="h-10 w-full rounded border border-stone-300 bg-white px-3 text-sm"
                  defaultValue={availableUpgradePlans[0]?.code}
                >
                  {availableUpgradePlans.map((plan) => (
                    <option key={plan.id} value={plan.code}>
                      {plan.name} ({formatCentavosToPhp(plan.price_amount)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium">Why are you upgrading? (optional)</span>
                <textarea
                  name="note"
                  rows={2}
                  maxLength={1000}
                  placeholder="Example: Need Plus for growth opportunities and advanced reporting."
                  className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <div className="md:col-span-3">
                <button
                  type="submit"
                  className="inline-flex w-fit rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
                >
                  Request Upgrade
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
              You are already on the highest available plan.
            </p>
          )}

          <div className="mt-6 overflow-x-auto">
            <h3 className="text-sm font-semibold">Recent Upgrade Requests</h3>
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Requested</th>
                  <th className="py-2">From</th>
                  <th className="py-2">To</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {planUpgradeRequests.length === 0 ? (
                  <tr>
                    <td className="py-3 text-muted-foreground" colSpan={5}>
                      No upgrade requests yet.
                    </td>
                  </tr>
                ) : (
                  planUpgradeRequests.map((request) => (
                    <tr key={request.id} className="border-b last:border-0">
                      <td className="py-2">
                        {request.created_at.toLocaleDateString("en-PH")}
                      </td>
                      <td className="py-2">{request.current_plan.code}</td>
                      <td className="py-2">{request.target_plan.code}</td>
                      <td className="py-2">{request.status}</td>
                      <td className="py-2">
                        {request.reviewed_at
                          ? request.reviewed_at.toLocaleDateString("en-PH")
                          : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Invoices</h2>
              <p className="text-sm text-muted-foreground">
                Generate invoices and settle billing with the ServiceFlow admin team.
              </p>
            </div>
            <form action={createInvoiceFormAction}>
              <button
                type="submit"
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
              >
                Generate Invoice
              </button>
            </form>
          </div>

          {openInvoice ? (
            <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
              <p className="text-sm font-medium">
                Open Invoice: {formatCentavosToPhp(openInvoice.amount_due)}
              </p>
              <p className="text-xs text-muted-foreground">
                Due {openInvoice.due_at.toLocaleDateString("en-PH")}
              </p>
              {manualOnly ? (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-emerald-900">
                    Manual billing mode is active. Submit your payment reference here for
                    faster verification.
                  </p>

                  {openInvoiceManualPayment?.reference ? (
                    <div className="rounded-md border border-emerald-200 bg-white p-3 text-xs text-emerald-900">
                      <p className="font-semibold">Latest submitted reference</p>
                      <p className="mt-1">Reference: {openInvoiceManualPayment.reference}</p>
                      {typeof openInvoiceManualPayment.amountCentavos === "number" ? (
                        <p>
                          Amount:{" "}
                          {formatCentavosToPhp(openInvoiceManualPayment.amountCentavos)}
                        </p>
                      ) : null}
                      {openInvoiceManualPayment.submittedAt ? (
                        <p>
                          Submitted:{" "}
                          {new Date(openInvoiceManualPayment.submittedAt).toLocaleString(
                            "en-PH",
                          )}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <form action={submitManualPaymentFormAction} className="grid gap-2">
                    <input
                      name="paymentReference"
                      placeholder="Payment reference"
                      required
                      className="w-full rounded border border-emerald-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      name="amountPhp"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount paid (PHP, optional)"
                      className="w-full rounded border border-emerald-200 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      name="proofUrl"
                      type="url"
                      placeholder="Proof URL (optional)"
                      className="w-full rounded border border-emerald-200 bg-white px-3 py-2 text-sm"
                    />
                    <textarea
                      name="note"
                      rows={2}
                      placeholder="Payment note (optional)"
                      className="w-full rounded border border-emerald-200 bg-white px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="inline-flex w-fit rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
                    >
                      Submit payment reference
                    </button>
                  </form>
                </div>
              ) : (
                <form
                  action={redirectOwnerSubscriptionCheckoutAction.bind(null, openInvoice.id)}
                  className="mt-3"
                >
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
                  >
                    Pay Now
                  </button>
                </form>
              )}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Date</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Subtotal</th>
                  <th className="py-2">Credit</th>
                  <th className="py-2">Due</th>
                  <th className="py-2">Manual Reference</th>
                </tr>
              </thead>
              <tbody>
                {subscription.invoices.map((invoice) => {
                  const manualPayment = getManualPaymentMetadata(invoice.metadata);

                  return (
                    <tr key={invoice.id} className="border-b last:border-0">
                      <td className="py-2">{invoice.created_at.toLocaleDateString("en-PH")}</td>
                      <td className="py-2">{invoice.status}</td>
                      <td className="py-2">{formatCentavosToPhp(invoice.amount_subtotal)}</td>
                      <td className="py-2">{formatCentavosToPhp(invoice.amount_credit_applied)}</td>
                      <td className="py-2">{formatCentavosToPhp(invoice.amount_due)}</td>
                      <td className="py-2">
                        {manualPayment.reference ? (
                          <div className="text-xs">
                            <p className="font-medium text-emerald-800">
                              {manualPayment.reference}
                            </p>
                            {manualPayment.submittedAt ? (
                              <p className="text-muted-foreground">
                                {new Date(manualPayment.submittedAt).toLocaleDateString(
                                  "en-PH",
                                )}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-semibold">Referral Program</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Share your code and earn free usage when referred businesses complete paid cycles.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border p-4">
              <p className="text-xs uppercase text-muted-foreground">Your Referral Code</p>
              <p className="mt-2 text-xl font-semibold">
                {subscription.business.referral_code?.code ?? "Not available"}
              </p>
            </article>
            <article className="rounded-xl border p-4">
              <p className="text-xs uppercase text-muted-foreground">Earned Credits</p>
              <p className="mt-2 text-xl font-semibold">
                {formatCentavosToPhp(
                  subscription.credits.reduce((sum, item) => sum + item.amount_total, 0),
                )}
              </p>
            </article>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Referred Business</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {subscription.business.referral_attributions_as_referrer.length === 0 ? (
                  <tr>
                    <td className="py-3 text-muted-foreground" colSpan={3}>
                      No referrals yet.
                    </td>
                  </tr>
                ) : (
                  subscription.business.referral_attributions_as_referrer.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2">{item.referred_business.name}</td>
                      <td className="py-2">{item.status}</td>
                      <td className="py-2">{item.created_at.toLocaleDateString("en-PH")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
