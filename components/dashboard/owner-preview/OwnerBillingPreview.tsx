import { OwnerWorkspaceLink as Link } from "@/components/dashboard/owner-preview/OwnerWorkspaceLink";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  Check,
  Copy,
  CreditCard,
  FileText,
  Gift,
  PhilippinePeso,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Invoice = {
  id: string;
  issued: string;
  period: string;
  status: "Paid" | "Credited";
  subtotal: number;
  credit: number;
  paid: number;
  reference: string;
};

const invoices: Invoice[] = [
  { id: "INV-2026-0906", issued: "Sep 6, 2026", period: "Sep 6 – Oct 5, 2026", status: "Paid", subtotal: 2499, credit: 0, paid: 2499, reference: "BDO-948217" },
  { id: "INV-2026-0806", issued: "Aug 6, 2026", period: "Aug 6 – Sep 5, 2026", status: "Paid", subtotal: 2499, credit: 500, paid: 1999, reference: "GCASH-731904" },
  { id: "INV-2026-0706", issued: "Jul 6, 2026", period: "Jul 6 – Aug 5, 2026", status: "Credited", subtotal: 2499, credit: 2499, paid: 0, reference: "Referral credit" },
  { id: "INV-2026-0606", issued: "Jun 6, 2026", period: "Jun 6 – Jul 5, 2026", status: "Paid", subtotal: 2499, credit: 0, paid: 2499, reference: "BPI-620145" },
];

const referrals = [
  { business: "Sage Nail Studio", joined: "Aug 28, 2026", status: "Qualified", credit: 500 },
  { business: "Lune Skin Atelier", joined: "Jul 11, 2026", status: "Rewarded", credit: 2499 },
  { business: "North & Mane", joined: "Jun 19, 2026", status: "Rewarded", credit: 2499 },
];

const number = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });

export function OwnerBillingPreview({ businessSlug, businessName }: { businessSlug: string; businessName: string }) {
  return (
      <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[128px]">
        <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">
          <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Link
                href={`/owner-dashboard-preview/${businessSlug}`}
                className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-[#696C67] outline-none transition-colors hover:text-[#20211F] focus-visible:ring-3 focus-visible:ring-[#72CF35]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
              </Link>
              <p className="text-sm font-semibold text-[#696C67]">{businessName} · Account and subscription</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <h1 className="text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-tight tracking-[-0.035em]">Billing</h1>
                <button type="button" disabled className="inline-flex min-h-11 shrink-0 cursor-not-allowed items-center gap-1.5 rounded-full bg-[#20211F] px-3.5 text-xs font-bold text-white opacity-45 sm:hidden">
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> Upgrade
                </button>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#696C67] sm:text-base">Track your plan, upcoming charges, earned credits, and payment history in one place.</p>
            </div>
            <button type="button" disabled className="hidden min-h-11 shrink-0 cursor-not-allowed items-center justify-center gap-2 self-start rounded-full bg-[#20211F] px-5 text-sm font-bold text-white opacity-45 sm:inline-flex lg:self-auto">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" /> Request plan upgrade
            </button>
          </header>

          <section aria-label="Billing overview" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <BillingKpi label="Current plan" value="Plus" detail="Monthly subscription" icon={Sparkles} tone="dark" />
            <BillingKpi label="Monthly rate" value={number.format(2499)} detail="Before earned credits" icon={PhilippinePeso} tone="lime" currency />
            <BillingKpi label="Next renewal" value="Oct 06" detail="20 days remaining" icon={CalendarClock} tone="neutral" />
            <BillingKpi label="Available credit" value={number.format(1200)} detail="Applies automatically" icon={Gift} tone="lime" currency />
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)] xl:items-stretch">
            <section aria-labelledby="current-plan-heading" className="rounded-[24px] border border-white bg-white p-4 shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:rounded-[30px] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ECEEE9] pb-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-[#20211F] text-white"><CreditCard className="h-5 w-5" aria-hidden="true" /></div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#696C67]">Current subscription</p>
                    <h2 id="current-plan-heading" className="mt-1 text-xl font-bold tracking-[-0.025em]">Plus plan</h2>
                  </div>
                </div>
                <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#EFF9E8] px-3 text-xs font-bold text-[#315E18]"><BadgeCheck className="h-4 w-4" aria-hidden="true" /> Active</span>
              </div>

              <div className="grid gap-5 pt-5 md:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)]">
                <div>
                  <p className="text-sm leading-6 text-[#696C67]">Built for growing teams that need advanced reporting, growth opportunities, and higher operating limits.</p>
                  <ul className="mt-4 grid gap-2.5 sm:grid-cols-2" aria-label="Plus plan inclusions">
                    {["10 team members", "Unlimited services", "Advanced reports", "Growth opportunities"].map((item) => (
                      <li key={item} className="flex min-h-11 items-center gap-2.5 rounded-[14px] bg-[#F7F8F5] px-3 text-sm font-semibold">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#EFF9E8] text-[#4D8F24]"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[18px] bg-[#E7E9E4] sm:grid-cols-3 md:grid-cols-1">
                  <PlanDetail label="Billing cycle" value="Monthly" />
                  <PlanDetail label="Period" value="Sep 6 – Oct 5" />
                  <PlanDetail label="Account owner" value="Avery Ong" />
                </dl>
              </div>
            </section>

            <section aria-labelledby="next-charge-heading" className="flex flex-col rounded-[24px] border border-white bg-white p-4 shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:rounded-[30px] sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#696C67]">Upcoming</p>
                  <h2 id="next-charge-heading" className="mt-1 text-lg font-bold tracking-[-0.02em]">Next charge</h2>
                </div>
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-[#EFF9E8] text-[#4D8F24]"><ReceiptText className="h-5 w-5" aria-hidden="true" /></div>
              </div>
              <div className="mt-5 rounded-[18px] bg-[#F7F8F5] p-4">
                <div className="flex items-end justify-between gap-3">
                  <div><p className="text-xs font-semibold text-[#696C67]">Due Oct 6, 2026</p><Peso value={1299} className="mt-2 text-[2rem]" /></div>
                  <span className="rounded-full bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#4D8F24]">₱1,200 credit applied</span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#E1E3DE]" role="progressbar" aria-label="Billing credit applied" aria-valuemin={0} aria-valuemax={100} aria-valuenow={48}><div className="h-full w-[48%] rounded-full bg-[#72CF35]" /></div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#F1F2EF] text-[#62655F]"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div>
                <div><p className="text-sm font-bold">Manual bank transfer</p><p className="mt-0.5 text-xs text-[#696C67]">Payment references are reviewed after submission.</p></div>
              </div>
              <button type="button" disabled className="mt-auto min-h-11 w-full cursor-not-allowed rounded-full border border-[#DDE0D9] bg-[#F8F9F6] px-4 text-sm font-bold text-[#696C67] opacity-55">Update payment method</button>
            </section>
          </div>

          <section aria-labelledby="invoice-history-heading" className="mt-4 overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:rounded-[30px]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECEEE9] p-4 sm:p-5">
              <div><h2 id="invoice-history-heading" className="text-base font-bold tracking-[-0.02em] sm:text-lg">Invoice history</h2><p className="mt-1 text-xs text-[#696C67]">Recent subscription invoices and applied credits</p></div>
              <button type="button" disabled className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-full border border-[#DDE0D9] bg-[#F8F9F6] px-4 text-xs font-bold text-[#696C67] opacity-55"><FileText className="h-4 w-4" aria-hidden="true" /> Download statement</button>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead><tr className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#696C67]">
                  <th scope="col" className="px-5 py-3">Invoice</th><th scope="col" className="px-4 py-3">Billing period</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3 text-right">Subtotal</th><th scope="col" className="px-4 py-3 text-right">Credit</th><th scope="col" className="px-4 py-3 text-right">Paid</th><th scope="col" className="px-5 py-3">Reference</th>
                </tr></thead>
                <tbody className="divide-y divide-[#ECEEE9]">
                  {invoices.map((invoice) => <InvoiceTableRow key={invoice.id} invoice={invoice} />)}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-[#ECEEE9] md:hidden">
              {invoices.map((invoice) => <InvoiceMobileRow key={invoice.id} invoice={invoice} />)}
            </ul>
          </section>

          <section aria-labelledby="referral-heading" className="mt-4 grid gap-4 xl:grid-cols-[minmax(270px,0.7fr)_minmax(0,1.3fr)]">
            <div className="rounded-[24px] border border-white bg-[#20211F] p-5 text-white shadow-[0_18px_45px_rgba(32,33,31,0.08)] sm:rounded-[30px] sm:p-6">
              <div className="grid h-11 w-11 place-items-center rounded-[15px] bg-white/10 text-[#9CE36B]"><Gift className="h-5 w-5" aria-hidden="true" /></div>
              <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/60">Referral program</p>
              <h2 id="referral-heading" className="mt-1 text-xl font-bold tracking-[-0.025em]">Share ServiceFlow, earn credits.</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">Credits are added after a referred business completes its first paid cycle.</p>
              <div className="mt-5 flex min-h-11 items-center justify-between gap-3 rounded-[14px] border border-white/10 bg-white/[0.06] px-3">
                <span className="font-mono text-sm font-bold tracking-[0.08em]">AVERY-PLUS</span>
                <button type="button" disabled aria-label="Copy referral code" className="grid h-11 w-11 shrink-0 cursor-not-allowed place-items-center rounded-[12px] text-white/55"><Copy className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:rounded-[30px]">
              <div className="flex items-center justify-between gap-3 border-b border-[#ECEEE9] p-4 sm:p-5">
                <div><h3 className="text-base font-bold tracking-[-0.02em] sm:text-lg">Referral activity</h3><p className="mt-1 text-xs text-[#696C67]">3 businesses joined through your code</p></div>
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-[#EFF9E8] text-[#4D8F24]"><Users className="h-5 w-5" aria-hidden="true" /></div>
              </div>
              <ul className="divide-y divide-[#ECEEE9]">
                {referrals.map((referral) => (
                  <li key={referral.business} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5">
                    <div><p className="text-sm font-bold">{referral.business}</p><p className="mt-1 text-xs text-[#696C67]">Joined {referral.joined}</p></div>
                    <span className={cn("w-fit rounded-full px-2.5 py-1 text-[10px] font-bold", referral.status === "Rewarded" ? "bg-[#EFF9E8] text-[#315E18]" : "bg-[#F1F2EF] text-[#62655F]")}>{referral.status}</span>
                    <div className="sm:text-right"><p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#696C67]">Credit</p><Peso value={referral.credit} className="mt-1 text-sm" /></div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </main>
  );
}

function BillingKpi({ label, value, detail, icon: Icon, tone, currency = false }: { label: string; value: string; detail: string; icon: LucideIcon; tone: "lime" | "dark" | "neutral"; currency?: boolean }) {
  return <article className="min-w-0 rounded-[26px] border border-white bg-white p-4 shadow-[0_14px_38px_rgba(32,33,31,0.045)] lg:p-[18px]">
    <div className={cn("grid h-9 w-9 place-items-center rounded-[12px]", tone === "dark" ? "bg-[#20211F] text-white" : tone === "neutral" ? "bg-[#F0F1EE] text-[#424440]" : "bg-[#EFF9E8] text-[#4D8F24]")}><Icon className="h-[17px] w-[17px]" aria-hidden="true" /></div>
    <p className="mt-4 text-xs font-semibold text-[#696C67]">{label}</p>
    <div className="mt-2 flex min-w-0 items-start font-mono text-[clamp(1.45rem,2.15vw,2.1rem)] font-semibold leading-none tracking-[-0.055em]">
      {currency ? <span className="mr-1 mt-[3px] font-[var(--font-body)] text-sm font-bold tracking-normal text-[#696C67]">₱</span> : null}<span className="truncate">{value}</span>
    </div>
    <p className="mt-2.5 text-[11px] font-medium leading-4 text-[#696C67]">{detail}</p>
  </article>;
}

function PlanDetail({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#F7F8F5] p-3.5"><dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#696C67]">{label}</dt><dd className="mt-1.5 text-sm font-bold">{value}</dd></div>;
}

function Peso({ value, className }: { value: number; className?: string }) {
  return <span className={cn("inline-flex items-start font-bold leading-none", className)}><span className="mr-1 mt-[0.2em] font-[var(--font-body)] text-[0.55em] text-[#696C67]">₱</span><span className="font-mono tracking-[-0.04em]">{number.format(value)}</span></span>;
}

function InvoiceStatus({ status }: { status: Invoice["status"] }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold", status === "Paid" ? "bg-[#EFF9E8] text-[#315E18]" : "bg-[#F1F2EF] text-[#62655F]")}>{status}</span>;
}

function InvoiceTableRow({ invoice }: { invoice: Invoice }) {
  return <tr className="text-sm">
    <td className="px-5 py-4"><p className="font-mono text-xs font-bold">{invoice.id}</p><p className="mt-1 text-[11px] text-[#696C67]">{invoice.issued}</p></td>
    <td className="px-4 py-4 text-xs font-semibold text-[#62655F]">{invoice.period}</td>
    <td className="px-4 py-4"><InvoiceStatus status={invoice.status} /></td>
    <td className="px-4 py-4 text-right"><Peso value={invoice.subtotal} className="text-xs" /></td>
    <td className="px-4 py-4 text-right"><Peso value={invoice.credit} className="text-xs text-[#4D8F24]" /></td>
    <td className="px-4 py-4 text-right"><Peso value={invoice.paid} className="text-xs" /></td>
    <td className="px-5 py-4 font-mono text-[11px] font-semibold text-[#696C67]">{invoice.reference}</td>
  </tr>;
}

function InvoiceMobileRow({ invoice }: { invoice: Invoice }) {
  return <li className="p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold">{invoice.id}</p><p className="mt-1 text-[11px] text-[#696C67]">{invoice.period}</p></div><InvoiceStatus status={invoice.status} /></div>
    <dl className="mt-3 grid grid-cols-3 gap-2 rounded-[14px] bg-[#F7F8F5] p-3">
      <div><dt className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#696C67]">Subtotal</dt><dd className="mt-1.5"><Peso value={invoice.subtotal} className="text-xs" /></dd></div>
      <div><dt className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#696C67]">Credit</dt><dd className="mt-1.5"><Peso value={invoice.credit} className="text-xs text-[#4D8F24]" /></dd></div>
      <div><dt className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#696C67]">Paid</dt><dd className="mt-1.5"><Peso value={invoice.paid} className="text-xs" /></dd></div>
    </dl>
    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[#696C67]"><span>{invoice.issued}</span><span className="truncate font-mono font-semibold">{invoice.reference}</span></div>
  </li>;
}
