"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, CheckCircle2, Search, Users, Wallet } from "lucide-react";
import type { OwnerPayrollPreviewData } from "@/features/payroll/types/owner-payroll-preview";
import { useCatalogListState, useCatalogScroll } from "@/components/dashboard/owner-preview/useCatalogListState";
import { useOwnerPreviewContext } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import team from "@/components/dashboard/design-study/owner-employees.module.css";
import payroll from "@/components/dashboard/design-study/owner-payroll.module.css";
import { EmployeePaySettingsButton } from "@/components/payroll/EmployeePaySettings";

type Data = Extract<OwnerPayrollPreviewData, { access: "granted" }>;
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }).format(new Date(value)) : "Date unavailable";

export function OwnerPayrollStudy({ data, refreshControl, setupControl, onChanged, fontClassName = "" }: { data: Data; refreshControl: ReactNode; setupControl?: ReactNode; onChanged: () => void; fontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const scope = `${identity.userId}:${identity.businessId}:Payroll`;
  const [search, setSearch] = useCatalogListState(scope, "search", "");
  const [limit, setLimit] = useCatalogListState(scope, "limit", 12);
  const list = useRef<HTMLDivElement>(null);
  useCatalogScroll(scope, list);
  const employees = data.employees.filter(item => `${item.name} ${item.profile}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className={`${styles.page} ${fontClassName}`}><div className={styles.content} ref={list}>
    <Link className={styles.back} href="/redesign/owner-dashboard"><ArrowLeft size={15} />Dashboard</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>{data.businessName} · Your team</p><h1>Payroll<span className={styles.titleDetail}>, clearly accounted for.</span></h1><p className={styles.description}>Review earnings and confirmed payouts. Every amount stays traceable.</p></div><div className={styles.refresh}>{refreshControl}</div></header>
    <section className={styles.summary} aria-label="Payroll overview">{[{ label: "Net paid this month", value: money(data.paidThisMonth), detail: data.month, icon: Banknote }, { label: "Paid payslips", value: data.paidPayslipsThisMonth, detail: "Confirmed this month", icon: CheckCircle2 }, { label: "Team members", value: data.employees.length, detail: "Configured pay profiles", icon: Users }, { label: "Recent payouts", value: data.recentPayslips.length, detail: "Latest 20 recorded payments", icon: Wallet }].map(({ label, value, detail, icon: Icon }) => <div key={label} className={styles.metric}><span className={styles.metricLabel}><Icon size={16} aria-hidden="true" />{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</section>
    {setupControl && <div className={payroll.setupControl}>{setupControl}</div>}
    <section className={styles.catalog} aria-labelledby="payroll-team"><div className={styles.toolbar}><div><h2 id="payroll-team">Team pay settings</h2><span className={styles.count}>{employees.length} of {data.employees.length} employees</span></div><label className={styles.search}><Search size={16} aria-hidden="true" /><input aria-label="Search payroll employees" placeholder="Search your team…" value={search} onChange={event => { setSearch(event.target.value); setLimit(12); }} /></label></div>
      <p className={styles.count}>Previous rates are read-only. People → Pay settings manages dated rates; enable period-based payroll before using them for new payslips. <Link href={`/app/${encodeURIComponent(identity.businessSlug)}/payroll`} prefetch={false}>Open existing payroll</Link> to keep using the unchanged legacy payout flow.</p>
      <ul className={styles.list}>{employees.slice(0, limit).map(item => <li key={item.id} className={styles.row}><div className={payroll.row}><div className={styles.serviceIdentity}><span className={styles.serviceIcon}><Users size={18} aria-hidden="true" /></span><div className={styles.serviceCopy}><h3>{item.name}</h3><span className={styles.metadata}>{item.profile.toLowerCase()}</span></div></div><div className={team.detail}><small>Legacy daily rate · Commission</small><p>{money(item.dailyRate)} · {item.commissionPercentage}%</p></div><div className={team.detail}><small>Last paid</small><p>{item.lastPaidAmount === null ? "No paid payslip" : `${money(item.lastPaidAmount)} · ${date(item.lastPaidAt)}`}</p></div><EmployeePaySettingsButton employeeId={item.id} employeeName={item.name} businessSlug={identity.businessSlug} userId={identity.userId} onSaved={onChanged} fontClassName={fontClassName} /></div></li>)}</ul>
      {!employees.length && <div className={styles.empty}><div><h3>{data.employees.length ? "No matching employees" : "No pay profiles yet"}</h3><p>{data.employees.length ? "Try another name or role." : "Employee pay settings will appear here when configured."}</p>{data.employees.length > 0 && <button className={styles.secondary} onClick={() => setSearch("")}>Clear search</button>}</div></div>}
      {employees.length > limit && <div className={styles.loadMore}><button className={styles.secondary} onClick={() => setLimit(value => value + 12)}>Show more employees</button></div>}
    </section>
    <section className={styles.catalog} aria-labelledby="payroll-history"><div className={styles.toolbar}><div><h2 id="payroll-history">Recent paid payslips</h2><p className={styles.count}>Confirmed records only · Philippine time</p></div></div><ul className={styles.list}>{data.recentPayslips.map(item => <li key={item.id} className={styles.row}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3>{item.employeeName}</h3><p className={styles.metadata}>{date(item.periodStart)} – {date(item.periodEnd)}</p><small className={styles.count}>Paid · {date(item.paidAt)}</small></div><strong>{money(item.amount)}</strong></div></li>)}</ul>{!data.recentPayslips.length && <div className={styles.empty}><div><Wallet className="mx-auto" aria-hidden="true" /><h3>No paid payslips yet</h3><p>Confirmed payouts will appear here.</p></div></div>}</section>
  </div></div>;
}
