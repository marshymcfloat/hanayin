"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ownerPreviewKeys, ownerPreviewStaleTime, type OwnerPreviewIdentity } from "@/components/dashboard/owner-preview/owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { OwnerCatalogPreviewSkeleton } from "@/components/dashboard/owner-preview/OwnerCatalogPreviewSkeleton";
import { OwnerPreviewRefreshControl } from "@/components/dashboard/owner-preview/OwnerPreviewRefreshControl";
import { OwnerSaleEventsPreview } from "@/components/dashboard/owner-preview/OwnerSaleEventsPreview";
import type { OwnerSaleEventPreviewData } from "@/features/catalog/types/owner-sale-event-preview";
import { OwnerSaleEventsLoading } from "@/components/dashboard/design-study/OwnerSaleEventsLoading";
import styles from "@/components/dashboard/design-study/owner-services.module.css";

export function invalidateAfterSaleEventMutation(client: QueryClient, identity: OwnerPreviewIdentity) {
  for (const page of ["sale-events", "social-posts", "dashboard", "growth", "reports", "bookings"] as const) {
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, page) });
  }
}

export function OwnerSaleEventsPreviewQuery({ redesign = false, fontClassName = "" }: { redesign?: boolean; fontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "sale-events", "page"),
    queryFn: ({ signal }) => previewFetch<OwnerSaleEventPreviewData>(
      `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/sale-events`,
      { signal },
    ),
    staleTime: ownerPreviewStaleTime.saleEvents,
  });

  if (!query.data && query.isPending) return redesign ? <OwnerSaleEventsLoading fontClassName={fontClassName} /> : <OwnerCatalogPreviewSkeleton label="sale events preview" />;
  if (redesign && !query.data) return <div className={`${styles.page} ${fontClassName}`}><div className={styles.content}><header className={styles.header}><h1>Sale events</h1></header><div className={styles.empty}><div><h2>We couldn’t load your offers.</h2><p role="alert">Try refreshing to reconnect.</p><button type="button" disabled={query.isFetching} className={styles.primary} onClick={() => void query.refetch()}>{query.isFetching ? "Retrying…" : "Try again"}</button></div></div></div></div>;

  const refreshControl = <OwnerPreviewRefreshControl
    label="sale events"
    isFetching={query.isFetching}
    updatedAt={query.dataUpdatedAt}
    error={query.isError ? "Refresh failed; showing saved data if available." : null}
    onRefresh={() => { void query.refetch(); }}
  />;

  return <>
    {redesign ? query.isError && <p role="alert" className={styles.notice}>Refresh failed. Showing your last loaded offers; try Refresh data again.</p> : <div className="px-4 pt-5 sm:px-6 md:pl-[160px] xl:pl-[172px]">{refreshControl}</div>}
    <OwnerSaleEventsPreview
    redesign={redesign}
    fontClassName={fontClassName}
    result={query.data
      ? { success: true, data: query.data }
      : { success: false, reason: "LOAD_FAILED", error: "Sale events could not be loaded. Retry to refresh." }}
    onChanged={(events) => {
      void client.cancelQueries({ queryKey: ownerPreviewKeys.section(identity, "sale-events", "page"), exact: true }).then(() => {
        if (events) {
          client.setQueryData<OwnerSaleEventPreviewData>(
            ownerPreviewKeys.section(identity, "sale-events", "page"),
            (current) => current && { ...current, events },
          );
        }
        invalidateAfterSaleEventMutation(client, identity);
      });
    }}
    />
  </>;
}
