"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, CircleCheck, Clock3, Layers3, MessageCircle, Plus, ReceiptText, Scissors, TrendingUp, UserRound, Users, type LucideIcon } from "lucide-react";
import OwnerDashboardShell from "@/components/dashboard/design-study/OwnerDashboardShell";
import { DashboardCardPlaceholder, DashboardOverviewPlaceholder } from "@/components/dashboard/design-study/OwnerRedesignLoading";
import OverviewSummary from "@/components/dashboard/design-study/OverviewSummary";
import DashboardRefreshButton from "@/components/dashboard/design-study/DashboardRefreshButton";
import styles from "@/components/dashboard/design-study/owner-dashboard-study.module.css";
import SalesChartStudy from "@/components/dashboard/design-study/SalesChartStudy";
import TopServicesMotion from "@/components/dashboard/design-study/TopServicesMotion";
import InsightSpanSelect from "@/components/dashboard/design-study/InsightSpanSelect";
import type { OwnerRedesignAnalytics, InsightSpan } from "@/features/dashboard/types/owner-redesign";
import type { OwnerDashboardTodayDto, OwnerDashboardQueueDto, OwnerDashboardGrowthDto } from "@/features/dashboard/types/owner-dashboard-preview";
import type { QueueAction, ExpenseDraft, MutationResult } from "@/components/dashboard/design-study/OwnerRedesignQuery";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShoppingBag, Zap, House, Wrench, Megaphone, Settings2, BriefcaseBusiness, Ellipsis, ArrowRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses/constants";
import { TIMEZONE_PH } from "@/lib/date-utils";
import { format } from "date-fns";
import { AnimatedValue, useSelectionMotion } from "@/components/bookings/design-study/SelectionMotion";

const money = (value: number) => `₱${value.toLocaleString("en-PH", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
const expenseMoney = (cents: number) => money(Math.round(cents) / 100);
const wholeMoney = (value: number) => money(Math.round(value * 100) / 100);
const visitsLabel = (value: number) => `${Math.round(value)} visits`;
const expenseCategories = Object.values(EXPENSE_CATEGORY_LABELS);
const expenseKeys = Object.keys(EXPENSE_CATEGORY_LABELS) as (keyof typeof EXPENSE_CATEGORY_LABELS)[];
const expenseIcons = [ShoppingBag, Zap, House, Wrench, Megaphone, Settings2, BriefcaseBusiness, Ellipsis];
type QueueStatus = "Pending" | "In progress" | "Done";
const queueEmptyStates = {
  Pending: { icon: Layers3, title: "Queue is clear.", description: "New pending services will appear here, ready to claim." },
  "In progress": { icon: Clock3, title: "Nothing in progress.", description: "Claim a pending service to start your next treatment." },
  Done: { icon: CircleCheck, title: "No completed services yet.", description: "Services you finish today will appear here." },
} satisfies Record<QueueStatus, { icon: LucideIcon; title: string; description: string }>;

function DashboardEmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className={styles.emptyState} data-dashboard-empty role="status">
    <div className={styles.emptyArtwork} aria-hidden="true"><span className={styles.emptyBackCard} /><span className={styles.emptyIconCard}><Icon size={27} strokeWidth={1.5} /><i /><i /></span><span className={styles.emptyDot} /></div>
    <h3>{title}</h3><p>{description}</p>
  </div>;
}
export type OwnerDashboardStudyProps = {
  fontClassName?: string;
  business?: { name: string; slug: string };
  ownerName?: string;
  onSignOut?: () => Promise<void>;
  analytics?: OwnerRedesignAnalytics;
  today?: OwnerDashboardTodayDto;
  queueData?: Pick<OwnerDashboardQueueDto, "queue">;
  growth?: OwnerDashboardGrowthDto["growth"];
  analyticsError?: boolean; todayError?: boolean; queueError?: boolean; growthError?: boolean;
  pending: boolean; refreshing?: boolean; refreshError: boolean;
  refreshControl?: ReactNode;
  onRefresh: () => void;
  onBooking: (focusKey?: string) => void;
  onQueueAction: (id: number, action: QueueAction) => Promise<MutationResult>;
  onExpense: (draft: ExpenseDraft) => Promise<MutationResult>;
};
export default function OwnerDashboardStudy({ fontClassName = "", business, ownerName, onSignOut, analyticsError, todayError, queueError, growthError, analytics, today, queueData, growth, pending, refreshing, refreshControl, refreshError, onRefresh, onBooking, onQueueAction, onExpense }: OwnerDashboardStudyProps) {
  const studyRef = useRef<HTMLDivElement>(null);
  const appointments = (today?.bookings ?? []).map(item => ({ ...item, name: item.customer, end: item.duration, status: item.status === "In service" ? "In progress" : item.status }));
  const businessPath = `/app/${encodeURIComponent(business?.slug ?? analytics?.business.slug ?? "")}`;
  const [serviceSpan, setServiceSpan] = useState<InsightSpan>("Month");
  const [staffSpan, setStaffSpan] = useState<InsightSpan>("Month");
  const [customerSpan, setCustomerSpan] = useState<InsightSpan>("Month");
  const topServices = analytics?.periods[serviceSpan].topServices ?? [];
  const topStaff = analytics?.periods[staffSpan].staff ?? [];
  const topCustomers = analytics?.periods[customerSpan].topCustomers ?? [];
  const captureServices = useSelectionMotion(studyRef, `${serviceSpan}:${topServices.map(item => `${item.id}:${item.revenue}`).join(",")}`, "services");
  const captureStaff = useSelectionMotion(studyRef, `${staffSpan}:${topStaff.map(item => `${item.id}:${item.revenue}`).join(",")}`, "staff");
  const captureCustomers = useSelectionMotion(studyRef, `${customerSpan}:${topCustomers.map(item => `${item.id}:${item.amount}`).join(",")}`, "customers");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseError, setExpenseError] = useState("");
  const [expenseDate, setExpenseDate] = useState<Date>();
  const [expenseCalendarOpen, setExpenseCalendarOpen] = useState(false);
  const openExpense = (open: boolean) => {
    if (pending) return;
    if (open) {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE_PH, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      setExpenseError("");
      setExpenseDate(new Date(`${today}T12:00:00`));
    }
    setExpenseCalendarOpen(false);
    setExpenseOpen(open);
  };
  const expenseAmounts = expenseCategories.map(label => Math.round((analytics?.expenses.find(item => item.label === label)?.amount ?? 0) * 100));
  const [expenseNotice, setExpenseNotice] = useState("");
  const expenseTotal = expenseAmounts.reduce((total, amount) => total + amount, 0);
  const [queueTab, setQueueTab] = useState<QueueStatus>("Pending");
  const queueItems = (queueData?.queue ?? []).map(item => ({ ...item, status: (item.status === "PENDING" ? "Pending" : item.status === "COMPLETED" ? "Done" : "In progress") as QueueStatus }));
  const [queueNotice, setQueueNotice] = useState("");
  const captureQueue = useSelectionMotion(studyRef, `${queueTab}:${queueItems.map(item => `${item.id}:${item.status}`).join(",")}`, "queue");
  const captureExpenses = useSelectionMotion(studyRef, expenseAmounts.join(","), "expense");
  const queueRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (queueNotice) queueRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
  }, [queueNotice]);
  const moveQueueItem = async (id: number, action: QueueAction, status: QueueStatus) => {
    if (pending) return;
    captureQueue();
    const result = await onQueueAction(id, action);
    if (result.success) { setQueueTab(status); setQueueNotice(`Service moved to ${status.toLowerCase()}.`); }
    else setQueueNotice(result.error ?? "Unable to update service.");
  };
  return (
    <OwnerDashboardShell rootRef={studyRef} fontClassName={fontClassName} business={business ?? analytics?.business} ownerName={ownerName} onSignOut={onSignOut} pendingCount={queueData ? queueItems.filter(item => item.status === "Pending").length : undefined} refreshControl={refreshControl ?? <DashboardRefreshButton refreshing={refreshing} pending={pending} onRefresh={onRefresh} />} onBooking={onBooking}>
            {refreshError && <p role="alert">Refresh failed. Showing the last available data; use Refresh data to retry.</p>}
            {analytics ? <OverviewSummary data={analytics} /> : <DashboardOverviewPlaceholder failed={analyticsError} onRetry={onRefresh} />}
            <div className={styles.grid}>
              {analytics ? <SalesChartStudy className={`${styles.card} ${styles.performance}`} fontClassName={fontClassName} periods={analytics.periods} /> : <DashboardCardPlaceholder kind="performance" failed={analyticsError} onRetry={onRefresh} />}
              {today ? <section className={`${styles.card} ${styles.appointments}`} id="appointments" aria-labelledby="appointments-heading">
                <div className={styles.cardHead}><div><h2 id="appointments-heading">Today’s bookings <span className={styles.count}>{appointments.length}</span></h2><p>A little rhythm for your day.</p></div><span className={styles.agendaIcon}><CalendarDays size={18} aria-hidden="true" /></span></div>
                <dl className={styles.agendaSummary}>
                  <div><dt>In progress</dt><dd>{appointments.filter(item => item.status === "In progress").length}<i aria-hidden="true" /></dd></div>
                  <div><dt>Coming up</dt><dd>{appointments.filter(item => item.status === "Confirmed").length}</dd></div>
                  <div><dt>Listed visits</dt><dd>{appointments.length}</dd></div>
                </dl>
                <ol className={styles.bookingList}>{appointments.map(item => <li key={item.id} data-active={item.status === "In progress"}>
                  <div className={styles.agendaTime}><time>{item.time}</time><span>{item.end}</span></div>
                  <span className={styles.avatar} aria-hidden="true"><UserRound size={15} /></span>
                  <div className={styles.agendaDetails}><div className={styles.agendaName}><strong>{item.name}</strong></div><p>{item.service}</p><div className={styles.agendaMeta}><span className={styles.agendaStaff}>{item.staff}</span><span className={styles.status} data-active={item.status === "In progress"}>{item.status}</span></div></div>
                </li>)}</ol>
                {!appointments.length && <DashboardEmptyState icon={CalendarDays} title="No upcoming bookings today." description="Your next appointments will appear here when scheduled." />}
                <div className={styles.agendaFooter}><span><Clock3 size={13} aria-hidden="true" /> Today · Philippine time</span><Link href={`${businessPath}/bookings`}>View all bookings</Link></div>
              </section> : <DashboardCardPlaceholder kind="appointments" failed={todayError} onRetry={onRefresh} />}
              {queueData ? <section ref={queueRef} className={`${styles.card} ${styles.queue}`} id="queue" aria-labelledby="queue-heading">
                <div className={styles.cardHead}><div><h2 id="queue-heading">Live queue</h2><p>Pending services and your claimed work.</p></div><Layers3 size={18} /></div>
                <AnimatedFilterGroup className={styles.queueTabs} label="Queue status">
                  {(["Pending", "In progress", "Done"] as const).map(tab => <button type="button" key={tab} aria-pressed={queueTab === tab} onClick={() => { if (tab !== queueTab) { captureQueue(); setQueueTab(tab); } }}>{tab}<span>{queueItems.filter(item => item.status === tab).length}</span></button>)}
                </AnimatedFilterGroup>
                <ul className={styles.queueList} data-queue-area aria-busy={pending}>{queueItems.filter(item => item.status === queueTab).map(item => <li key={item.id} data-queue-row={item.id}>
                  <span className={styles.serviceIcon}><Scissors size={16} aria-hidden="true" /></span><div className={styles.queueService}><strong>{item.service}</strong><p>{item.customer} · {item.time}</p></div><b>{money(item.price)}</b>
                  <div className={styles.queueActions}>
                    {item.status === "Pending" && <button type="button" disabled={pending} onClick={() => void moveQueueItem(item.id, "claim", "In progress")}>Claim</button>}
                    {item.status === "In progress" && <><button type="button" disabled={pending} className={styles.queueSecondary} onClick={() => void moveQueueItem(item.id, "unclaim", "Pending")}>Unclaim</button><button type="button" disabled={pending} onClick={() => void moveQueueItem(item.id, "serve", "Done")}>Done</button></>}
                    {item.status === "Done" && <button type="button" disabled={pending} className={styles.queueSecondary} onClick={() => void moveQueueItem(item.id, "undo", "In progress")}>Undo serve</button>}
                  </div>
                </li>)}</ul>
                {!queueItems.some(item => item.status === queueTab) && <DashboardEmptyState key={queueTab} {...queueEmptyStates[queueTab]} />}
                <p className={styles.readOnly}>Up to 20 services per status. Done shows your work completed today.</p>
                <p role="status">{pending ? "Saving change…" : queueNotice}</p>
              </section> : <DashboardCardPlaceholder kind="queue" failed={queueError} onRetry={onRefresh} />}
              {analytics ? <section className={`${styles.card} ${styles.expenses}`} id="expenses" aria-labelledby="expenses-heading">
                <div className={`${styles.cardHead} ${styles.expenseHead}`}><div><h2 id="expenses-heading">Expense breakdown</h2><p>Where your business budget goes.</p></div>
                  <Sheet open={expenseOpen} onOpenChange={openExpense}>
                    <SheetTrigger asChild><button type="button" className={styles.addExpense}><Plus size={14} aria-hidden="true" /> Add expense</button></SheetTrigger>
                    <SheetContent className={`${styles.expenseSheet} ${fontClassName}`}>
                      <header className={styles.expenseSheetHeader}>
                        <div className={styles.expenseSheetEyebrow}><span><ReceiptText size={19} aria-hidden="true" /></span> BUSINESS EXPENSES</div>
                        <SheetTitle className={styles.expenseSheetTitle}>Add expense</SheetTitle>
                        <SheetDescription className={styles.expenseSheetDescription}>Record an expense for {analytics.business.name}.</SheetDescription>
                      </header>
                      <form className={styles.expenseForm} onSubmit={async event => {
                        event.preventDefault();
                        if (pending) return;
                        const data = new FormData(event.currentTarget);
                        const amount = Number(data.get("amount"));
                        const category = expenseCategories.indexOf(data.get("category") as typeof expenseCategories[number]);
                        if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000 || category < 0 || !expenseDate) return;
                        const date = format(expenseDate, "yyyy-MM-dd");
                        const description = String(data.get("description") ?? "").trim();
                        captureExpenses();
                        setExpenseError("");
                        const result = await onExpense({ amount, category: expenseKeys[category], description, date: new Date(`${date}T12:00:00+08:00`) });
                        if (result.success) { setExpenseNotice(`Saved ${money(amount)} · ${expenseCategories[category]} · ${date}${description ? ` — ${description}` : ""}`); setExpenseOpen(false); }
                        else setExpenseError(result.error ?? "Unable to save expense.");
                      }}>
                        <ScrollArea type="scroll" scrollHideDelay={800} className={styles.expenseSheetScroll}>
                        <div className={styles.expenseSheetBody}>
                        <div className={styles.expenseAmountPanel}>
                          <label htmlFor="sample-expense-amount">Amount (₱)</label>
                          <div><span aria-hidden="true">₱</span><input id="sample-expense-amount" name="amount" type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" placeholder="0.00" required /></div>
                          <p>The cost of keeping things running.</p>
                        </div>
                        <fieldset><legend>Category</legend><p className={styles.expenseFieldHint}>Where does this expense belong?</p><div className={styles.expenseCategories}>{expenseCategories.map((category, index) => { const Icon = expenseIcons[index]; return <label key={category}><input type="radio" name="category" value={category} defaultChecked={index === 0} /><Icon size={19} aria-hidden="true" /><span>{category}</span></label>; })}</div></fieldset>
                        <div className={styles.expenseDetailField}>
                        <label htmlFor="sample-expense-description">Description <span>(optional)</span></label>
                        <input id="sample-expense-description" name="description" type="text" maxLength={500} placeholder="e.g. Monthly water bill" />
                        </div>
                        <div className={styles.expenseDetailField}>
                        <span id="sample-expense-date-label">Date</span>
                        <Popover open={expenseCalendarOpen} onOpenChange={setExpenseCalendarOpen}>
                          <PopoverTrigger asChild><button type="button" className={styles.expenseDate} aria-labelledby="sample-expense-date-label sample-expense-date-value"><span id="sample-expense-date-value">{expenseDate ? format(expenseDate, "MMM d, yyyy") : "Choose date"}</span><CalendarDays size={16} aria-hidden="true" /></button></PopoverTrigger>
                          <PopoverContent align="start" className={`${styles.expenseCalendar} ${fontClassName}`}><Calendar mode="single" selected={expenseDate} defaultMonth={expenseDate} required onSelect={date => { if (date) { setExpenseDate(date); setExpenseCalendarOpen(false); } }} /></PopoverContent>
                        </Popover>
                        </div>
                        </div>
                        </ScrollArea>
                        {expenseError && <p role="alert" className={styles.expenseReceipt}>{expenseError}</p>}
                        <div className={styles.expenseFormActions}><SheetClose asChild><button type="button" disabled={pending}>Cancel</button></SheetClose><button type="submit" disabled={pending} className={styles.addExpense}>{pending ? "Saving…" : "Save expense"} <ArrowRight size={15} aria-hidden="true" /></button></div>
                      </form>
                    </SheetContent>
                  </Sheet>
                </div>
                <div className={styles.expenseTotal}><AnimatedValue value={expenseTotal} count formatNumber={expenseMoney} /><span>logged this month · excludes payroll</span></div>
                <div className={styles.expenseRows} data-expense-area>{expenseCategories.map((label, index) => expenseAmounts[index] > 0 && <div className={styles.expenseRow} key={label} data-expense-row={label}><div><span>{label}</span><strong><AnimatedValue value={expenseAmounts[index]} count formatNumber={expenseMoney} /></strong></div><span className={styles.track}><i style={{ transform: `scaleX(${expenseAmounts[index] / expenseTotal})` }} /></span></div>)}</div>
                {!expenseTotal && <p className={styles.queueEmpty}>No expenses logged this month.</p>}
                <p className={styles.expenseReceipt} role="status">{expenseNotice}</p>
              </section> : <DashboardCardPlaceholder kind="expenses" failed={analyticsError} onRetry={onRefresh} />}
              {growth ? <section className={`${styles.card} ${styles.growth}`} id="growth"><div className={styles.growthIcon}><TrendingUp size={20} /></div><p className={styles.eyebrow}>ROOM TO GROW</p><h2>{growth.opportunity ? "Your next opportunity." : growth.enabled ? "No opportunities right now." : "Explore growth tools."}</h2><p>{growth.opportunity?.reason ?? (growth.enabled ? "New opportunities will appear as your business activity changes." : "Growth insights are not included in your current plan.")}</p><Link href={`${businessPath}/${growth.enabled ? "growth" : "billing"}`} className={styles.growthFoot}><span>{growth.enabled ? "View growth" : "View plan"}</span><ArrowUpRight size={18} /></Link></section> : <DashboardCardPlaceholder kind="growth" failed={growthError} onRetry={onRefresh} />}
              {analytics ? <section className={`${styles.card} ${styles.rankings}`} aria-labelledby="top-services">
                <div className={styles.cardHead}><div><h2 id="top-services">Top services</h2><p>Ranked by service revenue.</p></div><Scissors size={18} aria-hidden="true" /></div>
                <InsightSpanSelect value={serviceSpan} range={analytics.periods[serviceSpan].range} onChange={span => { captureServices(); setServiceSpan(span); }} label="Top services time span" fontClassName={fontClassName} />
                <div data-services-area className={styles.insightRows}><TopServicesMotion>{topServices.map((item, index) => <div className={styles.rankRow} key={item.id} data-services-row={item.id}><span>0{index + 1}</span><div><p>{item.name}<strong><AnimatedValue value={item.revenue} count formatNumber={wholeMoney} /></strong></p><span className={styles.track}><i data-top-service-bar style={{ width: `${item.revenue / Math.max(topServices[0].revenue, 1) * 100}%` }} /></span></div></div>)}</TopServicesMotion></div>
                {!topServices.length && <DashboardEmptyState icon={Scissors} title="No completed services in this period." description="Your leading treatments by revenue will appear here. Try another time span." />}
              </section> : <DashboardCardPlaceholder kind="rankings" failed={analyticsError} onRetry={onRefresh} />}
              {analytics ? <section className={`${styles.card} ${styles.staff}`} id="team" aria-labelledby="staff-heading">
                <div className={styles.cardHead}><div><h2 id="staff-heading">Staff performance</h2><p>The people behind every good visit.</p></div><span className={styles.agendaIcon}><Users size={18} aria-hidden="true" /></span></div>
                <InsightSpanSelect value={staffSpan} range={analytics.periods[staffSpan].range} onChange={span => { captureStaff(); setStaffSpan(span); }} label="Staff performance time span" fontClassName={fontClassName} />
                <div className={styles.staffTable} hidden={!topStaff.length}><table aria-label="Staff performance">
                  <thead><tr><th scope="col">Team member</th><th scope="col">Bookings</th><th scope="col">Revenue</th><th scope="col">Utilization</th></tr></thead>
                  <tbody data-staff-area>{topStaff.map(item => <tr key={item.id} data-staff-row={item.id}>
                    <th scope="row"><span className={styles.staffIdentity}><span className={styles.avatar} aria-hidden="true"><UserRound size={15} /></span>{item.name}</span></th>
                    <td><AnimatedValue value={item.count} count /></td><td className={styles.staffRevenue}><AnimatedValue value={item.revenue} count formatNumber={wholeMoney} /></td>
                    <td><span className={styles.staffUsage}>Not tracked</span></td>
                  </tr>)}</tbody>
                </table></div>
                {!topStaff.length && <DashboardEmptyState icon={Users} title="No completed staff work in this period." description="Completed visits will bring your team's contributions into view." />}
              </section> : <DashboardCardPlaceholder kind="staff" failed={analyticsError} onRetry={onRefresh} />}
              {analytics ? <section className={`${styles.card} ${styles.customers}`} id="customers" aria-labelledby="customers-heading">
                <div className={styles.cardHead}><div><h2 id="customers-heading">Top customers</h2><p>A familiar face, a lasting connection.</p></div><span className={styles.agendaIcon}><MessageCircle size={18} aria-hidden="true" /></span></div>
                <InsightSpanSelect value={customerSpan} range={analytics.periods[customerSpan].range} onChange={span => { captureCustomers(); setCustomerSpan(span); }} label="Top customers time span" fontClassName={fontClassName} />
                <ul className={styles.customerCards} data-customers-area>{topCustomers.map(item => <li className={styles.customerPanel} key={item.id} data-customers-row={item.id}>
                  <div className={styles.customerIdentity}><span className={styles.avatar} aria-hidden="true"><UserRound size={17} /></span><strong>{item.name}</strong><span className={styles.customerVisits}><AnimatedValue value={item.visits} count formatNumber={visitsLabel} /></span></div>
                  <div className={styles.customerSpend}><span>Service spend</span><strong><AnimatedValue value={item.amount} count formatNumber={wholeMoney} /></strong></div>
                </li>)}</ul>
                {!topCustomers.length && <DashboardEmptyState icon={UserRound} title="No customer activity yet." description="Customers with completed visits will appear here. Try another time span." />}
              </section> : <DashboardCardPlaceholder kind="customers" failed={analyticsError} onRetry={onRefresh} />}
            </div>
            <footer className={styles.footer} id="preview-note"><span>Revenue reflects completed services, not collected payments.</span><span>All periods use Philippine time.</span><Link href={businessPath}>Workspace <ArrowUpRight size={12} /></Link></footer>
    </OwnerDashboardShell>
  );
}
