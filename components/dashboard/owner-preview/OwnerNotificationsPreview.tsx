"use client";

import { useCatalogListState } from "@/components/dashboard/owner-preview/useCatalogListState";

import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Bell, CheckCircle2, CircleAlert, Mail, MessageSquare, Send, type LucideIcon } from "lucide-react";
import type { NotificationHistoryResponse } from "@/features/notifications/types";
import { eventFilters, outcomeFilters, eventLabels, eventGroups, dateFormatter, recipient, deliveryOutcome, outcomeTone, type EventFilter, type OutcomeFilter, type Notification } from "@/features/notifications/presentation";
import { OwnerNotificationsStudy } from "@/components/dashboard/design-study/OwnerNotificationsStudy";
import { OwnerNotificationsFrame } from "@/components/dashboard/design-study/OwnerNotificationsFrame";
import { OwnerNotificationsLoading } from "@/components/dashboard/design-study/OwnerNotificationsLoading";
import { cn } from "@/lib/utils";
import { actionClass, CustomerWorkspaceShell, panelClass, StatusChip, WorkspaceDetails, WorkspaceEmpty, WorkspaceField, WorkspaceFilters, WorkspaceHeader, WorkspaceKpi, WorkspaceSearch } from "./OwnerCustomerWorkspaceShared";
import { OwnerCatalogPreviewSkeleton } from "./OwnerCatalogPreviewSkeleton";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "./OwnerPreviewQueryProvider";
import { ownerPreviewKeys } from "./owner-preview-query";

export function OwnerNotificationsPreview({
  businessSlug, businessName, data, refreshControl, onPageChange,
}: {
  businessSlug: string;
  businessName: string;
  data: NotificationHistoryResponse;
  refreshControl?: ReactNode;
  onPageChange?: (page: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [event, setEvent] = useState<EventFilter>("All events");
  const [outcome, setOutcome] = useState<OutcomeFilter>("All outcomes");
  const notifications = data.notifications;
  const visible = notifications.filter((notification) =>
    (event === "All events" || eventGroups[notification.eventType] === event) &&
    (outcome === "All outcomes" || deliveryOutcome(notification) === outcome) &&
    (recipient(notification) + " " + notification.subject + " " + eventLabels[notification.eventType]).toLowerCase().includes(query.trim().toLowerCase())
  );
  const outcomeCount = (value: OutcomeFilter) => notifications.filter((notification) => deliveryOutcome(notification) === value).length;
  const untrackedCount = outcomeCount("Untracked");
  const smsFailures = notifications.filter((notification) => notification.smsSent === false).length;
  const hasFilters = query.trim() !== "" || event !== "All events" || outcome !== "All outcomes";

  return <CustomerWorkspaceShell businessSlug={businessSlug} active="notifications">
    <WorkspaceHeader businessSlug={businessSlug} businessName={businessName} eyebrow="Customer communications" title="Notifications" description="Review appointment messages, payment receipts, and recorded delivery outcomes across SMS and email." action={refreshControl} />
    <section aria-label="Notification overview for current page" className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <WorkspaceKpi label="Events on page" value={String(notifications.length)} detail={data.totalCount + " in history"} icon={Bell} tone="dark" />
      <WorkspaceKpi label="Delivered" value={String(outcomeCount("Delivered"))} detail="Recorded channels sent" icon={CheckCircle2} tone="lime" />
      <WorkspaceKpi label="Partial delivery" value={String(outcomeCount("Partial delivery"))} detail="At least one channel sent" icon={Send} />
      <WorkspaceKpi label="Failed delivery" value={String(outcomeCount("Failed"))} detail="Known delivery failure" icon={CircleAlert} tone="coral" />
    </section>

    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.6fr)]">
      <section className={cn(panelClass, "min-w-0 overflow-hidden")} aria-labelledby="notification-history-heading">
        <div className="space-y-4 border-b border-[#ECEEE9] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 id="notification-history-heading" className="text-lg font-bold">Delivery history</h2><p className="mt-1 text-xs text-[#696C67]" role="status">{visible.length} of {notifications.length} on this page · {data.totalCount} total events</p></div>
            <WorkspaceSearch label="Search this page by recipient or message" value={query} onChange={setQuery} />
          </div>
          <WorkspaceFilters label="Notification event on this page" options={eventFilters} value={event} onChange={setEvent} />
          <div className="border-t border-[#ECEEE9] pt-3"><WorkspaceFilters label="Delivery outcome on this page" options={outcomeFilters} value={outcome} onChange={setOutcome} /></div>
        </div>
        <ul className="divide-y divide-[#ECEEE9]">{visible.map((notification) => {
          const result = deliveryOutcome(notification);
          const label = eventLabels[notification.eventType];
          return <li key={notification.id} className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[#F1F2EF] text-[#555852]"><Bell className="h-4 w-4" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#696C67]">{label}</p><h3 className="mt-1 text-sm font-bold leading-5">{notification.subject}</h3></div>
            </div>
            <div className="mt-4 space-y-3 rounded-[16px] bg-[#F8F9F6] p-3 lg:ml-[52px] lg:bg-transparent lg:p-0">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{recipient(notification)}<span className="ml-2 font-mono text-[11px] font-normal text-[#696C67]">{dateFormatter.format(new Date(notification.sentAt))}</span></p><StatusChip tone={outcomeTone(result)}>{result}</StatusChip></div>
              <div className="flex flex-wrap items-center gap-2"><ChannelOutcome result={notification.smsSent} label="SMS" icon={MessageSquare} /><ChannelOutcome result={notification.emailSent} label="Email" icon={Mail} />{notification.smsSent === null && notification.emailSent === null && <span className="text-xs text-[#696C67]">Channel outcome not recorded</span>}</div>
              {notification.failureReason && <p className="text-xs leading-5 text-[#C74248]">{notification.failureReason}</p>}
              <div className="flex justify-end"><NotificationDetails notification={notification} /></div>
            </div>
          </li>;
        })}</ul>
        {visible.length === 0 && (hasFilters ? <WorkspaceEmpty title="No matching notifications on this page" onReset={() => { setQuery(""); setEvent("All events"); setOutcome("All outcomes"); }} /> : <div className="grid min-h-56 place-items-center p-6 text-center"><div><Bell className="mx-auto h-5 w-5 text-[#696C67]" aria-hidden="true" /><h3 className="mt-3 text-sm font-bold">No notifications on this page</h3><p className="mt-2 text-xs text-[#696C67]">Processed notifications will appear here.</p></div></div>)}
        {data.totalPages > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ECEEE9] p-4 sm:p-5">
          <p className="text-xs text-[#696C67]">Page {data.page} of {data.totalPages}</p>
          <div className="flex gap-2"><button type="button" className={cn(actionClass, "border border-[#E1E3DE] bg-white disabled:cursor-not-allowed disabled:opacity-50")} disabled={data.page <= 1} onClick={() => onPageChange?.(data.page - 1)}>Previous</button><button type="button" className={cn(actionClass, "border border-[#E1E3DE] bg-white disabled:cursor-not-allowed disabled:opacity-50")} disabled={data.page >= data.totalPages} onClick={() => onPageChange?.(data.page + 1)}>Next</button></div>
        </div>}
      </section>
      <aside className={cn(panelClass, "p-4 sm:p-5")} aria-labelledby="channel-performance-heading">
        <h2 id="channel-performance-heading" className="font-bold">Channel performance</h2>
        <p className="mt-1 text-xs leading-5 text-[#696C67]">Successful sends among recorded channel outcomes on this page</p>
        <div className="mt-5 space-y-6"><ChannelPerformance notifications={notifications} channel="smsSent" label="SMS" icon={MessageSquare} /><ChannelPerformance notifications={notifications} channel="emailSent" label="Email" icon={Mail} /></div>
        <div className="mt-6 border-t border-[#ECEEE9] pt-4"><p className="text-xs font-bold">Delivery attention</p><p className="mt-2 text-xs leading-6 text-[#696C67]">{smsFailures} recorded SMS failures and {untrackedCount} untracked outcomes on this page.</p></div>
      </aside>
    </div>
  </CustomerWorkspaceShell>;
}

export function OwnerNotificationsPreviewRoute({ redesign = false, fontClassName = "" }: { redesign?: boolean; fontClassName?: string } = {}) {
  const identity = useOwnerPreviewContext();
  const client = useQueryClient();
  const previewFetch = useOwnerPreviewFetch();
  const [page, setPage] = useCatalogListState(`${identity.userId}:${identity.businessId}:notifications`, "page", 1);
  const query = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "notifications", "page", { page }),
    queryFn: ({ signal }) => previewFetch<NotificationHistoryResponse>("/api/owner-dashboard-preview/" + encodeURIComponent(identity.businessSlug) + "/notifications?page=" + page, { signal }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  if (!query.data && query.isPending) return redesign ? <OwnerNotificationsLoading /> : <OwnerCatalogPreviewSkeleton label="notifications preview" />;
  const refreshControl = <OwnerPreviewRefreshControl label="notifications" isFetching={query.isFetching} updatedAt={query.dataUpdatedAt} error={query.isError ? "Refresh failed; showing saved data if available." : null} onRefresh={() => { void refreshTeamQueries(client, ownerPreviewKeys.page(identity, "notifications")); }} />;
  if (redesign) return query.data ? <OwnerNotificationsStudy data={query.data} refreshControl={refreshControl} onPageChange={setPage} fontClassName={fontClassName} /> : <OwnerNotificationsFrame><div role="alert">Notification history is unavailable. Use Refresh notifications to try again.</div>{refreshControl}</OwnerNotificationsFrame>;
  if (!query.data) return <CustomerWorkspaceShell businessSlug={identity.businessSlug} active="notifications"><h1 className="text-2xl font-bold">Notifications unavailable</h1><div className="mt-4">{refreshControl}</div></CustomerWorkspaceShell>;
  return <OwnerNotificationsPreview businessSlug={identity.businessSlug} businessName={identity.businessName} data={query.data} refreshControl={refreshControl} onPageChange={setPage} />;
}

function ChannelOutcome({ result, label, icon: Icon }: { result: boolean | null; label: string; icon: LucideIcon }) {
  if (result === null) return null;
  return <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-bold", result ? "bg-[#EFF9E8] text-[#3D791E]" : "bg-[#FFF0F0] text-[#C74248]")}><Icon className="h-3 w-3" aria-hidden="true" />{label} {result ? "delivered" : "failed"}</span>;
}

function ChannelPerformance({ notifications, channel, label, icon: Icon }: { notifications: Notification[]; channel: "smsSent" | "emailSent"; label: string; icon: LucideIcon }) {
  const recorded = notifications.filter((notification) => notification[channel] !== null);
  const successful = recorded.filter((notification) => notification[channel] === true).length;
  const rate = recorded.length ? Math.round(successful / recorded.length * 100) : null;
  return <div><div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs font-bold"><Icon className="h-4 w-4 text-[#696C67]" aria-hidden="true" />{label}</p><span className="font-mono text-lg font-bold">{rate === null ? "—" : rate + "%"}</span></div>
    {rate !== null && <div role="progressbar" aria-label={label + " delivery success"} aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ECEEE9]"><div className="h-full rounded-full bg-[#72CF35]" style={{ width: rate + "%" }} /></div>}
    <p className="mt-2 text-[11px] text-[#696C67]">{successful} delivered of {recorded.length} recorded attempts</p>
  </div>;
}

function NotificationDetails({ notification }: { notification: Notification }) {
  const label = eventLabels[notification.eventType];
  const result = deliveryOutcome(notification);
  return <WorkspaceDetails title="Notification details" description={label + " · " + dateFormatter.format(new Date(notification.sentAt))} trigger={<button type="button" aria-label={"View notification for " + recipient(notification) + ": " + label} className={cn(actionClass, "bg-white")}>View details<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></button>}>
    <h3 className="text-base font-bold leading-6">{notification.subject}</h3><dl className="grid grid-cols-2 gap-4 rounded-[18px] bg-[#F7F8F5] p-4"><WorkspaceField label="Recipient">{recipient(notification)}</WorkspaceField><WorkspaceField label="Sent at">{dateFormatter.format(new Date(notification.sentAt))}</WorkspaceField><WorkspaceField label="Event">{label}</WorkspaceField><WorkspaceField label="Outcome">{result}</WorkspaceField><WorkspaceField label="SMS">{notification.smsSent === null ? "Not recorded" : notification.smsSent ? "Delivered" : "Failed"}</WorkspaceField><WorkspaceField label="Email">{notification.emailSent === null ? "Not recorded" : notification.emailSent ? "Delivered" : "Failed"}</WorkspaceField></dl>{notification.failureReason && <section className="rounded-[18px] bg-[#FFF0F0] p-4"><h3 className="text-sm font-bold text-[#C74248]">Delivery issue</h3><p className="mt-2 text-sm leading-6 text-[#C74248]">{notification.failureReason}</p></section>}
  </WorkspaceDetails>;
}
