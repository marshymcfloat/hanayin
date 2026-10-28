import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  formatCentavosToPhp,
} from "@/features/billing/subscription-service";
import { authOptions } from "@/features/auth/auth-options";
import {
  createOwnerSubscriptionInvoiceAction,
  requestOwnerPlanUpgradeAction,
  submitManualPaymentReferenceAction,
} from "@/features/billing/actions/subscription-owner";
import { getBillingWorkspaceData, getManualPaymentMetadata } from "@/features/billing/queries/workspace";

function BillingPageSkeleton() {
  return (
    <div className="flex flex-col bg-background">
      <div className="border-b border-border bg-card px-4 py-5 sm:px-8 sm:py-6">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      </div>
      <div className="px-4 py-4 sm:px-8 sm:py-6">
        <div className="mx-auto grid w-full max-w-6xl gap-4 md:grid-cols-2">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

type BillingPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams?: Promise<{
    manualSubmit?: string;
    upgradeRequest?: string;
    error?: string;
  }>;
};

export default function BillingPage({ params, searchParams }: BillingPageProps) {
  return (
    <Suspense fallback={<BillingPageSkeleton />}>
      <BillingPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function BillingPageContent({
  params,
  searchParams,
}: BillingPageProps) {
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

  const data = await getBillingWorkspaceData(businessSlug);
  if (!data) redirect("/");
  const { business, subscription, openInvoice, openInvoiceManualPayment, availableUpgradePlans, pendingPlanUpgradeRequest, planUpgradeRequests } = data;

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
    <div className="flex flex-col bg-background">
      <div className="border-b border-border bg-card">
        <div className="px-4 sm:px-8 py-5 sm:py-6 max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <CreditCard className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Billing &amp; Referral</h1>
              <p className="text-xs text-muted-foreground">{business.name} subscription management.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-4 sm:py-6">
        <div className="max-w-6xl mx-auto w-full space-y-6">
          {submitSuccess ? (
            <div className="rounded-xl border border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-4 text-sm text-green-800 dark:text-green-400">
              Manual payment reference submitted. The ServiceFlow team will validate and mark the
              invoice once confirmed.
            </div>
          ) : null}
          {upgradeRequestSuccess ? (
            <div className="rounded-xl border border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4 text-sm text-blue-800 dark:text-blue-400">
              Upgrade request submitted. The ServiceFlow team will review and update your plan.
            </div>
          ) : null}
          {submitError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {submitError}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{subscription.plan.name}</p>
              <p className="text-sm text-muted-foreground">{subscription.plan.code}</p>
            </article>
            <article className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{subscription.status}</p>
              <p className="text-sm text-muted-foreground">
                Period ends {subscription.current_period_end.toLocaleDateString("en-PH")}
              </p>
            </article>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Plan Upgrade</h2>
                <p className="text-sm text-muted-foreground">
                  Request a higher plan when you need more features and limits.
                </p>
              </div>
            </div>

            {pendingPlanUpgradeRequest ? (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-400">
                  Pending request to {pendingPlanUpgradeRequest.target_plan.name} (
                  {pendingPlanUpgradeRequest.target_plan.code})
                </p>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-500">
                  Submitted {pendingPlanUpgradeRequest.created_at.toLocaleDateString("en-PH")}.
                  We will review this request shortly.
                </p>
              </div>
            ) : availableUpgradePlans.length > 0 ? (
              <form action={requestPlanUpgradeFormAction} className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 text-sm">
                  <Label htmlFor="target-plan-code">Target plan</Label>
                  <select
                    id="target-plan-code"
                    name="targetPlanCode"
                    required
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    defaultValue={availableUpgradePlans[0]?.code}
                  >
                    {availableUpgradePlans.map((plan) => (
                      <option key={plan.id} value={plan.code}>
                        {plan.name} ({formatCentavosToPhp(plan.price_amount)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 text-sm md:col-span-2">
                  <Label htmlFor="upgrade-note">Why are you upgrading? (optional)</Label>
                  <Textarea
                    id="upgrade-note"
                    name="note"
                    rows={2}
                    maxLength={1000}
                    placeholder="Example: Need Plus for growth opportunities and advanced reporting."
                    className="rounded-xl resize-none"
                  />
                </div>
                <div className="md:col-span-3">
                  <Button
                    type="submit"
                    className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                  >
                    Request Upgrade
                  </Button>
                </div>
              </form>
            ) : (
              <p className="mt-4 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                You are already on the highest available plan.
              </p>
            )}

            <div className="mt-6 overflow-x-auto">
              <h3 className="text-sm font-semibold text-foreground">Recent Upgrade Requests</h3>
              <div className="mt-2 rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Requested</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reviewed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {planUpgradeRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground py-4">
                          No upgrade requests yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      planUpgradeRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>{request.created_at.toLocaleDateString("en-PH")}</TableCell>
                          <TableCell>{request.current_plan.code}</TableCell>
                          <TableCell>{request.target_plan.code}</TableCell>
                          <TableCell>{request.status}</TableCell>
                          <TableCell>
                            {request.reviewed_at
                              ? request.reviewed_at.toLocaleDateString("en-PH")
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Invoices</h2>
                <p className="text-sm text-muted-foreground">
                  Generate invoices and settle billing with the ServiceFlow admin team.
                </p>
              </div>
              <form action={createInvoiceFormAction}>
                <Button
                  type="submit"
                  className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                >
                  Generate Invoice
                </Button>
              </form>
            </div>

            {openInvoice ? (
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-4">
                <p className="text-sm font-medium text-foreground">
                  Open Invoice: {formatCentavosToPhp(openInvoice.amount_due)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Due {openInvoice.due_at.toLocaleDateString("en-PH")}
                </p>
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-foreground/70">
                    Submit your payment reference here for faster verification.
                  </p>

                  {openInvoiceManualPayment?.reference ? (
                      <div className="rounded-xl border border-border bg-card p-3 text-xs text-foreground">
                        <p className="font-semibold">Latest submitted reference</p>
                        <p className="mt-1 text-muted-foreground">Reference: {openInvoiceManualPayment.reference}</p>
                        {typeof openInvoiceManualPayment.amountCentavos === "number" ? (
                          <p className="text-muted-foreground">
                            Amount:{" "}
                            {formatCentavosToPhp(openInvoiceManualPayment.amountCentavos)}
                          </p>
                        ) : null}
                        {openInvoiceManualPayment.submittedAt ? (
                          <p className="text-muted-foreground">
                            Submitted:{" "}
                            {new Date(openInvoiceManualPayment.submittedAt).toLocaleString(
                              "en-PH",
                            )}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <form action={submitManualPaymentFormAction} className="grid gap-2">
                      <Input
                        name="paymentReference"
                        placeholder="Payment reference"
                        required
                        className="rounded-xl"
                      />
                      <Input
                        name="amountPhp"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Amount paid (PHP, optional)"
                        className="rounded-xl"
                      />
                      <Input
                        name="proofUrl"
                        type="url"
                        placeholder="Proof URL (optional)"
                        className="rounded-xl"
                      />
                      <Textarea
                        name="note"
                        rows={2}
                        placeholder="Payment note (optional)"
                        className="rounded-xl resize-none"
                      />
                      <Button
                        type="submit"
                        className="w-fit rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                      >
                        Submit payment reference
                      </Button>
                    </form>
                  </div>
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Subtotal</TableHead>
                    <TableHead>Credit</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Manual Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscription.invoices.map((invoice) => {
                    const manualPayment = getManualPaymentMetadata(invoice.metadata);

                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>{invoice.created_at.toLocaleDateString("en-PH")}</TableCell>
                        <TableCell>{invoice.status}</TableCell>
                        <TableCell>{formatCentavosToPhp(invoice.amount_subtotal)}</TableCell>
                        <TableCell>{formatCentavosToPhp(invoice.amount_credit_applied)}</TableCell>
                        <TableCell>{formatCentavosToPhp(invoice.amount_due)}</TableCell>
                        <TableCell>
                          {manualPayment.reference ? (
                            <div className="text-xs">
                              <p className="font-medium text-primary">
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">Referral Program</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Share your code and earn free usage when referred businesses complete paid cycles.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <article className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Your Referral Code</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {subscription.business.referral_code?.code ?? "Not available"}
                </p>
              </article>
              <article className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Earned Credits</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatCentavosToPhp(
                    subscription.credits.reduce((sum, item) => sum + item.amount_total, 0),
                  )}
                </p>
              </article>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Referred Business</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscription.business.referral_attributions_as_referrer.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground py-4">
                        No referrals yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    subscription.business.referral_attributions_as_referrer.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.referred_business.name}</TableCell>
                        <TableCell>{item.status}</TableCell>
                        <TableCell>{item.created_at.toLocaleDateString("en-PH")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
