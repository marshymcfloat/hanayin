"use client";

import { useCatalogEditorSessions } from "@/components/dashboard/owner-preview/useCatalogEditorSessions";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck2, ContactRound, Plus, Search, UserRoundPlus, Users } from "lucide-react";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";
import { OwnerCustomerEditor, OwnerCustomerHistory, customerDate, type CustomerContactDraft } from "@/components/dashboard/design-study/OwnerCustomerSheet";
import type { OwnerPreviewCustomer, OwnerPreviewCustomerDirectory } from "@/features/customers/types/owner-preview";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import customerStyles from "@/components/dashboard/design-study/owner-customers.module.css";

const segments = ["All customers", "New", "Returning"] as const;
export function OwnerCustomersStudy({ data, customers, query, segment, isFetching, staleSelection, refreshControl, onQueryChange, onSegmentChange, onPageChange, onCreate, onUpdate, editingIds = [], fontClassName = "" }: {
  data: OwnerPreviewCustomerDirectory; customers: OwnerPreviewCustomer[]; query: string; segment: typeof segments[number]; isFetching: boolean; staleSelection: boolean; refreshControl: ReactNode;
  onQueryChange: (value: string) => void; onSegmentChange: (value: typeof segments[number]) => void; onPageChange: (page: number) => void;
  onCreate: (draft: CustomerContactDraft) => Promise<boolean>; onUpdate: (customer: OwnerPreviewCustomer, draft: CustomerContactDraft) => Promise<boolean>; editingIds?: string[]; fontClassName?: string;
}) {
  const editors = useCatalogEditorSessions<OwnerPreviewCustomer>();
  const [profile, setProfile] = useState<OwnerPreviewCustomer | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  function edit(customer?: OwnerPreviewCustomer) { editors.open(customer ?? null); }
  const metrics = [
    { label: "Customers", value: data.totals.customers, detail: "Contact profiles on file", icon: Users },
    { label: "New customers", value: data.totals.newCustomers, detail: "No completed visits yet", icon: UserRoundPlus },
    { label: "Returning", value: data.totals.returningCustomers, detail: "At least one completed visit", icon: ContactRound },
    { label: "Completed visits", value: data.totals.completedVisits, detail: "Across customer profiles", icon: CalendarCheck2 },
  ];
  return <div className={`${styles.page} ${fontClassName}`}><div className={styles.content}>
    <Link className={styles.back} href="/redesign/owner-dashboard"><ArrowLeft size={14} aria-hidden="true" />Dashboard</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>Customer relationships</p><h1>Customers</h1><p className={styles.description}>Your customer contacts and completed visits, in one place.</p></div><div className={styles.actions}><div className={styles.refresh}>{refreshControl}</div><button type="button" className={styles.primary} data-catalog-focus="add-customer" onClick={() => edit()}><Plus size={16} aria-hidden="true" />Add customer</button></div></header>
    <section className={styles.summary} aria-label="Customer overview">{metrics.map(({ label, value, detail, icon: Icon }) => <div className={styles.metric} key={label}><span className={styles.metricLabel}><Icon size={14} aria-hidden="true" />{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</section>
    <section className={styles.catalog} aria-labelledby="customer-directory-heading"><div className={styles.toolbar}><div><h2 id="customer-directory-heading">Customer directory</h2><p className={styles.count} role="status">{data.filteredCount} matching customers{isFetching ? " · Updating…" : ""}</p></div><label className={styles.search}><Search size={16} aria-hidden="true" /><input type="search" maxLength={200} aria-label="Search name, email or phone" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Search name, email or phone" /></label></div>
      <AnimatedFilterGroup className={customerStyles.segments} label="Customer segment">{segments.map(value => <button type="button" key={value} aria-pressed={value === segment} onClick={() => onSegmentChange(value)}>{value}</button>)}</AnimatedFilterGroup>
      {staleSelection && <p className={styles.notice}>Showing the previous selection while the requested customers load.</p>}
      <ul className={styles.list}>{customers.map(customer => {
        const pending = customer.id.startsWith("pending-") || editingIds.includes(customer.id);
        return <li className={styles.row} key={customer.id} aria-busy={pending}><div className={customerStyles.row}>
          <div className={styles.serviceIdentity}><span className={styles.serviceIcon}><ContactRound size={19} aria-hidden="true" /></span><div className={styles.serviceCopy}><h3>{customer.name}</h3><div className={styles.metadata}><span className={styles.category}>{customer.completedVisits ? "Returning" : "New"}</span><span>{customer.completedVisits} completed visits</span></div>{pending && <p role="status" className={styles.saving}>Saving customer…</p>}</div></div>
          <div className={customerStyles.contact}><p>{customer.phone || "No phone on file"}</p><p>{customer.email || "No email on file"}</p><small>Last visit: {customer.lastVisitAt ? customerDate(customer.lastVisitAt) : "No visits yet"}</small></div>
          <div className={customerStyles.buttons}><button type="button" className={styles.secondary} disabled={pending || staleSelection} data-catalog-focus={`history-${customer.id}`} aria-label={`View profile for ${customer.name}`} onClick={() => { setProfile(customer); setProfileOpen(true); }}>View profile</button><button type="button" className={styles.secondary} disabled={pending || staleSelection} data-catalog-focus={`customer-${customer.id}`} aria-label={`Edit ${customer.name}`} onClick={() => edit(customer)}>Edit</button></div>
        </div></li>;
      })}</ul>
      {!customers.length && <div className={styles.empty}><div><span className={styles.emptyIcon}><ContactRound aria-hidden="true" /></span><h3>{data.totals.customers ? "No matching customers" : "No customers yet"}</h3><p>{data.totals.customers ? "Try a different name, contact, or customer segment." : "Add a contact profile to start your customer directory."}</p>{data.totals.customers ? <button type="button" className={styles.secondary} onClick={() => { onQueryChange(""); onSegmentChange("All customers"); }}>Clear filters</button> : <button type="button" className={styles.primary} onClick={() => edit()}>Add your first customer</button>}</div></div>}
      {(data.filteredCount > data.pageSize || data.page > 1) && <div className={customerStyles.pagination}><button type="button" className={styles.secondary} disabled={data.page <= 1 || staleSelection} onClick={() => onPageChange(data.page - 1)}>Previous</button><span>Page {data.page} of {Math.max(data.page, Math.ceil(data.filteredCount / data.pageSize))}</span><button type="button" className={styles.secondary} disabled={data.page * data.pageSize >= data.filteredCount || staleSelection} onClick={() => onPageChange(data.page + 1)}>Next</button></div>}
    </section>
    {editors.sessions.filter(entry => (entry.state === "draft" || entry.state === "failed") && entry.id !== editors.activeId).map(entry => <button key={entry.id} type="button" className={styles.secondary} onClick={() => editors.resume(entry.id)}>Resume customer draft {entry.id}</button>)}
    {editors.sessions.map(({ id, item }) => <OwnerCustomerEditor key={id} customer={item ?? undefined} open={editors.activeId === id} onOpenChange={open => open ? editors.resume(id) : editors.dismiss(id)} onDiscard={() => editors.status(id, "saved")} onSave={async draft => {
      editors.status(id, "pending");
      let success = false;
      try { success = await (item ? onUpdate(item, draft) : onCreate(draft)); } catch { /* Controller rolls back rejected writes. */ }
      if (success) editors.status(id, "saved");
      else editors.failed(id, "The customer could not be saved. Review your draft and try again.");
      return success;
    }} fontClassName={fontClassName} />)}
    {profile && <OwnerCustomerHistory customer={profile} open={profileOpen} onOpenChange={setProfileOpen} onExited={() => setProfile(null)} fontClassName={fontClassName} />}
  </div></div>;
}
