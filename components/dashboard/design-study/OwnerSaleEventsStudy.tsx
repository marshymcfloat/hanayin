"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Megaphone, MoreHorizontal, Percent, Plus, Search, Ticket } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSelectionMotion } from "@/components/bookings/design-study/SelectionMotion";
import { filterOwnerSaleEventPreviewEvents, type OwnerSaleEventPreviewData, type OwnerSaleEventPreviewEvent, type OwnerSaleEventPreviewStatus } from "@/features/catalog/types/owner-sale-event-preview";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import offers from "@/components/dashboard/design-study/owner-sale-events.module.css";

const date = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });

export function OwnerSaleEventsStudy({ data, events, pending, fontClassName = "", onCreate, onEdit, onDetails, onDelete }: {
  data: OwnerSaleEventPreviewData; events: OwnerSaleEventPreviewEvent[]; pending: string | null; fontClassName?: string;
  onCreate: () => void; onEdit: (event: OwnerSaleEventPreviewEvent) => void; onDetails: (event: OwnerSaleEventPreviewEvent) => void; onDelete: (event: OwnerSaleEventPreviewEvent) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OwnerSaleEventPreviewStatus>("all");
  const [sort, setSort] = useState("start");
  const [limit, setLimit] = useState(12);
  const root = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => [...filterOwnerSaleEventPreviewEvents(events, query, status)].sort((a, b) => sort === "name" ? a.title.localeCompare(b.title) : sort === "bookings" ? b.bookings - a.bookings : Date.parse(b.startDate) - Date.parse(a.startDate)), [events, query, status, sort]);
  const shown = visible.slice(0, limit);
  const capture = useSelectionMotion(root, shown.map(event => event.id).join(","), "offer");
  const filtered = Boolean(query.trim() || status !== "all");
  const hasCatalog = data.availableServices.length + data.availablePackages.length > 0;
  const metrics = [
    { label: "Active offers", value: data.metrics.active, detail: "Within their offer dates", icon: Percent },
    { label: "Upcoming offers", value: data.metrics.upcoming, detail: "Scheduled to start later", icon: CalendarDays },
    { label: "Bookings claimed", value: data.metrics.bookings, detail: "Non-cancelled bookings", icon: Ticket },
    { label: "Posts needing attention", value: data.metrics.attention, detail: "Review delivery state", icon: Megaphone },
  ];
  return <div className={`${styles.page} ${fontClassName}`}><div className={styles.content}>
    <Link href="/redesign/owner-dashboard" className={styles.back}><ArrowLeft size={15} aria-hidden="true" />Dashboard</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>{data.business.name} · Offers & promotion</p><h1>Sale events<span className={styles.titleDetail}>, worth sharing.</span></h1><p className={styles.description}>Your offers, dates, and booking limits. Ready when you are.</p></div><button type="button" className={styles.primary} data-sale-event-focus="create" disabled={Boolean(pending) || !hasCatalog} onClick={onCreate}><Plus size={17} aria-hidden="true" />Create sale event</button></header>
    <section className={styles.summary} aria-label="Sale event overview">{metrics.map(({ label, value, detail, icon: Icon }) => <article className={styles.metric} key={label}><div className={styles.metricLabel}><Icon size={15} aria-hidden="true" />{label}</div><strong>{value}</strong><small>{detail}</small></article>)}</section>
    <aside className={offers.socialBridge}><div><h2>An offer worth talking about.</h2><p>Create your offer here. Review linked drafts and follow their delivery in Social Posts.</p></div><Link className={styles.secondary} href="/redesign/owner-dashboard/business/social-posts"><Megaphone size={15} aria-hidden="true"/>Open social posts</Link></aside>
    <div ref={root}><section className={styles.catalog} aria-labelledby="offer-library-heading">
      <div className={styles.toolbar}><div><h2 id="offer-library-heading">Your offer library</h2><span className={styles.count} role="status">{visible.length} of {events.length} offers</span></div><div className={styles.filters}>
        <label className={styles.search}><span className="sr-only">Search sale events</span><Search size={16} aria-hidden="true" /><input placeholder="Find an offer…" value={query} onChange={event => { capture(); setLimit(12); setQuery(event.target.value); }} /></label>
        <Select value={status} onValueChange={value => { capture(); setLimit(12); setStatus(value as typeof status); }}><SelectTrigger className={styles.select} aria-label="Filter sale events by status"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="upcoming">Upcoming</SelectItem><SelectItem value="ended">Ended</SelectItem></SelectContent></Select>
        <Select value={sort} onValueChange={value => { capture(); setLimit(12); setSort(value); }}><SelectTrigger className={styles.select} aria-label="Sort sale events"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="start">Latest start</SelectItem><SelectItem value="name">Name A–Z</SelectItem><SelectItem value="bookings">Most booked</SelectItem></SelectContent></Select>
      </div></div>
      <ul className={styles.list} data-offer-area>{shown.map(event => {
        const saving = event.id < 0 || pending === `update:${event.id}`;
        return <li className={styles.row} data-offer-row={event.id} aria-busy={saving || undefined} key={event.id}><div className={offers.row}>
          <div className={styles.serviceIdentity}><span className={styles.serviceIcon} aria-hidden="true"><Percent size={20} /></span><div className={styles.serviceCopy}><h3>{event.title}</h3><div className={styles.metadata}><span className={`${styles.category} ${offers.status}`}>{event.status}</span><span>{event.services.length} services · {event.packages.length} packages</span></div>{event.description && <p className={styles.serviceDescription}>{event.description}</p>}{saving && <div className={styles.saving}>Saving…</div>}</div></div>
          <div className={offers.schedule}><span>Offer dates · Manila</span><strong>{date.format(new Date(event.startDate))}<br />– {date.format(new Date(event.endDate))}</strong></div>
          <div className={offers.discount}><strong>{event.discountType === "PERCENTAGE" ? `${event.discountValue}%` : money.format(event.discountValue)} off</strong><small>{event.bookings}{event.slotLimit === null ? " bookings · No limit" : ` / ${event.slotLimit} bookings`}</small>{event.slotLimit !== null && <small>{Math.max(0, event.slotLimit - event.bookings)} bookings remaining</small>}</div>
          <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={`${styles.rowActions} ${offers.actions}`} aria-label={`Actions for ${event.title}`} data-sale-event-focus={`event-${event.id}`} disabled={Boolean(pending) || event.id < 0}><MoreHorizontal size={20} aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className={`${styles.menu} ${fontClassName}`}><DropdownMenuItem onSelect={() => onDetails(event)}>Details</DropdownMenuItem><DropdownMenuItem onSelect={() => onEdit(event)}>Edit</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onDelete(event)}>Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div></li>;
      })}</ul>
      {!visible.length && <div className={styles.empty}><div><span className={styles.emptyIcon} aria-hidden="true"><Percent size={29} /></span><h3>{filtered ? "No matching sale events" : hasCatalog ? "Your first offer starts here." : "Catalog items are needed first."}</h3><p>{filtered ? "Try another search or status filter." : hasCatalog ? "Create an offer from services or packages in your catalog." : "Add a service or package before creating a sale event."}</p>{filtered ? <button className={styles.secondary} onClick={() => { capture(); setQuery(""); setStatus("all"); setLimit(12); }}>Clear filters</button> : hasCatalog ? <button className={styles.secondary} disabled={Boolean(pending)} onClick={onCreate}>Create sale event</button> : <Link className={styles.secondary} href="/redesign/owner-dashboard/business/services">Manage services</Link>}</div></div>}
      {shown.length < visible.length && <div className={styles.loadMore}><span>Showing {shown.length} of {visible.length} offers</span><button className={styles.secondary} onClick={() => { capture(); setLimit(value => value + 12); }}>Show more offers<Plus size={14} aria-hidden="true" /></button></div>}
      <div className={styles.footer}><span>{data.socialPublishingEnabled ? data.connectedPlatforms.length ? `${data.connectedPlatforms.length} connected social channels` : "Connect a social channel to prepare linked drafts." : "Linked social drafts require an enabled social plan."}</span><span>Counts reflect the last confirmed refresh.</span></div>
    </section></div>
  </div></div>;
}
