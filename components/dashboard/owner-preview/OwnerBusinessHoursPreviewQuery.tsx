"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OwnerBusinessLoading } from "@/components/dashboard/design-study/OwnerBusinessLoading";
import styles from "@/components/dashboard/design-study/owner-business-workspace.module.css";
import { ownerPreviewKeys, ownerPreviewStaleTime } from "@/components/dashboard/owner-preview/owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { OwnerPreviewRefreshControl } from "@/components/dashboard/owner-preview/OwnerPreviewRefreshControl";
import { OwnerBusinessHoursPreview } from "@/components/dashboard/owner-preview/OwnerBusinessHoursPreview";
import { OwnerBusinessHoursPreviewSkeleton } from "@/components/dashboard/owner-preview/OwnerBusinessHoursPreviewSkeleton";
import type { OwnerBusinessHoursPreviewData } from "@/features/businesses/types/owner-business-hours-preview";

export function OwnerBusinessHoursPreviewQuery({ redesign = false, fontClassName = "" }: { redesign?: boolean; fontClassName?: string }) {
  const client = useQueryClient();
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const query = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "business-hours", "page"),
    queryFn: ({ signal }) => previewFetch<OwnerBusinessHoursPreviewData>(
      `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/business-hours`,
      { signal },
    ),
    staleTime: ownerPreviewStaleTime.businessHours,
  });

  if (!query.data && query.isPending) return redesign ? <OwnerBusinessLoading page="business-hours" /> : <OwnerBusinessHoursPreviewSkeleton />;

  const refreshControl = <OwnerPreviewRefreshControl
    label="business hours"
    isFetching={query.isFetching}
    updatedAt={query.dataUpdatedAt}
    error={query.isError ? "Refresh failed; showing saved data if available." : null}
    onRefresh={() => { void query.refetch(); }}
  />;

  if (!query.data && redesign) return <div className={styles.page}><div className={styles.empty}><h1>Business hours unavailable</h1><p role="alert">We couldn’t load your schedule.</p><button className={styles.primary} disabled={query.isFetching} onClick={() => void query.refetch()}>Try again</button></div></div>;
  if (!query.data) return <main className="px-4 py-8 md:pl-[160px]"><h1 className="text-2xl font-bold">Business hours unavailable</h1><div className="mt-4">{refreshControl}</div></main>;

  return <>{redesign && query.isError && <p className={styles.notice} role="alert">Refresh failed. Your saved schedule and any unsaved edits remain visible.</p>}<OwnerBusinessHoursPreview
    redesign={redesign}
    fontClassName={fontClassName}
    businessSlug={identity.businessSlug}
    data={query.data}
    refreshControl={refreshControl}
    onSaved={async () => {
      if (redesign) void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "bookings") });
      const refreshed = await query.refetch();
      return refreshed.isSuccess;
    }}
  /></>;
}
