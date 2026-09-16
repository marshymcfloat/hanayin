import {
  createSubscriptionInvoiceAction,
  markInvoicePaidManuallyAction,
} from "@/features/platform/actions/platform-admin";
import { redirect } from "next/navigation";
import { getPlatformInvoicesData } from "@/features/platform/queries/invoices";
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
  PlatformStatusBadge,
  formatPhpFromCentavos,
  formatPlatformDate,
  platformInputClass,
  platformPanelClass,
  platformSecondaryButtonClass,
  platformTableCellClass,
  platformTableClass,
  platformTableContainerClass,
  platformTableHeadClass,
  platformTableWrapCellClass,
} from "../_components/platform-ui";

type PlatformInvoicesPageProps = {
  searchParams?: PlatformSearchParams;
};

const PENDING_INVOICE_STATUSES = new Set(["OPEN", "DRAFT"]);

function getPendingInvoiceAgeInfo(createdAt: Date) {
  const hours = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60));

  if (hours >= 72) {
    return {
      label: "72h+ open",
      className: "border-rose-200 bg-rose-50 text-rose-700",
      hours,
    };
  }

  if (hours >= 24) {
    return {
      label: "24h+ open",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      hours,
    };
  }

  return {
    label: "<24h open",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    hours,
  };
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export default async function PlatformInvoicesPage({
  searchParams,
}: PlatformInvoicesPageProps) {
  const flash = await getPlatformFlashMessage(searchParams);
  const data = await getPlatformInvoicesData();
  if (!data) redirect("/");
  const { invoices, subscriptions } = data;

  async function createInvoiceFormAction(subscriptionId: string) {
    "use server";
    try {
      const result = await createSubscriptionInvoiceAction(subscriptionId, "ADMIN_MANUAL");
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/invoices", result.error));
      }

      redirect(buildPlatformSuccessPath("/platform/invoices", "Invoice created."));
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/invoices",
          toActionErrorMessage(error, "Unable to create invoice."),
        ),
      );
    }
  }

  async function markPaidManualFormAction(invoiceId: string, formData: FormData) {
    "use server";
    try {
      const paymentReference = String(formData.get("paymentReference") || "");
      const result = await markInvoicePaidManuallyAction({
        invoiceId,
        paymentReference,
      });
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/invoices", result.error));
      }

      redirect(buildPlatformSuccessPath("/platform/invoices", "Invoice marked paid."));
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/invoices",
          toActionErrorMessage(error, "Unable to mark invoice as paid."),
        ),
      );
    }
  }

  const openCount = invoices.filter((invoice) => invoice.status === "OPEN").length;
  const paidCount = invoices.filter((invoice) => invoice.status === "PAID").length;
  const failedCount = invoices.filter((invoice) => ["FAILED", "VOID", "EXPIRED"].includes(invoice.status)).length;
  const pending24hCount = invoices.filter((invoice) => {
    if (!PENDING_INVOICE_STATUSES.has(invoice.status)) return false;
    return getPendingInvoiceAgeInfo(invoice.created_at).hours >= 24;
  }).length;
  const pending72hCount = invoices.filter((invoice) => {
    if (!PENDING_INVOICE_STATUSES.has(invoice.status)) return false;
    return getPendingInvoiceAgeInfo(invoice.created_at).hours >= 72;
  }).length;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Invoice Operations"
        description="Create invoices, retry failed collections, and reconcile payments with clear status tracking."
      />
      {flash ? <PlatformFlashNotice flash={flash} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <PlatformMetricCard label="Total Invoices" value={invoices.length} />
        <PlatformMetricCard label="Open Invoices" value={openCount} />
        <PlatformMetricCard label="Paid Invoices" value={paidCount} tone="accent" />
        <PlatformMetricCard label="Failed/Void/Expired" value={failedCount} />
        <PlatformMetricCard label="Open 24h+" value={pending24hCount} />
        <PlatformMetricCard label="Open 72h+" value={pending72hCount} />
      </div>

      {(() => {
        // Surface invoices where the owner submitted a payment reference
        // but admin hasn't marked them paid yet -- previously these
        // were buried in the unified queue and required scanning every
        // row for the green Ref: badge.
        const awaiting = invoices.filter((invoice) => {
          if (!PENDING_INVOICE_STATUSES.has(invoice.status)) return false;
          const metadata = asObject(invoice.metadata);
          return Boolean(metadata.manual_payment_reference);
        });
        if (awaiting.length === 0) return null;
        return (
          <section className={`${platformPanelClass} border-emerald-200 bg-emerald-50/30 p-5 sm:p-6`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-[var(--pf-text)]">
                Awaiting your review ({awaiting.length})
              </h3>
              <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Owner submitted
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--pf-muted)]">
              Owners submitted a payment reference. Verify off-platform, then confirm here.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {awaiting.map((invoice) => {
                const metadata = asObject(invoice.metadata);
                const reference = asOptionalString(metadata.manual_payment_reference);
                const submittedAt = asOptionalString(metadata.manual_payment_submitted_at);
                const proofUrl = asOptionalString(metadata.manual_payment_proof_url);
                return (
                  <article
                    key={invoice.id}
                    className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--pf-text)]">
                          {invoice.business.name}
                        </p>
                        <p className="text-xs text-[var(--pf-muted)]">
                          {invoice.plan.code} &middot;{" "}
                          {formatPhpFromCentavos(invoice.amount_due)}
                        </p>
                      </div>
                      <PlatformStatusBadge status={invoice.status} />
                    </div>
                    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-[var(--pf-muted)]">
                      <dt>Reference</dt>
                      <dd className="font-mono font-semibold text-emerald-700">
                        {reference}
                      </dd>
                      {submittedAt ? (
                        <>
                          <dt>Submitted</dt>
                          <dd>{formatPlatformDate(new Date(submittedAt))}</dd>
                        </>
                      ) : null}
                      {proofUrl ? (
                        <>
                          <dt>Proof</dt>
                          <dd>
                            <a
                              href={proofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-700 underline hover:text-emerald-800"
                            >
                              View attachment
                            </a>
                          </dd>
                        </>
                      ) : null}
                    </dl>
                    <form
                      action={markPaidManualFormAction.bind(null, invoice.id)}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        name="paymentReference"
                        defaultValue={reference ?? ""}
                        placeholder="Payment reference"
                        className={`${platformInputClass} h-9 flex-1 min-w-[10rem]`}
                        required
                      />
                      <button
                        type="submit"
                        className={`${platformSecondaryButtonClass} border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-200`}
                      >
                        Confirm Paid
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })()}

      <section className={`${platformPanelClass} p-5 sm:p-6`}>
        <h3 className="text-lg font-semibold tracking-tight text-[var(--pf-text)]">Manual Invoice Creation</h3>
        <p className="mt-1 text-sm text-[var(--pf-muted)]">
          Generate invoices directly for subscriptions that need operator-assisted billing.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {subscriptions.map((sub) => (
            <article
              key={sub.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-surface-soft)]/70 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--pf-text)]">{sub.business.name}</p>
                <p className="text-xs text-[var(--pf-muted)]">{sub.plan.code}</p>
              </div>
              <form action={createInvoiceFormAction.bind(null, sub.id)}>
                <button type="submit" className={platformSecondaryButtonClass}>
                  Create Invoice
                </button>
              </form>
            </article>
          ))}
        </div>
      </section>

      <section className={`${platformPanelClass} p-5 sm:p-6`}>
        <h3 className="text-lg font-semibold tracking-tight text-[var(--pf-text)]">Invoice Queue</h3>
        <p className="mt-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Mark invoices as paid with your off-platform payment reference.
        </p>
        <div className={`mt-4 ${platformTableContainerClass}`}>
          <table className={platformTableClass}>
            <thead>
              <tr className="border-b border-[var(--pf-border)]">
                <th className={platformTableHeadClass}>Business</th>
                <th className={platformTableHeadClass}>Plan</th>
                <th className={platformTableHeadClass}>Status</th>
                <th className={platformTableHeadClass}>Due</th>
                <th className={platformTableHeadClass}>Amount</th>
                <th className={platformTableHeadClass}>Created</th>
                <th className={platformTableHeadClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const isPending = PENDING_INVOICE_STATUSES.has(invoice.status);
                const pendingAgeInfo = isPending
                  ? getPendingInvoiceAgeInfo(invoice.created_at)
                  : null;
                const metadata = asObject(invoice.metadata);
                const ownerPaymentReference = asOptionalString(
                  metadata.manual_payment_reference,
                );

                return (
                  <tr key={invoice.id} className="border-b border-[var(--pf-border)]/80 last:border-0">
                    <td className={`${platformTableCellClass} min-w-[180px] max-w-[260px] ${platformTableWrapCellClass}`}>
                      <p className="font-medium text-[var(--pf-text)]">{invoice.business.name}</p>
                      <p className="text-xs text-[var(--pf-muted)]">{invoice.business.slug}</p>
                    </td>
                    <td className={platformTableCellClass}>{invoice.plan.code}</td>
                    <td className={platformTableCellClass}>
                      <div className="flex flex-col gap-1">
                        <PlatformStatusBadge status={invoice.status} />
                        {pendingAgeInfo ? (
                          <span
                            className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pendingAgeInfo.className}`}
                          >
                            {pendingAgeInfo.label}
                          </span>
                        ) : null}
                        {ownerPaymentReference ? (
                          <span className="text-[11px] font-medium text-emerald-700">
                            Ref: {ownerPaymentReference}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={platformTableCellClass}>{formatPlatformDate(invoice.due_at)}</td>
                    <td className={platformTableCellClass}>{formatPhpFromCentavos(invoice.amount_due)}</td>
                    <td className={platformTableCellClass}>{formatPlatformDate(invoice.created_at)}</td>
                    <td className={`${platformTableCellClass} min-w-[260px]`}>
                      <div className="flex flex-wrap gap-2">
                        {invoice.status === "PAID" ? (
                          <span className="text-xs font-medium text-[var(--pf-muted)]">Settled</span>
                        ) : (
                          <form
                            action={markPaidManualFormAction.bind(null, invoice.id)}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input
                              name="paymentReference"
                              placeholder="Payment reference"
                              className={`${platformInputClass} h-9 w-44`}
                              required
                            />
                            <button
                              type="submit"
                              className={`${platformSecondaryButtonClass} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                            >
                              Mark Paid
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
