"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ownerPreviewKeys, ownerPreviewStaleTime, type OwnerPreviewIdentity } from "./owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "./OwnerPreviewQueryProvider";
import { OwnerCatalogPreviewSkeleton } from "./OwnerCatalogPreviewSkeleton";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";
import { OwnerSocialPostsPreview } from "./OwnerSocialPostsPreview";
import type { OwnerSocialPostDeliveryPreview } from "@/features/social/queries/owner-social-post-preview";
import type { OwnerSocialPostsPreviewData } from "@/features/social/types/owner-social-post-preview";
import { OwnerSocialPostsLoading } from "@/components/dashboard/design-study/OwnerSocialPostsLoading";
import styles from "@/components/dashboard/design-study/owner-services.module.css";

export function hasPendingSocialDelivery(data: OwnerSocialPostsPreviewData | undefined) {
  return Boolean(data?.posts.some((post) =>
    post.status === "PUBLISHING" ||
    post.targets.some((target) => target.status === "QUEUED" || target.status === "PUBLISHING"),
  ));
}

export function mergeSocialDeliveryStatuses(
  data: OwnerSocialPostsPreviewData,
  delivery: OwnerSocialPostDeliveryPreview,
): OwnerSocialPostsPreviewData {
  if (Date.parse(delivery.generatedAt) <= Date.parse(data.deliveryUpdatedAt ?? data.generatedAt)) {
    return data;
  }
  const byId = new Map(delivery.posts.map((post) => [post.id, post]));
  let changed = false;
  const posts = data.posts.map((post) => {
    const latest = byId.get(post.id);
    if (!latest) return post;
    const targetById = new Map(latest.targets.map((target) => [target.id, target]));
    let targetChanged = false;
    const targets = post.targets.map((target) => {
      const next = targetById.get(target.id);
      if (!next || (next.status === target.status && next.lastError === target.lastError && next.publishedAt === target.publishedAt && next.remotePermalink === target.remotePermalink)) return target;
      changed = true;
      targetChanged = true;
      return { ...target, ...next };
    });
    if (latest.status === post.status && latest.lastError === post.lastError && latest.publishedAt === post.publishedAt && !targetChanged) return post;
    changed = true;
    return { ...post, status: latest.status, lastError: latest.lastError, publishedAt: latest.publishedAt, targets };
  });
  if (!changed) return { ...data, deliveryUpdatedAt: delivery.generatedAt };
  return {
    ...data,
    deliveryUpdatedAt: delivery.generatedAt,
    posts,
    metrics: {
      totalPosts: posts.length,
      drafts: posts.filter((post) => post.status === "DRAFT").length,
      ready: posts.filter((post) => post.status === "READY").length,
      publishing: posts.filter((post) => post.status === "PUBLISHING").length,
      published: posts.filter((post) => post.status === "PUBLISHED").length,
      failed: posts.filter((post) => post.status === "FAILED").length,
    },
  };
}

export function invalidateAfterSocialPostMutation(client: QueryClient, identity: OwnerPreviewIdentity) {
  for (const page of ["social-posts", "sale-events", "dashboard", "growth", "reports"] as const) {
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, page) });
  }
}

export function OwnerSocialPostsPreviewQuery({ redesign = false, fontClassName = "" }: { redesign?: boolean; fontClassName?: string } = {}) {
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const client = useQueryClient();
  const [visible, setVisible] = useState(true);
  const pageKey = useMemo(() => ownerPreviewKeys.section(identity, "social-posts", "page"), [identity]);
  const query = useQuery({
    queryKey: pageKey,
    queryFn: ({ signal }) => previewFetch<OwnerSocialPostsPreviewData>(
      `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/social-posts`,
      { signal },
    ),
    staleTime: ownerPreviewStaleTime.socialPosts,
  });

  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const deliveryQuery = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "social-posts", "deliveries"),
    queryFn: ({ signal }) => previewFetch<OwnerSocialPostDeliveryPreview>(
      `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/social-posts/deliveries`,
      { signal },
    ),
    staleTime: ownerPreviewStaleTime.socialPosts,
    enabled: hasPendingSocialDelivery(query.data),
    refetchInterval: visible && hasPendingSocialDelivery(query.data) ? 30_000 : false,
  });

  useEffect(() => {
    if (!deliveryQuery.data) return;
    client.setQueryData<OwnerSocialPostsPreviewData>(pageKey, (current) =>
      current ? mergeSocialDeliveryStatuses(current, deliveryQuery.data) : current,
    );
  }, [client, deliveryQuery.data, pageKey]);

  if (!query.data && query.isPending) return redesign ? <OwnerSocialPostsLoading/> : <OwnerCatalogPreviewSkeleton label="social posts preview" />;
  if (redesign && !query.data) return <div className={styles.empty} role="alert"><div><h2>Social posts could not be loaded</h2><p>Your posts have not changed. Try again in a moment.</p><button className={styles.secondary} disabled={query.isFetching} onClick={() => { void query.refetch(); }}>Try again</button></div></div>;

  const refreshControl = <OwnerPreviewRefreshControl
    label="social posts"
    isFetching={query.isFetching}
    updatedAt={query.dataUpdatedAt}
    error={query.isError ? "Refresh failed; showing saved data if available." : null}
    onRefresh={() => { void query.refetch(); }}
  />;
  const deliveryRefreshControl = query.data?.posts.some((post) => post.targets.length > 0)
    ? <OwnerPreviewRefreshControl
      label="delivery statuses"
      isFetching={deliveryQuery.isFetching}
      updatedAt={deliveryQuery.dataUpdatedAt}
      error={deliveryQuery.isError ? "Delivery refresh failed; showing saved status." : null}
      onRefresh={() => { void deliveryQuery.refetch(); }}
    />
    : null;

  return <>
    {!redesign && <div className="flex flex-wrap gap-3 px-4 pt-5 sm:px-6 md:pl-[160px] xl:pl-[172px]">
      {refreshControl}
      {deliveryRefreshControl}
    </div>}
    {redesign && (query.isError || deliveryQuery.isError) && <p role="status" className={styles.description}>Refresh could not finish. Showing your last loaded posts; use Refresh data to retry.</p>}
    <OwnerSocialPostsPreview
      redesign={redesign}
      fontClassName={fontClassName}
      businessSlug={identity.businessSlug}
      data={query.data ?? null}
      error={query.data ? null : "Social posts could not be loaded. Retry to refresh."}
      onChanged={(posts) => {
        if (posts) {
          client.setQueryData<OwnerSocialPostsPreviewData>(pageKey, (current) => current && {
            ...current,
            posts,
            metrics: {
              totalPosts: posts.length,
              drafts: posts.filter((post) => post.status === "DRAFT").length,
              ready: posts.filter((post) => post.status === "READY").length,
              publishing: posts.filter((post) => post.status === "PUBLISHING").length,
              published: posts.filter((post) => post.status === "PUBLISHED").length,
              failed: posts.filter((post) => post.status === "FAILED").length,
            },
          });
        }
        invalidateAfterSocialPostMutation(client, identity);
      }}
    />
  </>;
}
