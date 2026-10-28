"use client";

import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { OwnerBillingStudy } from "@/components/dashboard/design-study/OwnerBillingStudy";
import { OwnerBusinessLoading } from "@/components/dashboard/design-study/OwnerBusinessLoading";
import studyStyles from "@/components/dashboard/design-study/owner-business-workspace.module.css";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createOwnerSubscriptionInvoiceAction, requestOwnerPlanUpgradeAction, submitManualPaymentReferenceAction } from "@/features/billing/actions/subscription-owner";
import { ownerWorkspaceHref, useOwnerWorkspaceBasePath } from "@/components/dashboard/owner-preview/owner-preview-routing";
import {
  ArrowLeft, ArrowUpRight, BadgeCheck, BarChart3, CalendarClock, Check,
  CircleAlert, CreditCard, FileText, Globe2, Inbox, MessageCircle, ReceiptText, Sparkles,
  TrendingUp, type LucideIcon,
} from "lucide-react";
import { ownerPreviewKeys, ownerPreviewStaleTime } from "@/components/dashboard/owner-preview/owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { OwnerCatalogPreviewSkeleton } from "@/components/dashboard/owner-preview/OwnerCatalogPreviewSkeleton";
import { OwnerPreviewRefreshControl } from "@/components/dashboard/owner-preview/OwnerPreviewRefreshControl";
import type { OwnerBillingPreviewData } from "@/features/billing/types/owner-billing-preview";

type Subscription = NonNullable<OwnerBillingPreviewData["subscription"]>;
type Entitlement = keyof Subscription["entitlements"];
const entitlements: Array<{ key: Entitlement; label: string; icon: LucideIcon }> = [
  { key: "website", label: "Website", icon: Globe2 },
  { key: "growth", label: "Growth tools", icon: TrendingUp },
  { key: "social", label: "Social posts", icon: MessageCircle },
  { key: "ai", label: "AI tools", icon: Sparkles },
  { key: "reportsCore", label: "Core reports", icon: BarChart3 },
  { key: "reportsAdvanced", label: "Advanced reports", icon: FileText },
];
const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const date = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });

function readable(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Status({ status }: { status: string }) {
  const positive = ["ACTIVE", "PAID", "APPROVED", "COMPLETED"].includes(status.toUpperCase());
  return <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${positive ? "bg-[#EFF9E8] text-[#315E18]" : "bg-[#F1F2EF] text-[#525650]"}`}>{readable(status)}</span>;
}

function EmptyState({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return <div className="m-4 rounded-[20px] border border-dashed border-[#DDE0D9] bg-[#FAFBF9] px-4 py-9 text-center sm:m-5">
    <div className="mx-auto grid size-11 place-items-center rounded-[15px] bg-[#F1F2EF] text-[#696C67]"><Icon className="size-5" aria-hidden="true" /></div>
    <h3 className="mt-3 text-sm font-bold">{title}</h3><p className="mt-1 text-xs leading-5 text-[#696C67]">{detail}</p>
  </div>;
}

function PlanFeatures({ subscription }: { subscription: Subscription }) {
  const includedCount = Object.values(subscription.entitlements).filter(Boolean).length;
  return <section aria-labelledby="plan-features-heading" className="mt-5 rounded-[28px] border border-white bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="plan-features-heading" className="text-lg font-bold tracking-[-0.02em]">What your plan includes</h2><p className="mt-1 text-sm text-[#696C67]">Features available on {subscription.planName}</p></div>
      <span className="rounded-full bg-[#EFF9E8] px-3 py-1.5 text-xs font-semibold text-[#315E18]">{includedCount} included</span>
    </div>
    <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
      {entitlements.map(({ key, label, icon: Icon }) => {
        const included = subscription.entitlements[key];
        return <li key={key} className="min-w-0 rounded-[18px] bg-[#F7F8F5] p-3.5 sm:p-4">
          <div className={`grid size-9 place-items-center rounded-xl ${included ? "bg-[#EFF9E8] text-[#4D8F24]" : "bg-[#EAEBE7] text-[#696C67]"}`}><Icon className="size-[18px]" aria-hidden="true" /></div>
          <p className="mt-3 text-sm font-bold leading-5">{label}</p>
          <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${included ? "text-[#315E18]" : "text-[#696C67]"}`}>{included ? <Check className="size-3.5" aria-hidden="true" /> : null}{included ? "Included" : "Not included"}</p>
        </li>;
      })}
    </ul>
  </section>;
}

function SubscriptionOverview({ subscription, upgrades }: { subscription: Subscription; upgrades: string[] }) {
  const includedCount = Object.values(subscription.entitlements).filter(Boolean).length;
  const isActive = subscription.status.toUpperCase() === "ACTIVE";
  return <>
    <section aria-label="Subscription overview" className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
      <article className="relative overflow-hidden rounded-[28px] bg-[#20211F] p-5 text-white shadow-[0_18px_45px_rgba(32,33,31,0.08)] sm:p-7">
        <div className="absolute -right-10 -top-14 size-48 rounded-full border border-white/10" aria-hidden="true" />
        <div className="absolute -right-4 -top-7 size-32 rounded-full border border-white/10" aria-hidden="true" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="grid size-11 place-items-center rounded-[15px] bg-white/10 text-[#A6E479]"><CreditCard className="size-5" aria-hidden="true" /></div>
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold">{isActive ? <BadgeCheck className="size-4 text-[#A6E479]" aria-hidden="true" /> : <CircleAlert className="size-4 text-white/70" aria-hidden="true" />}{readable(subscription.status)}</span>
        </div>
        <div className="relative mt-8 flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-xs font-semibold text-white/70">Current plan</p><h2 className="mt-1 text-[clamp(1.7rem,3vw,2.5rem)] font-bold leading-tight tracking-[-0.035em]">{subscription.planName}</h2><p className="mt-2 text-sm text-white/70">{includedCount} of {entitlements.length} features included</p></div>
          <div className="flex min-h-11 items-center gap-2.5 rounded-2xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5"><CalendarClock className="size-4 shrink-0 text-[#A6E479]" aria-hidden="true" /><div><p className="text-[11px] text-white/70">Current period ends</p><p className="text-sm font-semibold">{subscription.periodEnd ? date.format(new Date(subscription.periodEnd)) : "No end date set"}</p></div></div>
        </div>
      </article>
      <article className="flex flex-col rounded-[28px] border border-white bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:p-6">
        <div className="flex items-start justify-between gap-4"><div className="grid size-11 place-items-center rounded-[15px] bg-[#EFF9E8] text-[#4D8F24]"><ArrowUpRight className="size-5" aria-hidden="true" /></div><span className="rounded-full bg-[#F1F2EF] px-2.5 py-1 text-xs font-semibold text-[#525650]">{upgrades.length} available</span></div>
        <h2 className="mt-5 text-lg font-bold tracking-[-0.02em]">Plan options</h2>
        {upgrades.length ? <><p className="mt-1 text-sm leading-6 text-[#696C67]">Higher plans available for your account</p><ul className="mt-4 flex flex-wrap gap-2">{upgrades.map((name) => <li key={name} className="rounded-full bg-[#EFF9E8] px-3 py-1.5 text-xs font-semibold text-[#315E18]">{name}</li>)}</ul></> : <p className="mt-1 text-sm leading-6 text-[#696C67]">No higher plan is currently available.</p>}
      </article>
    </section>
    <PlanFeatures subscription={subscription} />
  </>;
}

function InvoiceHistory({ invoices }: { invoices: OwnerBillingPreviewData["invoices"] }) {
  return <section aria-labelledby="invoice-heading" className="overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECEEE9] p-5 sm:p-6">
      <div className="flex items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#EFF9E8] text-[#4D8F24]"><ReceiptText className="size-5" aria-hidden="true" /></div><div><h2 id="invoice-heading" className="text-lg font-bold tracking-[-0.02em]">Invoices & payments</h2><p className="mt-0.5 text-xs text-[#696C67]">Your latest billing records</p></div></div>
      <span className="rounded-full bg-[#F1F2EF] px-3 py-1.5 text-xs font-semibold text-[#525650]">{invoices.length} {invoices.length === 1 ? "record" : "records"}</span>
    </div>
    {invoices.length ? <>
      <div className="hidden md:block"><table className="w-full text-left text-sm"><thead className="bg-[#F8F9F6] text-[11px] font-semibold text-[#696C67]"><tr><th scope="col" className="px-6 py-3">Issued</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3 text-right">Subtotal</th><th scope="col" className="px-6 py-3 text-right">Amount due</th></tr></thead><tbody className="divide-y divide-[#ECEEE9]">{invoices.map((invoice) => <tr key={invoice.id}><td className="px-6 py-4 font-semibold">{date.format(new Date(invoice.createdAt))}</td><td className="px-4 py-4"><Status status={invoice.status} /></td><td className="px-4 py-4 text-right font-mono text-xs">{currency.format(invoice.amountSubtotal / 100)}</td><td className="px-6 py-4 text-right font-mono text-xs font-semibold">{currency.format(invoice.amountDue / 100)}</td></tr>)}</tbody></table></div>
      <ul className="divide-y divide-[#ECEEE9] md:hidden">{invoices.map((invoice) => <li key={invoice.id} className="p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">{date.format(new Date(invoice.createdAt))}</p><Status status={invoice.status} /></div><dl className="mt-3 grid grid-cols-2 gap-3 rounded-[14px] bg-[#F7F8F5] p-3"><div><dt className="text-xs text-[#696C67]">Subtotal</dt><dd className="mt-1 font-mono text-sm font-semibold">{currency.format(invoice.amountSubtotal / 100)}</dd></div><div><dt className="text-xs text-[#696C67]">Amount due</dt><dd className="mt-1 font-mono text-sm font-semibold">{currency.format(invoice.amountDue / 100)}</dd></div></dl></li>)}</ul>
    </> : <EmptyState icon={FileText} title="No invoices yet" detail="Invoices and payment records will appear here when available." />}
  </section>;
}

function UpgradeRequests({ requests }: { requests: OwnerBillingPreviewData["upgradeRequests"] }) {
  return <section aria-labelledby="upgrade-requests-heading" className="overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)]">
    <div className="flex items-center gap-3 border-b border-[#ECEEE9] p-5 sm:p-6"><div className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#F1F2EF] text-[#525650]"><ArrowUpRight className="size-5" aria-hidden="true" /></div><div><h2 id="upgrade-requests-heading" className="text-lg font-bold tracking-[-0.02em]">Upgrade requests</h2><p className="mt-0.5 text-xs text-[#696C67]">Plan change history</p></div></div>
    {requests.length ? <ul className="divide-y divide-[#ECEEE9]">{requests.map((request) => <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"><div><p className="text-sm font-bold">{readable(request.currentPlanCode)} <span className="text-[#696C67]">→</span> {readable(request.targetPlanCode)}</p><p className="mt-1 text-xs text-[#696C67]">Plan change</p></div><Status status={request.status} /></li>)}</ul> : <EmptyState icon={Inbox} title="No upgrade requests" detail="Plan change requests will appear here." />}
  </section>;
}

export function OwnerBillingPreviewQuery({ redesign = false, fontClassName = "" }: { redesign?: boolean; fontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const basePath = useOwnerWorkspaceBasePath();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const previewFetch = useOwnerPreviewFetch();
  const query = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "billing", "page"),
    queryFn: ({ signal }) => previewFetch<OwnerBillingPreviewData>(`/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/billing`, { signal }),
    staleTime: ownerPreviewStaleTime.billing,
  });
  if (!query.data && query.isPending) return redesign ? <OwnerBusinessLoading page="billing" /> : <OwnerCatalogPreviewSkeleton label="billing preview" />;
  const refreshControl = <OwnerPreviewRefreshControl label="billing" isFetching={query.isFetching} updatedAt={query.dataUpdatedAt} error={query.isError ? "Refresh failed; showing saved data if available." : null} onRefresh={() => { void query.refetch(); }} />;
  if (!query.data && redesign) return <div className={studyStyles.page}><div className={studyStyles.empty}><CreditCard size={28} aria-hidden="true"/><h1>Billing unavailable</h1><p role="alert">We couldn’t load your billing details.</p><button type="button" disabled={query.isFetching} className={studyStyles.primary} onClick={() => void query.refetch()}>Try again</button></div></div>;
  if (!query.data) return <main className="px-4 py-8 md:pl-[160px]"><h1 className="text-2xl font-bold">Billing unavailable</h1><div className="mt-4">{refreshControl}</div></main>;
  const { businessName, subscription, availableUpgradePlanNames, invoices, upgradeRequests } = query.data;
  const openInvoice = invoices.find((invoice) => invoice.status === "OPEN");
  async function runBillingAction(action: () => Promise<{ success: boolean; error?: string }>, successMessage: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    const notify = (message: string, success = false) => { if (redesign) { if (success) toast.success(message); else toast.error(message); } else setFeedback(message); };
    setBusy(true);
    setFeedback(null);
    try {
      const result = await action();
      if (!result.success) { notify(result.error || "Billing update failed."); return; }
      notify(successMessage, true);
      if (redesign) {
        try { await queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "billing", "page") }, { throwOnError: true }); }
        catch { toast.error("Billing was updated, but the latest records could not be loaded. Refresh to confirm."); }
      } else await queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "billing", "page") });
    } catch { notify("Billing update failed. Please retry."); }
    finally { setBusy(false); actionLock.current = false; }
  }
  function submitUpgrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runBillingAction(() => requestOwnerPlanUpgradeAction({ targetPlanCode: String(form.get("targetPlanCode") || ""), note: String(form.get("note") || "") || undefined }), "Upgrade request submitted for review.");
  }
  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openInvoice) return;
    const form = new FormData(event.currentTarget);
    const amountPhp = String(form.get("amountPhp") || "").trim();
    const amountCentavos = amountPhp ? Math.round(Number(amountPhp) * 100) : undefined;
    void runBillingAction(() => submitManualPaymentReferenceAction({ invoiceId: openInvoice.id, paymentReference: String(form.get("paymentReference") || "").trim(), amountCentavos, note: String(form.get("note") || "") || undefined, proofUrl: String(form.get("proofUrl") || "") || undefined }), "Payment reference submitted for review. Your invoice remains open until confirmed.");
  }
  if (redesign) return <>{query.isError && <p role="alert" className={studyStyles.notice}>Refresh failed. Showing your last loaded billing details.</p>}<OwnerBillingStudy fontClassName={fontClassName} data={query.data} busy={busy} onInvoice={() => { void runBillingAction(() => createOwnerSubscriptionInvoiceAction(), "Invoice generated."); }} onPayment={submitPayment} onUpgrade={submitUpgrade}/></>;
  return <main className="min-h-dvh bg-[#F5F6F3] pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-[#20211F] md:pl-[128px] md:pb-10">
    <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href={ownerWorkspaceHref(basePath, identity.businessSlug)} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-[#696C67] outline-none transition-colors hover:text-[#20211F] focus-visible:ring-3 focus-visible:ring-[#72CF35]/40"><ArrowLeft className="size-4" aria-hidden="true" /> Dashboard</Link>
          <p className="text-sm font-semibold text-[#696C67]">{businessName} · Account and subscription</p>
          <h1 className="mt-2 text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-tight tracking-[-0.035em]">Billing</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#696C67] sm:text-base">Your subscription, plan features, and billing activity in one place.</p>
        </div>
        <div className="shrink-0 sm:pb-1">{refreshControl}</div>
      </header>
      {subscription ? <SubscriptionOverview subscription={subscription} upgrades={availableUpgradePlanNames} /> : <section className="mt-6 rounded-[28px] border border-white bg-white p-6 shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:p-8"><div className="grid size-11 place-items-center rounded-[15px] bg-[#F1F2EF] text-[#696C67]"><CreditCard className="size-5" aria-hidden="true" /></div><h2 className="mt-5 text-lg font-bold">No subscription record</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#696C67]">Contact support if your plan should be active.</p></section>}
      {feedback && <p role="status" className="mt-5 rounded-2xl border border-[#DDE0D9] bg-white p-4 text-sm">{feedback}</p>}
      {subscription && <section aria-label="Billing actions" className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-[28px] bg-white p-5 sm:p-6"><h2 className="text-lg font-bold">Invoices</h2><p className="mt-1 text-sm text-[#696C67]">Generate an invoice for your current subscription period.</p><button type="button" disabled={busy} onClick={() => { void runBillingAction(() => createOwnerSubscriptionInvoiceAction(), "Invoice generated."); }} className="mt-4 min-h-11 rounded-full bg-[#20211F] px-5 text-sm font-bold text-white disabled:opacity-50">Generate invoice</button>
          {openInvoice && <form onSubmit={submitPayment} className="mt-5 grid gap-3 border-t border-[#ECEEE9] pt-5"><h3 className="text-sm font-bold">Submit payment reference</h3><p className="text-xs text-[#696C67]">Open invoice: {currency.format(openInvoice.amountDue / 100)} · due {date.format(new Date(openInvoice.dueAt))}</p>{openInvoice.paymentReference && <p className="text-xs">Latest reference: {openInvoice.paymentReference}</p>}<input name="paymentReference" required placeholder="Payment reference" aria-label="Payment reference" className="min-h-11 rounded-xl border px-3 text-sm" /><input name="amountPhp" type="number" min="0.01" step="0.01" placeholder="Amount paid in PHP (optional)" aria-label="Amount paid in PHP" className="min-h-11 rounded-xl border px-3 text-sm" /><input name="proofUrl" type="url" placeholder="Proof URL (optional)" aria-label="Proof URL" className="min-h-11 rounded-xl border px-3 text-sm" /><textarea name="note" placeholder="Payment note (optional)" aria-label="Payment note" className="min-h-20 rounded-xl border p-3 text-sm" /><button type="submit" disabled={busy} className="min-h-11 rounded-full bg-[#20211F] px-5 text-sm font-bold text-white disabled:opacity-50">Submit reference</button></form>}
        </div>
        <div className="rounded-[28px] bg-white p-5 sm:p-6"><h2 className="text-lg font-bold">Plan upgrade</h2>{query.data.pendingUpgradeRequest ? <p className="mt-3 text-sm">Request to {readable(query.data.pendingUpgradeRequest.targetPlanCode)} is pending review.</p> : query.data.availableUpgradePlans.length ? <form onSubmit={submitUpgrade} className="mt-4 grid gap-3"><label className="text-xs font-bold" htmlFor="targetPlanCode">Target plan</label><select id="targetPlanCode" name="targetPlanCode" required className="min-h-11 rounded-xl border px-3 text-sm">{query.data.availableUpgradePlans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name} ({currency.format(plan.priceAmount / 100)})</option>)}</select><textarea name="note" placeholder="Reason (optional)" aria-label="Reason" className="min-h-20 rounded-xl border p-3 text-sm" /><button type="submit" disabled={busy} className="min-h-11 rounded-full bg-[#20211F] px-5 text-sm font-bold text-white disabled:opacity-50">Request upgrade</button></form> : <p className="mt-3 text-sm text-[#696C67]">No higher plan is available.</p>}</div>
      </section>}
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)] xl:items-start"><InvoiceHistory invoices={invoices} /><UpgradeRequests requests={upgradeRequests} /></div>
      {query.data.referral && <section aria-labelledby="referral-heading" className="mt-5 rounded-[28px] bg-white p-5 sm:p-6"><h2 id="referral-heading" className="text-lg font-bold">Referral program</h2><p className="mt-1 text-sm text-[#696C67]">Share your code and earn credits from completed paid cycles.</p><dl className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#F7F8F5] p-4"><dt className="text-xs text-[#696C67]">Your referral code</dt><dd className="mt-1 text-lg font-bold">{query.data.referral.code || "Not available"}</dd></div><div className="rounded-2xl bg-[#F7F8F5] p-4"><dt className="text-xs text-[#696C67]">Earned credits</dt><dd className="mt-1 text-lg font-bold">{currency.format(query.data.referral.earnedCredits / 100)}</dd></div></dl><h3 className="mt-5 text-sm font-bold">Referred businesses</h3>{query.data.referral.attributions.length ? <ul className="mt-2 divide-y">{query.data.referral.attributions.map((item) => <li key={item.id} className="flex justify-between gap-3 py-3 text-sm"><span>{item.businessName}</span><span>{readable(item.status)} · {date.format(new Date(item.createdAt))}</span></li>)}</ul> : <p className="mt-2 text-sm text-[#696C67]">No referrals yet.</p>}</section>}
    </div>
  </main>;
}
