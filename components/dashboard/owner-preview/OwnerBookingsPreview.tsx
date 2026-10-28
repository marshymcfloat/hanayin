"use client";

import { useCatalogListState } from "@/components/dashboard/owner-preview/useCatalogListState";

import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, CalendarDays, Clock3, CreditCard, Wallet } from "lucide-react";
import type { OwnerBookingList, OwnerBookingPreviewItem, OwnerBookingSummary } from "@/features/bookings/types/owner-bookings-preview";
import type { OwnerGcashReviewQueue } from "@/features/payments/types/owner-gcash-review";
import { LazyBookingQuickPanel } from "@/components/bookings/LazyBookingQuickPanel";
import { deriveViewerContext } from "@/components/bookings/BookingQuickPanel";
import { GcashFollowUpQueue, GcashVerificationQueue } from "@/components/dashboard/shared/GcashVerificationQueue";
import { BOOKING_PAYMENT_STAGE_LABELS } from "@/lib/utils/booking-payment-stage";
import { cn } from "@/lib/utils";
import { OwnerBookingsStudy } from "@/components/dashboard/design-study/OwnerBookingsStudy";
import bookingStyles from "@/components/dashboard/design-study/owner-bookings.module.css";
import { invalidateOwnerBookingViews } from "@/components/dashboard/owner-preview/owner-booking-invalidation";
import { OwnerPreviewContentSkeleton } from "./OwnerPreviewContentSkeleton";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";
import { ownerPreviewKeys } from "./owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "./OwnerPreviewQueryProvider";
import { actionClass, CustomerWorkspaceShell, panelClass, PersonAvatar, StatusChip, WorkspaceField, WorkspaceFilters, WorkspaceHeader, WorkspaceKpi, WorkspaceMoney, WorkspaceSearch } from "./OwnerCustomerWorkspaceShared";

const statuses = ["All bookings", "Accepted", "On hold", "Completed", "Cancelled"] as const;
type Status = typeof statuses[number];
const apiStatus: Record<Status, string> = { "All bookings": "ALL", Accepted: "ACCEPTED", "On hold": "HOLD", Completed: "COMPLETED", Cancelled: "CANCELLED" };
const dateFormatter = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

function currentDatePH() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function displayDate(value: string | null) { return value ? dateFormatter.format(new Date(value)) : "Unscheduled"; }
function displayTime(value: string | null) { return value ? timeFormatter.format(new Date(value)) : "Unscheduled"; }
function bookingLabel(status: OwnerBookingPreviewItem["status"]) { return status === "HOLD" ? "On hold" : status[0] + status.slice(1).toLowerCase(); }
function bookingTone(status: OwnerBookingPreviewItem["status"]): "negative" | "warning" | "positive" { return status === "CANCELLED" ? "negative" : status === "HOLD" ? "warning" : "positive"; }
function balance(booking: OwnerBookingPreviewItem) { return booking.status === "CANCELLED" ? 0 : Math.max(0, booking.total - booking.paid); }
function paymentLabel(booking: OwnerBookingPreviewItem) { return booking.status === "CANCELLED" ? "Not due" : booking.paymentStatus === "PAID" ? "Paid" : booking.paymentStatus === "PARTIALLY_PAID" ? "Partially paid" : "Unpaid"; }

export function OwnerBookingsPreviewRoute({ bookingAction, servicesCatalog = [], redesign = false, fontClassName = "" }: { bookingAction?: ReactNode; servicesCatalog?: { id: number; name: string; category: string; price: number; duration: number | null }[]; redesign?: boolean; fontClassName?: string } = {}) {
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [selectedBookingId, setSelectedBookingId] = useState<number | null | undefined>(undefined);
  const detailOpener = useRef<HTMLElement | null>(null);
  const openDetail = useCallback((id: number) => {
    detailOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedBookingId(id);
  }, []);
  const restoreDetailFocus = useCallback(() => { detailOpener.current?.focus({ preventScroll: true }); }, []);
  const onDetailOpenChange = useCallback((open: boolean) => { if (!open) setSelectedBookingId(null); }, []);
  const requestedBookingId = Number(searchParams.get("bookingId"));
  const activeBookingId = selectedBookingId === undefined && Number.isSafeInteger(requestedBookingId) && requestedBookingId > 0 ? requestedBookingId : selectedBookingId ?? null;
  const [date, setDate] = useCatalogListState(`${identity.userId}:${identity.businessId}:bookings`, "date", currentDatePH());
  const [allDates, setAllDates] = useCatalogListState(`${identity.userId}:${identity.businessId}:bookings`, "allDates", false);
  const [status, setStatus] = useCatalogListState<Status>(`${identity.userId}:${identity.businessId}:bookings`, "status", "All bookings");
  const [search, setSearch] = useCatalogListState(`${identity.userId}:${identity.businessId}:bookings`, "search", "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [page, setPage] = useCatalogListState(`${identity.userId}:${identity.businessId}:bookings`, "page", 1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const base = `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/bookings`;
  const summary = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "bookings", "summary", { date }),
    queryFn: ({ signal }) => previewFetch<OwnerBookingSummary>(`${base}/summary?date=${encodeURIComponent(date)}`, { signal }),
    staleTime: 10_000,
  });
  const list = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "bookings", "list", { date: allDates ? "all" : date, status: apiStatus[status], q: debouncedSearch, page }),
    queryFn: ({ signal }) => previewFetch<OwnerBookingList>(`${base}/list?${new URLSearchParams({ ...(allDates ? {} : { date }), status: apiStatus[status], q: debouncedSearch, page: String(page) })}`, { signal }),
    staleTime: 30_000,
  });
  const gcashReview = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "bookings", "gcash-review"),
    queryFn: ({ signal }) => previewFetch<OwnerGcashReviewQueue>(`/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/gcash-review`, { signal }),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const invalidateBookingState = () => {
    invalidateOwnerBookingViews(queryClient, identity);
    void queryClient.invalidateQueries({ queryKey: [...ownerPreviewKeys.page(identity, "dashboard"), "financials"] });
    void queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "growth") });
  };
  const refresh = <OwnerPreviewRefreshControl label="bookings" isFetching={summary.isFetching || list.isFetching} updatedAt={Math.min(summary.dataUpdatedAt || Infinity, list.dataUpdatedAt || Infinity) === Infinity ? 0 : Math.min(summary.dataUpdatedAt || Infinity, list.dataUpdatedAt || Infinity)} error={summary.isError || list.isError ? "Refresh failed; showing saved data if available." : null} onRefresh={() => { void refreshTeamQueries(queryClient, ownerPreviewKeys.page(identity, "bookings")); }} />;

  if (redesign) return <OwnerBookingsStudy businessSlug={identity.businessSlug} businessName={identity.businessName} fontClassName={fontClassName} summary={summary} list={list} gcash={gcashReview} date={date} allDates={allDates} status={status} search={search} page={page}
    onDate={value => { setDate(value); setPage(1); }} onAllDates={value => { setAllDates(value); setPage(1); }} onStatus={value => { setStatus(value); setPage(1); }} onSearch={value => { setSearch(value); setPage(1); }} onPage={setPage} onOpen={openDetail} onChanged={invalidateBookingState} refreshControl={refresh}
    detailPanel={<LazyBookingQuickPanel bookingId={activeBookingId} open={activeBookingId !== null} onOpenChange={onDetailOpenChange} servicesCatalog={servicesCatalog} viewerContext={deriveViewerContext({ role: "OWNER" })} onBookingChanged={invalidateBookingState} businessSlug={identity.businessSlug} restoreFocus={restoreDetailFocus} themeClassName={`${bookingStyles.theme} ${fontClassName}`} />} />;

  if (!summary.data && summary.isPending && !list.data && list.isPending) return <OwnerPreviewContentSkeleton />;

  return <CustomerWorkspaceShell businessSlug={identity.businessSlug} active="bookings">
    <WorkspaceHeader businessSlug={identity.businessSlug} businessName={identity.businessName} eyebrow="Appointments & payments" title="Bookings" description="Follow appointments and payments recorded for your business." action={<div className="flex flex-wrap items-center gap-2">{bookingAction ?? <button type="button" disabled className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-full bg-[#20211F] px-5 text-sm font-bold text-white opacity-55">New booking unavailable</button>}{refresh}</div>} />
    <div className="mt-5 flex flex-wrap items-center gap-3"><label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E1E3DE] bg-white px-3 text-xs font-semibold"><CalendarDays className="h-4 w-4 text-[#696C67]" aria-hidden="true" /><span className="sr-only">Booking date</span><input type="date" value={date} onChange={(event) => { if (event.target.value) { setDate(event.target.value); setPage(1); } }} className="min-h-10 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-[#72CF35]" /></label><span className="text-xs text-[#696C67]">Times shown in Philippine time</span></div>
    {gcashReview.data ? <div className="mt-5 space-y-3"><GcashVerificationQueue businessSlug={identity.businessSlug} items={gcashReview.data.verificationItems} onSuccess={invalidateBookingState} /><GcashFollowUpQueue businessSlug={identity.businessSlug} items={gcashReview.data.followUpItems} onSuccess={invalidateBookingState} /></div> : gcashReview.isError ? <p className="mt-5 rounded-[18px] bg-white p-4 text-sm text-[#696C67]" role="alert">GCash review is unavailable. Refresh bookings to retry.</p> : null}
    {summary.data ? <section aria-label="Booking overview" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><WorkspaceKpi label="Selected-day bookings" value={String(summary.data.totalBookings)} detail={dateFormatter.format(new Date(`${date}T12:00:00+08:00`))} icon={CalendarDays} tone="dark" /><WorkspaceKpi label="Open appointments" value={String(summary.data.acceptedCount + summary.data.holdCount)} detail={`${summary.data.acceptedCount} accepted · ${summary.data.holdCount} on hold`} icon={Clock3} tone="lime" /><WorkspaceKpi label="Amount received" value={`₱${summary.data.amountReceived.toLocaleString("en-PH")}`} detail="On selected-day non-cancelled bookings" icon={CreditCard} tone="lime" /><WorkspaceKpi label="Open balance" value={`₱${summary.data.openBalance.toLocaleString("en-PH")}`} detail="On accepted and held bookings" icon={Wallet} tone="coral" /></section> : <p className="mt-5 rounded-[18px] bg-white p-5 text-sm" role="alert">Booking overview unavailable. Use Refresh to retry.</p>}
    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.6fr)]"><section className={cn(panelClass, "min-w-0 overflow-hidden")} aria-labelledby="booking-register-heading"><div className="space-y-4 border-b border-[#ECEEE9] p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 id="booking-register-heading" className="text-lg font-bold">Booking register</h2><p className="mt-1 text-xs text-[#696C67]" role="status">{list.data ? `${list.data.bookings.length} of ${list.data.totalCount} matching bookings` : "Loading bookings"}</p></div><WorkspaceSearch label="Search customer, service or ID" value={search} onChange={(value) => { setSearch(value); setPage(1); }} /></div><div className="flex flex-wrap items-center justify-between gap-3"><WorkspaceFilters label="Booking status" options={statuses} value={status} onChange={(value) => { setStatus(value); setPage(1); }} /><label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[#E1E3DE] bg-[#F8F9F6] px-3 text-xs font-semibold text-[#343633]"><input type="checkbox" checked={allDates} onChange={(event) => { setAllDates(event.target.checked); setPage(1); }} className="accent-[#65BE31]" />All dates</label></div></div>
      {list.data ? <><ul className="divide-y divide-[#ECEEE9]">{list.data.bookings.map((booking, index) => <li key={booking.id} className="p-4 sm:p-5"><div className="flex items-start gap-3"><PersonAvatar name={booking.customerName} tone={index % 2 ? "neutral" : "lime"} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-2"><h3 className="text-sm font-bold sm:text-base">{booking.customerName}</h3><span className="font-mono text-[11px] text-[#696C67]">#{booking.id}</span></div><p className="mt-1 text-xs leading-5 text-[#696C67]">{booking.services.join(", ") || "No service recorded"}</p></div><StatusChip tone={bookingTone(booking.status)}>{bookingLabel(booking.status)}</StatusChip></div><div className="mt-4 rounded-[16px] bg-[#F8F9F6] p-3 lg:bg-transparent lg:p-0 lg:pl-[52px]"><dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4"><WorkspaceField label="Appointment"><span className="font-mono text-xs">{displayTime(booking.scheduledAt)}</span><span className="mt-1 block text-[11px] font-normal text-[#696C67]">{displayDate(booking.scheduledAt)}</span></WorkspaceField><WorkspaceField label="Service provider"><span className="text-xs">{booking.providers.join(", ") || "Unassigned"}</span></WorkspaceField><WorkspaceField label="Booking total"><WorkspaceMoney amount={booking.total} /></WorkspaceField><WorkspaceField label="Payment"><span className="text-xs">{paymentLabel(booking)}</span><span className="mt-1 block text-[11px] font-normal text-[#696C67]">{BOOKING_PAYMENT_STAGE_LABELS[booking.paymentStage]} · ₱{balance(booking).toLocaleString("en-PH")} remaining</span></WorkspaceField></dl><div className="mt-2 flex justify-end"><button type="button" aria-label={"View booking " + booking.id} onClick={() => setSelectedBookingId(booking.id)} className={cn(actionClass, "bg-white")}>View details<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></button></div></div></li>)}</ul>{!list.data.bookings.length && <p className="px-5 py-12 text-center text-sm text-[#696C67]">No bookings match this {allDates ? "filter" : "date and filter"}.</p>}{list.data.totalPages > 1 && <div className="flex items-center justify-end gap-3 border-t border-[#ECEEE9] p-4"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className={cn(actionClass, "disabled:opacity-40")}>Previous</button><span className="text-xs text-[#696C67]">Page {page} of {list.data.totalPages}</span><button type="button" disabled={page >= list.data.totalPages} onClick={() => setPage((current) => current + 1)} className={cn(actionClass, "disabled:opacity-40")}>Next</button></div>}</> : <p className="px-5 py-12 text-center text-sm text-[#696C67]" role={list.isError ? "alert" : "status"}>{list.isError ? "Bookings unavailable. Use Refresh to retry." : "Loading bookings…"}</p>}</section>
      <aside className={cn(panelClass, "p-4 sm:p-5")} aria-labelledby="payment-review-heading"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[#FFF0F0] text-[#C74248]"><CreditCard className="h-[18px] w-[18px]" aria-hidden="true" /></span><div><h2 id="payment-review-heading" className="font-bold">Payment review</h2><p className="mt-1 text-xs text-[#696C67]">{summary.data ? `${summary.data.pendingGcashCount} submitted GCash payment${summary.data.pendingGcashCount === 1 ? "" : "s"} awaiting review` : "Loading payment review"}</p></div></div>{summary.data?.pendingGcash ? <div className="mt-5 rounded-[18px] bg-[#F8F9F6] p-4"><StatusChip tone="warning">{summary.data.pendingGcash.escalated ? "Needs resolution" : "Awaiting verification"}</StatusChip><p className="mt-3 text-sm font-bold">{summary.data.pendingGcash.customerName}</p><p className="mt-1 text-xs leading-5 text-[#696C67]">{summary.data.pendingGcash.services.join(", ") || "No service recorded"} · {displayTime(summary.data.pendingGcash.scheduledAt)}</p><div className="mt-4 text-xl"><WorkspaceMoney amount={summary.data.pendingGcash.amount} /></div><p className="mt-1 text-xs text-[#696C67]">Submitted GCash payment not yet verified · booking #{summary.data.pendingGcash.bookingId}</p></div> : <p className="mt-5 rounded-[18px] bg-[#F8F9F6] p-5 text-center text-sm text-[#696C67]">{summary.data ? "No submitted GCash payments await review." : "Payment review unavailable."}</p>}</aside></div>
    <LazyBookingQuickPanel bookingId={activeBookingId} open={activeBookingId !== null} onOpenChange={(open) => { if (!open) setSelectedBookingId(null); }} servicesCatalog={servicesCatalog} viewerContext={deriveViewerContext({ role: "OWNER" })} onBookingChanged={invalidateBookingState} />
  </CustomerWorkspaceShell>;
}
