"use client";

import { useCallback, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  claimServiceAsOwnerAction,
  markServiceServedAsOwnerAction,
  unclaimServiceAsOwnerAction,
  unserveServiceAsOwnerAction,
} from "@/features/dashboard/actions/owner";
import { createExpense } from "@/features/payroll/actions/expenses";
import { ownerPreviewKeys, ownerPreviewStaleTime } from "./owner-preview-query";
import { optimisticExpenseBreakdown, type DashboardExpenseDraft } from "@/features/dashboard/owner-preview-expense-optimism";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "./OwnerPreviewQueryProvider";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";
import { OwnerDashboardPreviewSkeleton } from "./OwnerDashboardPreviewSkeleton";
import {
  OwnerDashboardPreview,
  type DashboardQueueAction,
  type DashboardExpenseFeedback,
  type DashboardRefreshControls,
  type DashboardRefreshState,
} from "./OwnerDashboardPreview";
import type {
  OwnerDashboardFinancialRangeDto,
  OwnerDashboardGrowthDto,
  OwnerDashboardPerformanceDto,
  OwnerDashboardPreviewRange,
  OwnerDashboardPreviewReadModel,
  OwnerDashboardQueueDto,
  OwnerDashboardTodayDto,
} from "@/features/dashboard/types/owner-dashboard-preview";

type RefreshableQuery = {
  isFetching: boolean;
  isError: boolean;
  dataUpdatedAt: number;
  refetch: () => Promise<unknown>;
};

type QueueStatus = OwnerDashboardQueueDto["queue"][number]["status"];
type PendingExpense = { scope: string; draft: DashboardExpenseDraft; now: Date; phase: "saving" | "refreshing"; baselineData: OwnerDashboardPerformanceDto };

function queueStatusAfterAction(action: DashboardQueueAction, status: QueueStatus): QueueStatus | null {
  if (action === "claim") return status === "PENDING" ? "CLAIMED" : null;
  if (action === "unclaim") return status === "CLAIMED" || status === "SERVING" ? "PENDING" : null;
  if (action === "serve") return status === "CLAIMED" || status === "SERVING" ? "COMPLETED" : null;
  return status === "COMPLETED" ? "CLAIMED" : null;
}

function refreshState(query: RefreshableQuery): DashboardRefreshState {
  return {
    isFetching: query.isFetching,
    updatedAt: query.dataUpdatedAt,
    error: query.isError ? "Refresh failed; showing the last available data." : null,
    onRefresh: () => { void query.refetch(); },
  };
}

export function OwnerDashboardPreviewQuery() {
  const identity = useOwnerPreviewContext();
  const queryClient = useQueryClient();
  const previewFetch = useOwnerPreviewFetch();
  const [selectedRange, setSelectedRange] = useState<OwnerDashboardPreviewRange>("month");
  const [lastChart, setLastChart] = useState<OwnerDashboardFinancialRangeDto | null>(null);
  const [queueVisible, setQueueVisible] = useState(false);
  const [queueActionPendingScope, setQueueActionPendingScope] = useState<string | null>(null);
  const [pendingExpense, setPendingExpense] = useState<PendingExpense | null>(null);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const queueActionScopeRef = useRef<string | null>(null);
  const clearedQueueScopeRef = useRef<string | null>(null);
  const expenseActionScopeRef = useRef<string | null>(null);
  const expenseSubmissionScopeRef = useRef<string | null>(null);
  const clearedExpenseScopeRef = useRef<string | null>(null);
  const expenseRequestEpochRef = useRef(0);
  const baseUrl = `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/dashboard`;
  const queueKey = ownerPreviewKeys.section(identity, "dashboard", "queue");
  const queueScope = JSON.stringify(queueKey);
  const performanceKey = ownerPreviewKeys.section(identity, "dashboard", "performance");
  const performanceScope = JSON.stringify(performanceKey);

  const performance = useQuery({
    queryKey: performanceKey,
    queryFn: async ({ signal }) => {
      if (clearedExpenseScopeRef.current === performanceScope) throw new Error("The dashboard is no longer available.");
      const requestEpoch = expenseRequestEpochRef.current;
      const cached = queryClient.getQueryData<OwnerDashboardPerformanceDto>(performanceKey);
      if (expenseActionScopeRef.current === performanceScope && cached) return cached;
      if (expenseActionScopeRef.current === performanceScope) throw new Error("The dashboard is no longer available.");
      const fetched = await previewFetch<OwnerDashboardPerformanceDto>(`${baseUrl}/performance`, { signal });
      if (requestEpoch === expenseRequestEpochRef.current && expenseActionScopeRef.current !== performanceScope) return fetched;
      const current = queryClient.getQueryData<OwnerDashboardPerformanceDto>(performanceKey);
      if (current) return current;
      throw new Error("The dashboard is no longer available.");
    },
    staleTime: ownerPreviewStaleTime.dashboardAnalytics,
  });
  const today = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "dashboard", "today"),
    queryFn: ({ signal }) => previewFetch<OwnerDashboardTodayDto>(`${baseUrl}/today`, { signal }),
    staleTime: ownerPreviewStaleTime.todayBookings,
  });
  const queue = useQuery({
    queryKey: queueKey,
    queryFn: async ({ signal }) => {
      if (clearedQueueScopeRef.current === queueScope) throw new Error("The queue is no longer available.");
      const cached = queryClient.getQueryData<OwnerDashboardQueueDto>(queueKey);
      if (queueActionScopeRef.current === queueScope && cached) return cached;
      if (queueActionScopeRef.current === queueScope) throw new Error("The queue is no longer available.");
      const fetched = await previewFetch<OwnerDashboardQueueDto>(`${baseUrl}/queue`, { signal });
      if (queueActionScopeRef.current !== queueScope) return fetched;
      const current = queryClient.getQueryData<OwnerDashboardQueueDto>(queueKey);
      if (current) return current;
      throw new Error("The queue is no longer available.");
    },
    staleTime: ownerPreviewStaleTime.queue,
    refetchInterval: queueVisible ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const growth = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "dashboard", "growth"),
    queryFn: ({ signal }) => previewFetch<OwnerDashboardGrowthDto>(`${baseUrl}/growth`, { signal }),
    staleTime: ownerPreviewStaleTime.growth,
  });
  const financials = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "dashboard", "financials", { range: selectedRange }),
    queryFn: ({ signal }) => previewFetch<OwnerDashboardFinancialRangeDto>(
      `${baseUrl}/financials?range=${encodeURIComponent(selectedRange)}`,
      { signal },
    ),
    staleTime: ownerPreviewStaleTime.dashboardAnalytics,
    enabled: selectedRange !== "month",
    placeholderData: keepPreviousData,
  });

  const setQueueVisibility = useCallback((visible: boolean) => setQueueVisible(visible), []);
  const activeFinancials = selectedRange === "month" ? performance : financials;
  const baseQueries = [performance, today, queue, growth];
  const allQueries = selectedRange === "month" ? baseQueries : [...baseQueries, financials];
  const refreshAll = () => { void Promise.all(allQueries.map((query) => query.refetch())); };
  const refreshPerformance = () => {
    void performance.refetch();
    if (selectedRange !== "month") void financials.refetch();
  };
  const latestCommonUpdate = Math.min(...allQueries.map((query) => query.dataUpdatedAt).filter(Boolean));
  const allRefresh: DashboardRefreshState = {
    isFetching: allQueries.some((query) => query.isFetching),
    updatedAt: Number.isFinite(latestCommonUpdate) ? latestCommonUpdate : 0,
    error: allQueries.some((query) => query.isError) ? "One or more sections could not refresh; the last available data remains visible." : null,
    onRefresh: refreshAll,
  };

  if (baseQueries.some((query) => !query.data && query.isPending)) return <OwnerDashboardPreviewSkeleton />;

  if (!performance.data || !today.data || !queue.data || !growth.data) {
    return (
      <main className="min-h-dvh bg-[#F5F6F3] px-4 py-8 md:pl-[160px]">
        <h1 className="text-2xl font-bold">Dashboard unavailable</h1>
        <p role="alert" className="mt-2 text-sm text-[#C74248]">A dashboard section could not be loaded. Retry to continue.</p>
        <div className="mt-4"><OwnerPreviewRefreshControl label="dashboard" {...allRefresh} /></div>
      </main>
    );
  }

  const selectedChart = selectedRange !== "month" && financials.data?.range === selectedRange
    ? financials.data
    : null;
  const retainedChart = selectedRange === "month"
    ? null
    : selectedChart ?? financials.data ?? lastChart;
  const displayedRange = retainedChart?.range ?? "month";
  const displayedPoints = displayedRange === "month"
    ? performance.data.financials.month
    : retainedChart?.points ?? [];
  const visiblePendingExpense = pendingExpense?.scope === performanceScope && (
    pendingExpense.phase === "saving" || performance.data === pendingExpense.baselineData
  ) ? pendingExpense : null;
  const optimisticExpense = visiblePendingExpense
    ? optimisticExpenseBreakdown(performance.data.expenseBreakdown, visiblePendingExpense.draft, visiblePendingExpense.now)
    : { items: performance.data.expenseBreakdown, separate: null };
  const expenseFeedback: DashboardExpenseFeedback = {
    pending: pendingExpense?.scope === performanceScope && Boolean(visiblePendingExpense),
    status: visiblePendingExpense?.phase === "saving" ? "Saving expense…" : visiblePendingExpense ? "Expense saved. Updating breakdown…" : null,
    error: expenseError,
    separate: optimisticExpense.separate,
  };
  const dashboardData: OwnerDashboardPreviewReadModel = {
    generatedAt: queue.data.generatedAt,
    business: performance.data.business,
    kpis: performance.data.kpis,
    financials: {
      "7d": displayedRange === "7d" ? displayedPoints : [],
      month: displayedRange === "month" ? displayedPoints : performance.data.financials.month,
      "6m": displayedRange === "6m" ? displayedPoints : [],
      "1y": displayedRange === "1y" ? displayedPoints : [],
    },
    bookings: today.data.bookings,
    expenseBreakdown: optimisticExpense.items,
    topServices: performance.data.topServices,
    topCustomers: performance.data.topCustomers,
    staff: performance.data.staff,
    queue: queue.data.queue,
    growth: growth.data.growth,
    availability: {
      staffUtilization: performance.data.availability.staffUtilization,
      growthOccupancy: growth.data.availability.growthOccupancy,
    },
  };
  const performanceRefresh: DashboardRefreshState = selectedRange === "month"
    ? { ...refreshState(performance), onRefresh: refreshPerformance }
    : {
      isFetching: performance.isFetching || financials.isFetching,
      updatedAt: Math.min(...[performance.dataUpdatedAt, financials.dataUpdatedAt].filter(Boolean)) || 0,
      error: performance.isError || financials.isError
        ? "Refresh failed; showing the last available performance and chart data."
        : null,
      onRefresh: refreshPerformance,
    };
  const refresh: DashboardRefreshControls = {
    all: allRefresh,
    performance: performanceRefresh,
    today: refreshState(today),
    queue: { ...refreshState(queue), isFetching: queue.isFetching || queueActionPendingScope === queueScope },
    growth: refreshState(growth),
    financials: refreshState(activeFinancials),
  };
  const changeRange = (nextRange: OwnerDashboardPreviewRange) => {
    if (selectedRange === "month") {
      setLastChart({ generatedAt: performance.data.generatedAt, range: "month", points: performance.data.financials.month });
    } else if (financials.data?.range === selectedRange) {
      setLastChart(financials.data);
    }
    setSelectedRange(nextRange);
  };

  const runExpenseAction = async (draft: DashboardExpenseDraft) => {
    if (expenseSubmissionScopeRef.current) return { success: false, error: "An expense is still being saved." };
    const initialPerformance = queryClient.getQueryData<OwnerDashboardPerformanceDto>(performanceKey);
    if (!initialPerformance) {
      return { success: false, error: "Dashboard data is unavailable. Refresh before logging an expense." };
    }
    expenseActionScopeRef.current = performanceScope;
    expenseSubmissionScopeRef.current = performanceScope;
    expenseRequestEpochRef.current += 1;
    setExpenseError(null);
    const submittedAt = new Date();
    setPendingExpense({ scope: performanceScope, draft, now: submittedAt, phase: "saving", baselineData: initialPerformance });
    void queryClient.cancelQueries({ queryKey: performanceKey, exact: true });

    let result: { success: boolean; error?: string };
    try {
      result = await createExpense({ ...draft, businessSlug: identity.businessSlug });
    } catch {
      result = { success: false, error: "Could not confirm the save. Refresh or check expenses before retrying." };
    }
    expenseActionScopeRef.current = null;
    if (!queryClient.getQueryData<OwnerDashboardPerformanceDto>(performanceKey)) {
      expenseSubmissionScopeRef.current = null;
      clearedExpenseScopeRef.current = performanceScope;
      setPendingExpense(null);
      return result;
    }
    if (!result.success) {
      expenseSubmissionScopeRef.current = null;
      setPendingExpense(null);
      setExpenseError(result.error || "Failed to log expense.");
      return result;
    }

    const baselineData = queryClient.getQueryData<OwnerDashboardPerformanceDto>(performanceKey);
    const baselineUpdateCount = queryClient.getQueryState(performanceKey)?.dataUpdateCount ?? 0;
    setPendingExpense({ scope: performanceScope, draft, now: submittedAt, phase: "refreshing", baselineData: baselineData ?? initialPerformance });
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: [...ownerPreviewKeys.page(identity, "dashboard"), "financials"] }),
      queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "reports") }),
      queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "payroll", "page"), exact: true }),
    ]);
    await queryClient.invalidateQueries({ queryKey: performanceKey, exact: true });
    const refreshed = queryClient.getQueryState(performanceKey);
    expenseSubmissionScopeRef.current = null;
    if (refreshed?.data && refreshed.dataUpdateCount > baselineUpdateCount && !refreshed.isInvalidated && !refreshed.error) {
      setPendingExpense(null);
    } else {
      setPendingExpense(null);
      if (queryClient.getQueryData<OwnerDashboardPerformanceDto>(performanceKey)) {
        setExpenseError("Expense saved, but the breakdown could not refresh. Refresh the dashboard to see updated totals.");
      } else {
        clearedExpenseScopeRef.current = performanceScope;
      }
    }
    return { success: true };
  };

  const runQueueAction = async (action: DashboardQueueAction, serviceId: number) => {
    if (queueActionScopeRef.current) return { success: false, error: "A queue update is still being saved." };
    const cached = queryClient.getQueryData<OwnerDashboardQueueDto>(queueKey);
    const previousItem = cached?.queue.find((item) => item.id === serviceId);
    const nextStatus = previousItem && queueStatusAfterAction(action, previousItem.status);
    if (!previousItem || !nextStatus) return { success: false, error: "This service has changed. Refresh the queue and try again." };

    queueActionScopeRef.current = queueScope;
    setQueueActionPendingScope(queueScope);
    void queryClient.cancelQueries({ queryKey: queueKey, exact: true });
    const optimisticItem = { ...previousItem, status: nextStatus };
    let applied = false;
    queryClient.setQueryData<OwnerDashboardQueueDto>(queueKey, (current) => {
      if (!current?.queue.includes(previousItem)) return current;
      applied = true;
      return { ...current, queue: current.queue.map((item) => item === previousItem ? optimisticItem : item) };
    });
    const optimisticData = queryClient.getQueryData<OwnerDashboardQueueDto>(queueKey);
    const cachedOptimisticItem = optimisticData?.queue.find((item) => item.id === serviceId);
    if (!applied || !optimisticData || !cachedOptimisticItem || cachedOptimisticItem.status !== nextStatus) {
      queueActionScopeRef.current = null;
      setQueueActionPendingScope(null);
      if (!optimisticData) clearedQueueScopeRef.current = queueScope;
      return { success: false, error: "The queue changed. Refresh it and try again." };
    }

    const actions = {
      claim: claimServiceAsOwnerAction,
      unclaim: unclaimServiceAsOwnerAction,
      serve: markServiceServedAsOwnerAction,
      unserve: unserveServiceAsOwnerAction,
    };
    let result: { success: boolean; error?: string };
    try {
      const response = await actions[action](serviceId);
      result = response.success ? { success: true } : { success: false, error: "error" in response ? response.error : "Unable to update the queue." };
    } catch {
      result = { success: false, error: "Unable to update the queue. Refresh to check its latest state." };
    }

    let rolledBack = false;
    if (!result.success && queryClient.getQueryState(queueKey)) {
      queryClient.setQueryData<OwnerDashboardQueueDto>(queueKey, (current) => {
        if (!current || current.generatedAt !== optimisticData.generatedAt || !current.queue.includes(cachedOptimisticItem)) return current;
        rolledBack = true;
        return { ...current, queue: current.queue.map((item) => item === cachedOptimisticItem ? previousItem : item) };
      });
    }
    queueActionScopeRef.current = null;
    setQueueActionPendingScope(null);
    if (!queryClient.getQueryData<OwnerDashboardQueueDto>(queueKey)) clearedQueueScopeRef.current = queueScope;
    if (queryClient.getQueryData<OwnerDashboardQueueDto>(queueKey) && (result.success || rolledBack)) {
      void queryClient.invalidateQueries({ queryKey: queueKey, exact: true });
    }
    if (result.success && queryClient.getQueryData<OwnerDashboardQueueDto>(queueKey) && (action === "serve" || action === "unserve")) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "today") }),
        queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "performance") }),
        queryClient.invalidateQueries({ queryKey: [...ownerPreviewKeys.page(identity, "dashboard"), "financials"] }),
        queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "bookings") }),
        queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "customers") }),
        queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "reports") }),
      ]);
    }
    return result;
  };

  return <OwnerDashboardPreview
    dashboardData={dashboardData}
    ownerName={identity.ownerName}
    refresh={refresh}
    chart={{ selectedRange, displayedRange, onRangeChange: changeRange }}
    onQueueVisibilityChange={setQueueVisibility}
    onQueueAction={runQueueAction}
    onExpenseSubmit={runExpenseAction}
    expenseFeedback={expenseFeedback}
  />;
}
