"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";
import { claimServiceAsOwnerAction, unclaimServiceAsOwnerAction, markServiceServedAsOwnerAction, unserveServiceAsOwnerAction } from "@/features/dashboard/actions/owner";
import { createExpense } from "@/features/payroll/actions/expenses";
import type { CreateExpenseParams } from "@/lib/expenses/constants";
import type { OwnerRedesignAnalytics } from "@/features/dashboard/types/owner-redesign";
import type { OwnerDashboardTodayDto, OwnerDashboardQueueDto, OwnerDashboardGrowthDto } from "@/features/dashboard/types/owner-dashboard-preview";
import OwnerDashboardStudy from "@/components/dashboard/design-study/OwnerDashboardStudy";
import { useOwnerBookingController } from "@/components/dashboard/owner-preview/OwnerBookingController";
import DashboardRefreshButton from "@/components/dashboard/design-study/DashboardRefreshButton";

export type QueueAction = "claim" | "unclaim" | "serve" | "undo";
export type ExpenseDraft = Omit<CreateExpenseParams, "businessSlug">;
export type MutationResult = { success: boolean; error?: string };

const MemoizedDashboard = memo(OwnerDashboardStudy);
// Keep response timestamps in the cache without treating them as visible queue changes.
const selectQueue = ({ queue }: OwnerDashboardQueueDto) => ({ queue });

function DashboardRefreshControl({ pending, onRefresh }: { pending: boolean; onRefresh: () => void }) {
  const identity = useOwnerPreviewContext();
  const refreshing = useIsFetching({ queryKey: ownerPreviewKeys.page(identity, "dashboard") }) > 0;
  return <DashboardRefreshButton refreshing={refreshing} pending={pending} onRefresh={onRefresh} />;
}

export default function OwnerRedesignQuery({ fontClassName }: { fontClassName: string }) {
  const identity = useOwnerPreviewContext();
  const { openBooking } = useOwnerBookingController();
  const fetchData = useOwnerPreviewFetch();
  const client = useQueryClient();
  const business = useMemo(() => ({ name: identity.businessName, slug: identity.businessSlug }), [identity.businessName, identity.businessSlug]);
  const base = `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/dashboard`;
  const [pending, setPending] = useState(false);
  const mutationLock = useRef(false);
  const analytics = useQuery({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "redesign"), queryFn: ({ signal }) => fetchData<OwnerRedesignAnalytics>(`${base}/redesign`, { signal }), staleTime: 60000 });
  const today = useQuery({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "today"), queryFn: ({ signal }) => fetchData<OwnerDashboardTodayDto>(`${base}/today`, { signal }), staleTime: 10000 });
  const queue = useQuery({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "queue"), queryFn: ({ signal }) => fetchData<OwnerDashboardQueueDto>(`${base}/queue`, { signal }), select: selectQueue, staleTime: 10000, refetchInterval: pending ? false : 30000, refetchIntervalInBackground: false });
  const growth = useQuery({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "growth"), queryFn: ({ signal }) => fetchData<OwnerDashboardGrowthDto>(`${base}/growth`, { signal }), staleTime: 60000 });
  const queries = [analytics, today, queue, growth];
  const { refetch: refetchAnalytics } = analytics;
  const { refetch: refetchToday } = today;
  const { refetch: refetchQueue } = queue;
  const { refetch: refetchGrowth } = growth;
  const refresh = useCallback(() => { void Promise.all([refetchAnalytics(), refetchToday(), refetchQueue(), refetchGrowth()]); }, [refetchAnalytics, refetchToday, refetchQueue, refetchGrowth]);
  const mutate = useCallback(async (operation: () => Promise<MutationResult>): Promise<MutationResult> => {
    if (mutationLock.current) return { success: false, error: "Another change is still saving." };
    mutationLock.current = true;
    setPending(true);
    try {
      await client.cancelQueries({ queryKey: ownerPreviewKeys.page(identity, "dashboard") });
      const result = await operation();
      if (result.success) await client.invalidateQueries({ queryKey: ownerPreviewKeys.business(identity) });
      return result;
    } catch { refresh(); return { success: false, error: "The save outcome could not be confirmed. Refresh and check your records before trying again." }; }
    finally { mutationLock.current = false; setPending(false); }
  }, [client, identity, refresh]);
  const onBooking = useCallback((focusKey = "redesign-new-booking") => openBooking(focusKey), [openBooking]);
  const onSignOut = useCallback(async () => { await signOut({ callbackUrl: "/" }); }, []);
  const onQueueAction = useCallback((id: number, action: QueueAction) => mutate(() => ({ claim: claimServiceAsOwnerAction, unclaim: unclaimServiceAsOwnerAction, serve: markServiceServedAsOwnerAction, undo: unserveServiceAsOwnerAction })[action](id)), [mutate]);
  const onExpense = useCallback((draft: ExpenseDraft) => mutate(() => createExpense({ ...draft, businessSlug: identity.businessSlug })), [mutate, identity.businessSlug]);
  const refreshControl = useMemo(() => <DashboardRefreshControl pending={pending} onRefresh={refresh} />, [pending, refresh]);
  return <MemoizedDashboard
    business={business}
    ownerName={identity.ownerName} onSignOut={onSignOut}
    fontClassName={fontClassName} analytics={analytics.data} today={today.data} queueData={queue.data} growth={growth.data?.growth}
    analyticsError={analytics.isError} todayError={today.isError} queueError={queue.isError} growthError={growth.isError}
    pending={pending} refreshControl={refreshControl} refreshError={queries.some(query => query.isError && query.data)} onRefresh={refresh}
    onBooking={onBooking} onQueueAction={onQueueAction} onExpense={onExpense}
  />;
}
