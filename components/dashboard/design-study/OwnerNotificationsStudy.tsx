"use client";

import { useCatalogListState } from "@/components/dashboard/owner-preview/useCatalogListState";
import { useState, type ReactNode } from "react";
import { OwnerNotificationsFrame } from "@/components/dashboard/design-study/OwnerNotificationsFrame";
import { Bell, CheckCircle2, CircleAlert, Mail, MessageSquare, Search, Send } from "lucide-react";
import { Root, Viewport } from "@radix-ui/react-scroll-area";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";
import { ScrollBar } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CatalogEditorFooter, CatalogEditorOverlay } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import type { NotificationHistoryResponse } from "@/features/notifications/types";
import { dateFormatter, deliveryOutcome, eventFilters, eventGroups, eventLabels, outcomeFilters, recipient, type EventFilter, type Notification, type OutcomeFilter } from "@/features/notifications/presentation";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import notices from "@/components/dashboard/design-study/owner-notifications.module.css";

export function OwnerNotificationsStudy({ data, refreshControl, onPageChange, fontClassName = "" }: { data: NotificationHistoryResponse; refreshControl: ReactNode; onPageChange: (page: number) => void; fontClassName?: string }) {
  const [search, setSearch] = useCatalogListState("customer-notifications", "search", "");
  const [event, setEvent] = useCatalogListState<EventFilter>("customer-notifications", "event", "All events");
  const [outcome, setOutcome] = useCatalogListState<OutcomeFilter>("customer-notifications", "outcome", "All outcomes");
  const [selected, setSelected] = useState<Notification | null>(null);
  const [open, setOpen] = useState(false);
  const notifications = data.notifications;
  const visible = notifications.filter(item => (event === "All events" || eventGroups[item.eventType] === event) && (outcome === "All outcomes" || deliveryOutcome(item) === outcome) && `${recipient(item)} ${item.subject} ${eventLabels[item.eventType]}`.toLowerCase().includes(search.trim().toLowerCase()));
  const filtered = search.trim() !== "" || event !== "All events" || outcome !== "All outcomes";
  const metrics = [
    { label: "Events on page", value: notifications.length, detail: `${data.totalCount} in history`, icon: Bell },
    { label: "Delivered", value: notifications.filter(item => deliveryOutcome(item) === "Delivered").length, detail: "Recorded channels sent", icon: CheckCircle2 },
    { label: "Partial delivery", value: notifications.filter(item => deliveryOutcome(item) === "Partial delivery").length, detail: "At least one channel sent", icon: Send },
    { label: "Failed delivery", value: notifications.filter(item => deliveryOutcome(item) === "Failed").length, detail: "Known delivery failure", icon: CircleAlert },
  ];
  return <OwnerNotificationsFrame refreshControl={refreshControl}>
    <section className={styles.summary} aria-label="Notification overview for current page">{metrics.map(({ label, value, detail, icon: Icon }) => <div className={styles.metric} key={label}><span className={styles.metricLabel}><Icon size={14} aria-hidden="true" />{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</section>
    <div className={notices.columns}><section className={styles.catalog} aria-labelledby="notification-history-heading">
      <div className={styles.toolbar}><div><h2 id="notification-history-heading">Delivery history</h2><span className={styles.count} role="status">{visible.length} of {notifications.length} on this page · {data.totalCount} total events</span></div><label className={styles.search}><Search size={15} aria-hidden="true" /><span className="sr-only">Search this page by recipient or message</span><input type="search" placeholder="Search this page" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      <AnimatedFilterGroup className={notices.segments} label="Notification event on this page">{eventFilters.map(value => <button type="button" key={value} aria-pressed={event === value} onClick={() => setEvent(value)}>{value}</button>)}</AnimatedFilterGroup>
      <div className={notices.outcomeFilter}><Select value={outcome} onValueChange={value => setOutcome(value as OutcomeFilter)}><SelectTrigger aria-label="Delivery outcome on this page" className={styles.select}><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}>{outcomeFilters.map(value => <SelectItem value={value} key={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <ul className={styles.list}>{visible.map(item => <li key={item.id} className={`${styles.row} ${notices.row}`}>
        <div className={styles.serviceIdentity}><span className={styles.serviceIcon}><Bell size={18} aria-hidden="true" /></span><div className={styles.serviceCopy}><p className={notices.event}>{eventLabels[item.eventType]}</p><h3>{item.subject}</h3><p className={notices.recipient}>{recipient(item)}</p><time className={notices.time} dateTime={item.sentAt}>{dateFormatter.format(new Date(item.sentAt))}</time></div></div>
        <div className={notices.delivery}><span className={notices.badge} data-outcome={deliveryOutcome(item)}>{deliveryOutcome(item)}</span><div className={notices.channels}><Channel result={item.smsSent} label="SMS" /><Channel result={item.emailSent} label="Email" /></div>{item.smsSent === null && item.emailSent === null && <p className={notices.muted}>Channel outcome not recorded</p>}{item.failureReason && <p className={notices.failure}>{item.failureReason}</p>}</div>
        <button type="button" className={styles.secondary} data-catalog-focus={`notification-${item.id}`} aria-label={`View notification for ${recipient(item)}: ${eventLabels[item.eventType]}`} onClick={() => { setSelected(item); setOpen(true); }}>View details</button>
      </li>)}</ul>
      {visible.length === 0 && <div className={styles.empty}><div><span className={styles.emptyIcon}><Bell size={25} aria-hidden="true" /></span><h3>{filtered ? "No matching notifications on this page" : "No notifications on this page"}</h3><p>{filtered ? "Try another event, outcome, or recipient." : "Processed notification events will appear here when available."}</p>{filtered && <button type="button" className={styles.secondary} onClick={() => { setSearch(""); setEvent("All events"); setOutcome("All outcomes"); }}>Clear filters</button>}</div></div>}
      {data.totalPages > 1 && <div className={notices.pagination}><span>Page {data.page} of {data.totalPages}</span><div><button type="button" className={styles.secondary} disabled={data.page <= 1} onClick={() => onPageChange(data.page - 1)}>Previous</button><button type="button" className={styles.secondary} disabled={data.page >= data.totalPages} onClick={() => onPageChange(data.page + 1)}>Next</button></div></div>}
    </section><aside className={notices.performance} aria-labelledby="notification-channels"><h2 id="notification-channels">Channel performance</h2><p className={notices.muted}>Recorded outcomes on this page only.</p>{(["smsSent", "emailSent"] as const).map(channel => {
      const recorded = notifications.filter(item => item[channel] !== null);
      const sent = recorded.filter(item => item[channel]).length;
      const rate = recorded.length ? Math.round(sent / recorded.length * 100) : null;
      const label = channel === "smsSent" ? "SMS" : "Email";
      return <div className={notices.channelMetric} key={channel}><h3>{channel === "smsSent" ? <MessageSquare size={15} aria-hidden="true" /> : <Mail size={15} aria-hidden="true" />}{label}<strong>{rate === null ? "—" : `${rate}%`}</strong></h3>{rate !== null && <div className={styles.track} role="progressbar" aria-label={`${label} delivery success`} aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}><span style={{ transform: `scaleX(${rate / 100})` }} /></div>}<p className={notices.muted}>{sent} delivered of {recorded.length} recorded attempts</p></div>;
    })}<p className={notices.note}>Delivery records do not indicate whether a recipient read a message.</p></aside></div>
    {selected && <CatalogEditorOverlay open={open} onOpenChange={setOpen} onExited={() => setSelected(null)} title="Notification details" description={eventLabels[selected.eventType]} restoreFocusKey={`notification-${selected.id}`} initialFocus="panel" className={`${styles.editor} ${fontClassName}`}>
      <Root type="scroll" scrollHideDelay={800} className={styles.editorScroll}><Viewport data-slot="scroll-area-viewport" tabIndex={0} aria-label="Notification details" className="size-full"><div className={styles.editorFields}><h3 className={notices.subject}>{selected.subject}</h3><dl className={notices.details}>{[["Recipient", recipient(selected)], ["Sent at", dateFormatter.format(new Date(selected.sentAt))], ["Event", eventLabels[selected.eventType]], ["Outcome", deliveryOutcome(selected)], ["SMS", channelLabel(selected.smsSent)], ["Email", channelLabel(selected.emailSent)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{selected.failureReason && <p className={notices.failure}>{selected.failureReason}</p>}<p className={notices.note}>This record is read-only. Opening it does not send a message or change its delivery status.</p></div></Viewport><ScrollBar /></Root>
      <CatalogEditorFooter className={styles.editorFooter}><button type="button" className={styles.secondary} onClick={() => setOpen(false)}>Close</button></CatalogEditorFooter>
    </CatalogEditorOverlay>}
  </OwnerNotificationsFrame>;
}

function channelLabel(result: boolean | null) { return result === null ? "Not recorded" : result ? "Delivered" : "Failed"; }
function Channel({ result, label }: { result: boolean | null; label: string }) {
  return result === null ? null : <span data-failed={!result}>{label} {result ? "delivered" : "failed"}</span>;
}
