"use client";

import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarDays, Clock3, CreditCard, Plus, Search, Wallet } from "lucide-react";
import type { OwnerBookingList, OwnerBookingSummary } from "@/features/bookings/types/owner-bookings-preview";
import type { OwnerGcashReviewQueue } from "@/features/payments/types/owner-gcash-review";
import { useOwnerBookingController } from "@/components/dashboard/owner-preview/OwnerBookingController";
import { GcashFollowUpQueue, GcashVerificationQueue } from "@/components/dashboard/shared/GcashVerificationQueue";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";
import { BOOKING_PAYMENT_STAGE_LABELS } from "@/lib/utils/booking-payment-stage";
import { BookingOverviewLoading, BookingRegisterLoading } from "@/components/dashboard/design-study/OwnerBookingsLoading";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import bookings from "@/components/dashboard/design-study/owner-bookings.module.css";

const statuses = ["All bookings", "Accepted", "On hold", "Completed", "Cancelled"] as const;
type Status = typeof statuses[number];
const day = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
const time = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const money = (amount: number) => `₱${amount.toLocaleString("en-PH")}`;
const formatDay = (value: string | null) => value ? day.format(new Date(value)) : "Unscheduled";
const formatTime = (value: string | null) => value ? time.format(new Date(value)) : "Unscheduled";

export function OwnerBookingsStudy({ businessSlug, businessName, fontClassName, summary, list, gcash, date, allDates, status, search, page, onDate, onAllDates, onStatus, onSearch, onPage, onOpen, onChanged, refreshControl, detailPanel }: {
  businessSlug: string; businessName: string; fontClassName: string;
  summary: UseQueryResult<OwnerBookingSummary, Error>; list: UseQueryResult<OwnerBookingList, Error>; gcash: UseQueryResult<OwnerGcashReviewQueue, Error>;
  date: string; allDates: boolean; status: Status; search: string; page: number;
  onDate: (date: string) => void; onAllDates: (all: boolean) => void; onStatus: (status: Status) => void; onSearch: (value: string) => void; onPage: (page: number) => void; onOpen: (id: number) => void; onChanged: () => void;
  refreshControl: ReactNode; detailPanel: ReactNode;
}) {
  const { openBooking, pending, recoveryAvailable } = useOwnerBookingController();
  const theme = `${bookings.theme} ${fontClassName}`;
  return <div className={`${styles.page} ${bookings.page} ${fontClassName}`}><div className={styles.content}>
    <Link href="/redesign/owner-dashboard" className={styles.back}><ArrowLeft size={15} aria-hidden="true" />Dashboard</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>{businessName} · Your customers</p><h1>Bookings<span className={styles.titleDetail}>, a day in view.</span></h1><p className={styles.description}>Follow appointments, review payments, and manage each visit.</p></div><div className={styles.actions}><div className={styles.refresh}>{refreshControl}</div><button type="button" className={styles.primary} data-catalog-focus="redesign-bookings-new-booking" disabled={pending} onClick={() => openBooking("redesign-bookings-new-booking")}><Plus size={17} aria-hidden="true" />{pending ? "Creating booking…" : recoveryAvailable ? "Resume booking" : "New booking"}</button></div></header>
    <div className={bookings.dateBar}><label><CalendarDays size={17} aria-hidden="true" /><span className="sr-only">Booking date</span><input aria-label="Booking date" type="date" value={date} onChange={event => { if (event.target.value) onDate(event.target.value); }} /></label><span>Times shown in Philippine time</span></div>
    {summary.data ? <section className={styles.summary} aria-label="Booking overview">{[
      { label: "Selected-day bookings", value: String(summary.data.totalBookings), detail: formatDay(`${date}T12:00:00+08:00`), icon: CalendarDays },
      { label: "Open appointments", value: String(summary.data.acceptedCount + summary.data.holdCount), detail: `${summary.data.acceptedCount} accepted · ${summary.data.holdCount} on hold`, icon: Clock3 },
      { label: "Amount received", value: money(summary.data.amountReceived), detail: "Selected-day non-cancelled bookings", icon: CreditCard },
      { label: "Open balance", value: money(summary.data.openBalance), detail: "Accepted and held bookings", icon: Wallet },
    ].map(({ label, value, detail, icon: Icon }) => <div className={styles.metric} key={label}><span className={styles.metricLabel}><Icon size={16} aria-hidden="true" />{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</section> : summary.isPending ? <BookingOverviewLoading /> : <div className={styles.notice} role="alert">Booking overview unavailable. <button className={styles.secondary} onClick={() => void summary.refetch()}>Retry overview</button></div>}
    {summary.isError && summary.data && <p className={styles.notice} role="alert">Overview refresh failed. Showing saved totals.</p>}
    <div className={bookings.payments}>
      {gcash.isPending && <div className={styles.notice} role="status" aria-busy="true">Loading payment review…</div>}
      {gcash.isError && <div className={styles.notice} role="alert">Payment review could not refresh. <button className={styles.secondary} disabled={gcash.isFetching} onClick={() => void gcash.refetch()}>Retry payment review</button></div>}
      {gcash.data && <><GcashVerificationQueue businessSlug={businessSlug} items={gcash.data.verificationItems} onSuccess={onChanged} themeClassName={theme} /><GcashFollowUpQueue businessSlug={businessSlug} items={gcash.data.followUpItems} onSuccess={onChanged} themeClassName={theme} /></>}
    </div>
    <div className={bookings.columns}><section className={bookings.register} aria-labelledby="booking-register-heading">
      <div className={styles.toolbar}><div><h2 id="booking-register-heading">Booking register</h2><span className={styles.count} role="status">{list.data ? `${list.data.bookings.length} of ${list.data.totalCount} matching bookings` : list.isError ? "Bookings unavailable" : "Loading bookings"}</span></div><label className={styles.search}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search customer, service or ID" placeholder="Search bookings…" value={search} onChange={event => onSearch(event.target.value)} /></label></div>
      <div className={bookings.statusBar}><AnimatedFilterGroup className={bookings.segments} label="Booking status">{statuses.map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => onStatus(value)}>{value}</button>)}</AnimatedFilterGroup><label className={bookings.allDates}><input type="checkbox" checked={allDates} onChange={event => onAllDates(event.target.checked)} />All dates</label></div>
      {list.isError && <div className={styles.notice} role="alert">{list.data ? "Booking refresh failed. Showing saved bookings." : "Bookings unavailable. Try again."} <button className={styles.secondary} disabled={list.isFetching} onClick={() => void list.refetch()}>Retry bookings</button></div>}
      {list.data ? <><ul className={styles.list}>{list.data.bookings.map(booking => <li className={`${styles.row} ${bookings.row}`} key={booking.id}><div className={bookings.identity}><span className={styles.serviceIcon} aria-hidden="true"><CalendarDays size={18} /></span><div><h3>{booking.customerName}<span className={bookings.id}>#{booking.id}</span></h3><p>{booking.services.join(", ") || "No service recorded"}</p></div><span className={bookings.badge} data-status={booking.status}>{booking.status === "HOLD" ? "On hold" : booking.status[0] + booking.status.slice(1).toLowerCase()}</span></div>
        <dl className={bookings.details}><div><dt>Appointment</dt><dd>{formatTime(booking.scheduledAt)}<small>{formatDay(booking.scheduledAt)}</small></dd></div><div><dt>Service provider</dt><dd>{booking.providers.join(", ") || "Unassigned"}</dd></div><div><dt>Booking total</dt><dd>{money(booking.total)}</dd></div><div><dt>Payment</dt><dd>{booking.status === "CANCELLED" ? "Not due" : booking.paymentStatus === "PAID" ? "Paid" : booking.paymentStatus === "PARTIALLY_PAID" ? "Partially paid" : "Unpaid"}<small>{BOOKING_PAYMENT_STAGE_LABELS[booking.paymentStage]} · {money(booking.status === "CANCELLED" ? 0 : Math.max(0, booking.total - booking.paid))} remaining</small></dd></div></dl>
        <div className={bookings.rowFooter}><button type="button" className={styles.secondary} aria-label={`View booking ${booking.id}`} onClick={() => onOpen(booking.id)}>View details<ArrowUpRight size={15} aria-hidden="true" /></button></div></li>)}</ul>
        {!list.data.bookings.length && <div className={styles.empty}><div><span className={styles.emptyIcon}><CalendarDays size={25} aria-hidden="true" /></span><h3>No bookings match this {allDates ? "filter" : "date and filter"}.</h3><p>Try another date, search, or booking status.</p><button type="button" className={styles.secondary} onClick={() => { onSearch(""); onStatus("All bookings"); onAllDates(true); }}>Show all bookings</button></div></div>}
        {list.data.totalPages > 1 && <div className={bookings.pagination}><button className={styles.secondary} disabled={page <= 1 || list.isFetching} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page} of {list.data.totalPages}</span><button className={styles.secondary} disabled={page >= list.data.totalPages || list.isFetching} onClick={() => onPage(page + 1)}>Next</button></div>}</> : list.isPending ? <BookingRegisterLoading /> : null}
    </section><aside className={bookings.review} aria-labelledby="payment-review-heading"><h2 id="payment-review-heading">Payment review</h2>{summary.isPending ? <div className={bookings.loadingReview} aria-label="Loading payment summary" aria-busy="true"><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div> : summary.data ? <><p>{summary.data.pendingGcashCount} submitted GCash payments awaiting review</p>{summary.data.pendingGcash ? <><span className={bookings.badge}>{summary.data.pendingGcash.escalated ? "Needs resolution" : "Awaiting verification"}</span><h3>{summary.data.pendingGcash.customerName}</h3><p>{summary.data.pendingGcash.services.join(", ") || "No service recorded"}</p><strong>{money(summary.data.pendingGcash.amount)}</strong><p>Submitted payment, not yet verified.</p><button type="button" className={styles.secondary} onClick={() => onOpen(summary.data!.pendingGcash!.bookingId)}>View payment booking</button></> : <p>No submitted GCash payments await review.</p>}</> : <p>Payment summary unavailable. Retry the booking overview.</p>}</aside></div>
    {detailPanel}
  </div></div>;
}
