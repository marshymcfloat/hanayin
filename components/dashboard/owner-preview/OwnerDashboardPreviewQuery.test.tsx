import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";
import type {
  OwnerDashboardFinancialRangeDto,
  OwnerDashboardGrowthDto,
  OwnerDashboardPerformanceDto,
  OwnerDashboardQueueDto,
  OwnerDashboardTodayDto,
} from "@/features/dashboard/types/owner-dashboard-preview";
import type { DashboardExpenseFeedback, DashboardQueueAction, DashboardRefreshControls } from "./OwnerDashboardPreview";
import type { DashboardExpenseDraft } from "@/features/dashboard/owner-preview-expense-optimism";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), claim: vi.fn(), unclaim: vi.fn(), serve: vi.fn(), unserve: vi.fn(), createExpense: vi.fn(), expenseResult: vi.fn(),
}));
vi.mock("@/features/dashboard/actions/owner", () => ({
  claimServiceAsOwnerAction: mocks.claim,
  unclaimServiceAsOwnerAction: mocks.unclaim,
  markServiceServedAsOwnerAction: mocks.serve,
  unserveServiceAsOwnerAction: mocks.unserve,
}));
vi.mock("@/features/payroll/actions/expenses", () => ({ createExpense: mocks.createExpense }));
const identity: OwnerPreviewIdentity = {
  userId: "owner-1",
  businessId: "business-1",
  businessSlug: "beautyfeel",
  businessName: "BeautyFeel",
  ownerName: "Owner",
};
const performance: OwnerDashboardPerformanceDto = {
  generatedAt: "2026-09-27T00:00:00.000Z",
  business: { slug: "beautyfeel", name: "BeautyFeel" },
  kpis: [{ id: "revenue", label: "Revenue", value: 100, format: "currency", change: "Current month" }],
  financials: { month: [{ period: "September", revenue: 100, expenses: 0, cashflow: 100 }] },
  expenseBreakdown: [], topServices: [], topCustomers: [], staff: [],
  availability: { staffUtilization: "unavailable" },
};
const today: OwnerDashboardTodayDto = { generatedAt: performance.generatedAt, bookings: [] };
const queue: OwnerDashboardQueueDto = { generatedAt: performance.generatedAt, queue: [
  { id: 12, service: "Pending service", customer: "A", time: "9:00 AM", price: 100, status: "PENDING" },
  { id: 13, service: "Claimed service", customer: "B", time: "9:30 AM", price: 100, status: "CLAIMED" },
  { id: 14, service: "Serving service", customer: "C", time: "10:00 AM", price: 100, status: "SERVING" },
  { id: 15, service: "Completed service", customer: "D", time: "10:30 AM", price: 100, status: "COMPLETED" },
] };
const growth: OwnerDashboardGrowthDto = {
  generatedAt: performance.generatedAt,
  growth: { enabled: false, opportunity: null, occupancy: null },
  availability: { growthOccupancy: "unavailable" },
};
const financials: OwnerDashboardFinancialRangeDto = {
  generatedAt: performance.generatedAt,
  range: "7d",
  points: [{ period: "Sunday", revenue: 50, expenses: 0, cashflow: 50 }],
};

vi.mock("./OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => identity,
  useOwnerPreviewFetch: () => mocks.fetch,
}));
vi.mock("./OwnerDashboardPreview", () => ({
  OwnerDashboardPreview: ({ dashboardData, refresh, chart, onQueueVisibilityChange, onQueueAction, onExpenseSubmit, expenseFeedback }: {
    dashboardData: { kpis: Array<{ value: number }>; financials: Record<string, Array<{ period: string }>>; queue: OwnerDashboardQueueDto["queue"]; expenseBreakdown: OwnerDashboardPerformanceDto["expenseBreakdown"] };
    refresh: DashboardRefreshControls;
    chart: { selectedRange: string; displayedRange: string; onRangeChange: (range: "7d" | "6m") => void };
    onQueueVisibilityChange: (visible: boolean) => void;
    onQueueAction: (action: DashboardQueueAction, id: number) => Promise<{ success: boolean }>;
    onExpenseSubmit: (expense: DashboardExpenseDraft) => Promise<{ success: boolean; error?: string }>;
    expenseFeedback: DashboardExpenseFeedback;
  }) => <main>
    <p>Revenue {dashboardData.kpis[0]?.value}</p>
    <p>Chart {dashboardData.financials[chart.displayedRange]?.[0]?.period}</p>
    <p>Selected {chart.selectedRange}; displayed {chart.displayedRange}</p>
    <p data-testid="queue-statuses">{dashboardData.queue.map((item) => `${item.id}:${item.status}`).join(",")}</p>
    <p data-testid="expense-breakdown">{JSON.stringify(dashboardData.expenseBreakdown)}</p>
    <p data-testid="expense-feedback">{JSON.stringify(expenseFeedback)}</p>
    <button onClick={refresh.all.onRefresh}>Refresh all</button>
    <button onClick={refresh.performance.onRefresh}>Refresh performance</button>
    <button onClick={refresh.today.onRefresh}>Refresh today</button>
    <button onClick={refresh.queue.onRefresh}>Refresh queue</button>
    <button onClick={refresh.growth.onRefresh}>Refresh growth</button>
    <button onClick={refresh.financials.onRefresh}>Refresh chart</button>
    <button onClick={() => chart.onRangeChange("7d")}>Select 7d</button>
    <button onClick={() => chart.onRangeChange("6m")}>Select 6m</button>
    <button onClick={() => onQueueVisibilityChange(true)}>Show queue</button>
    <button onClick={() => onQueueVisibilityChange(false)}>Hide queue</button>
    <button onClick={() => { void onQueueAction("claim", 12); }}>Claim test</button>
    <button onClick={() => { void onQueueAction("unclaim", 13); }}>Unclaim test</button>
    <button onClick={() => { void onQueueAction("serve", 13); }}>Serve test</button>
    <button onClick={() => { void onQueueAction("unserve", 15); }}>Unserve test</button>
    <button onClick={() => { void onExpenseSubmit({ amount: 25.5, category: "SUPPLIES", date: new Date() }).then(mocks.expenseResult); }}>Log expense test</button>
    {refresh.all.error ? <p role="alert">{refresh.all.error}</p> : null}
    {refresh.financials.error ? <p role="alert">{refresh.financials.error}</p> : null}
  </main>,
}));

import { OwnerDashboardPreviewQuery } from "./OwnerDashboardPreviewQuery";

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 15 * 60 * 1000 } } });
}

function view(queryClient: QueryClient) {
  return render(<QueryClientProvider client={queryClient}><OwnerDashboardPreviewQuery /></QueryClientProvider>);
}

function seed(queryClient: QueryClient) {
  queryClient.setQueryData(ownerPreviewKeys.section(identity, "dashboard", "performance"), performance);
  queryClient.setQueryData(ownerPreviewKeys.section(identity, "dashboard", "today"), today);
  queryClient.setQueryData(ownerPreviewKeys.section(identity, "dashboard", "queue"), queue);
  queryClient.setQueryData(ownerPreviewKeys.section(identity, "dashboard", "growth"), growth);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function queueStatuses(queryClient: QueryClient) {
  return queryClient.getQueryData<OwnerDashboardQueueDto>(ownerPreviewKeys.section(identity, "dashboard", "queue"))?.queue.map((item) => item.status);
}

function expenseBreakdown() {
  return JSON.parse(screen.getByTestId("expense-breakdown").textContent || "[]") as OwnerDashboardPerformanceDto["expenseBreakdown"];
}

function expenseFeedback() {
  return JSON.parse(screen.getByTestId("expense-feedback").textContent || "{}") as DashboardExpenseFeedback;
}

beforeEach(() => {
  for (const action of [mocks.claim, mocks.unclaim, mocks.serve, mocks.unserve]) {
    action.mockReset();
    action.mockResolvedValue({ success: true });
  }
  mocks.createExpense.mockReset();
  mocks.createExpense.mockResolvedValue({ success: true });
  mocks.expenseResult.mockReset();
  mocks.fetch.mockReset();
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url.endsWith("/performance")) return performance;
    if (url.endsWith("/today")) return today;
    if (url.endsWith("/queue")) return queue;
    if (url.endsWith("/growth")) return growth;
    if (url.includes("/financials?range=7d")) return financials;
    throw new Error(`Unexpected dashboard URL: ${url}`);
  });
});

describe("owner dashboard section cache", () => {
  it("shows the provisional expense before server completion, blocks duplicates, and removes it on rejection", async () => {
    const queryClient = client();
    seed(queryClient);
    const save = deferred<{ success: boolean; error?: string }>();
    mocks.createExpense.mockReturnValueOnce(save.promise);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    view(queryClient);

    fireEvent.click(screen.getByText("Log expense test"));
    await waitFor(() => expect(expenseBreakdown()).toEqual([
      { name: "Supplies", detail: "Logged operating expenses", value: 25.5, share: 100 },
    ]));
    expect(expenseFeedback()).toMatchObject({ pending: true, status: "Saving expense…", error: null });
    expect(mocks.createExpense).toHaveBeenCalledWith(expect.objectContaining({ businessSlug: "beautyfeel", amount: 25.5, category: "SUPPLIES" }));
    fireEvent.click(screen.getByText("Log expense test"));
    expect(mocks.createExpense).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => { save.resolve({ success: false, error: "Subscription is read only" }); await save.promise; });
    await waitFor(() => expect(expenseBreakdown()).toEqual([]));
    expect(expenseFeedback()).toMatchObject({ pending: false, error: "Subscription is read only" });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("rolls back an uncertain expense save without discarding unrelated cache changes", async () => {
    const queryClient = client();
    const key = ownerPreviewKeys.section(identity, "dashboard", "performance");
    const otherKey = ownerPreviewKeys.section({ ...identity, businessId: "other", businessSlug: "other" }, "dashboard", "performance");
    queryClient.setQueryData(otherKey, performance);
    seed(queryClient);
    const save = deferred<{ success: boolean }>();
    mocks.createExpense.mockReturnValueOnce(save.promise);
    view(queryClient);
    fireEvent.click(screen.getByText("Log expense test"));
    await waitFor(() => expect(expenseBreakdown()[0]?.value).toBe(25.5));
    queryClient.setQueryData<OwnerDashboardPerformanceDto>(key, (current) => current && ({ ...current, topServices: [{ name: "New service", detail: "Current", value: 50, share: 100 }] }));
    await act(async () => { save.reject(new Error("offline")); await save.promise.catch(() => undefined); });
    expect(expenseBreakdown()).toEqual([]);
    expect(queryClient.getQueryData<OwnerDashboardPerformanceDto>(key)?.topServices[0]?.name).toBe("New service");
    expect(queryClient.getQueryData(otherKey)).toBe(performance);
    expect(expenseFeedback().error).toContain("Could not confirm the save");
  });

  it("keeps an optimistic breakdown through a stale GET, then uses one authoritative amount after save", async () => {
    const queryClient = client();
    seed(queryClient);
    const staleGet = deferred<OwnerDashboardPerformanceDto>();
    const save = deferred<{ success: boolean }>();
    const authoritative: OwnerDashboardPerformanceDto = {
      ...performance,
      generatedAt: performance.generatedAt,
      expenseBreakdown: [{ name: "Supplies", detail: "Logged operating expenses", value: 25.5, share: 100 }],
    };
    let performanceReads = 0;
    mocks.fetch.mockImplementation((url: string) => {
      if (url.endsWith("/performance")) return ++performanceReads === 1 ? staleGet.promise : Promise.resolve(authoritative);
      if (url.endsWith("/today")) return Promise.resolve(today);
      if (url.endsWith("/queue")) return Promise.resolve(queue);
      if (url.endsWith("/growth")) return Promise.resolve(growth);
      throw new Error(`Unexpected dashboard URL: ${url}`);
    });
    mocks.createExpense.mockReturnValueOnce(save.promise);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    view(queryClient);
    fireEvent.click(screen.getByText("Refresh performance"));
    await waitFor(() => expect(performanceReads).toBe(1));
    fireEvent.click(screen.getByText("Log expense test"));
    fireEvent.click(screen.getByText("Refresh performance"));
    fireEvent.click(screen.getByText("Refresh all"));
    await act(async () => { staleGet.resolve(performance); await staleGet.promise; });
    expect(expenseBreakdown()[0]?.value).toBe(25.5);
    expect(expenseFeedback().status).toBe("Saving expense…");

    await act(async () => { save.resolve({ success: true }); await save.promise; });
    await waitFor(() => expect(expenseFeedback().pending).toBe(false));
    expect(expenseBreakdown()).toEqual(authoritative.expenseBreakdown);
    expect(performanceReads).toBe(2);
    expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual(expect.arrayContaining([
      ownerPreviewKeys.section(identity, "dashboard", "performance"),
      [...ownerPreviewKeys.page(identity, "dashboard"), "financials"],
      ownerPreviewKeys.page(identity, "reports"),
      ownerPreviewKeys.section(identity, "payroll", "page"),
    ]));
  });

  it("leaves a cleared private cache empty after a confirmed expense", async () => {
    const queryClient = client();
    const key = ownerPreviewKeys.section(identity, "dashboard", "performance");
    seed(queryClient);
    const save = deferred<{ success: boolean }>();
    mocks.createExpense.mockReturnValueOnce(save.promise);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    view(queryClient);
    fireEvent.click(screen.getByText("Log expense test"));
    await waitFor(() => expect(expenseFeedback().pending).toBe(true));
    queryClient.clear();
    invalidate.mockClear();
    await act(async () => { save.resolve({ success: true }); await save.promise; });
    expect(queryClient.getQueryData(key)).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("distinguishes a confirmed save from a failed dashboard refresh", async () => {
    const queryClient = client();
    seed(queryClient);
    mocks.fetch.mockImplementation((url: string) => {
      if (url.endsWith("/performance")) return Promise.reject(new Error("offline"));
      if (url.endsWith("/today")) return Promise.resolve(today);
      if (url.endsWith("/queue")) return Promise.resolve(queue);
      if (url.endsWith("/growth")) return Promise.resolve(growth);
      throw new Error(`Unexpected dashboard URL: ${url}`);
    });
    view(queryClient);
    fireEvent.click(screen.getByText("Log expense test"));
    await waitFor(() => expect(mocks.expenseResult).toHaveBeenCalledWith({ success: true }));
    expect(mocks.createExpense).toHaveBeenCalledTimes(1);
    expect(expenseFeedback()).toMatchObject({ pending: false, error: expect.stringContaining("Expense saved, but the breakdown could not refresh") });
    expect(expenseBreakdown()).toEqual([]);
  });

  it("routes queue claims through the owner action and refreshes only the queue", async () => {
    const queryClient = client();
    seed(queryClient);
    view(queryClient);
    fireEvent.click(screen.getByText("Claim test"));
    await waitFor(() => expect(mocks.claim).toHaveBeenCalledExactlyOnceWith(12));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    expect(mocks.fetch.mock.calls[0][0]).toContain("/queue");
  });

  it("invalidates dependent owner data after serving, but not on failure", async () => {
    const queryClient = client();
    seed(queryClient);
    view(queryClient);
    fireEvent.click(screen.getByText("Serve test"));
    await waitFor(() => expect(mocks.serve).toHaveBeenCalledExactlyOnceWith(13));
    await waitFor(() => expect(mocks.fetch.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(mocks.fetch.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
      expect.stringContaining("/queue"), expect.stringContaining("/today"), expect.stringContaining("/performance"),
    ]));

    mocks.fetch.mockClear();
    mocks.serve.mockResolvedValue({ success: false, error: "Conflict" });
    fireEvent.click(screen.getByText("Serve test"));
    await waitFor(() => expect(mocks.serve).toHaveBeenCalledTimes(2));
    expect(mocks.fetch.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining("/queue"),
    ]);
  });

  it.each([
    ["claim", "Claim test", mocks.claim, "CLAIMED", 0],
    ["unclaim", "Unclaim test", mocks.unclaim, "PENDING", 1],
    ["serve", "Serve test", mocks.serve, "COMPLETED", 1],
    ["unserve", "Unserve test", mocks.unserve, "CLAIMED", 3],
  ] as const)("shows %s immediately, then rolls back its row on rejection", async (_action, label, handler, nextStatus, rowIndex) => {
    const queryClient = client();
    seed(queryClient);
    const pending = deferred<{ success: boolean; error?: string }>();
    handler.mockReturnValueOnce(pending.promise);
    view(queryClient);

    fireEvent.click(screen.getByText(label));
    await waitFor(() => expect(queueStatuses(queryClient)?.[rowIndex]).toBe(nextStatus));
    expect(screen.getByTestId("queue-statuses")).toHaveTextContent(`${queue.queue[rowIndex].id}:${nextStatus}`);
    fireEvent.click(screen.getByText("Claim test"));
    expect(mocks.claim).toHaveBeenCalledTimes(label === "Claim test" ? 1 : 0);

    await act(async () => { pending.resolve({ success: false, error: "Conflict" }); await pending.promise; });
    await waitFor(() => expect(queueStatuses(queryClient)?.[rowIndex]).toBe(queue.queue[rowIndex].status));
    expect(screen.getByTestId("queue-statuses")).toHaveTextContent(`${queue.queue[rowIndex].id}:${queue.queue[rowIndex].status}`);
  });

  it("keeps an optimistic claim through a stale in-flight GET and manual refresh", async () => {
    const queryClient = client();
    seed(queryClient);
    const staleGet = deferred<OwnerDashboardQueueDto>();
    const save = deferred<{ success: boolean; error?: string }>();
    mocks.fetch.mockImplementation((url: string) => url.endsWith("/queue") ? staleGet.promise : Promise.resolve(
      url.endsWith("/performance") ? performance : url.endsWith("/today") ? today : growth,
    ));
    mocks.claim.mockReturnValueOnce(save.promise);
    view(queryClient);

    fireEvent.click(screen.getByText("Refresh queue"));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("Claim test"));
    await waitFor(() => expect(queueStatuses(queryClient)?.[0]).toBe("CLAIMED"));
    fireEvent.click(screen.getByText("Refresh queue"));
    fireEvent.click(screen.getByText("Refresh all"));
    await act(async () => { staleGet.resolve(queue); await staleGet.promise; });
    expect(queueStatuses(queryClient)?.[0]).toBe("CLAIMED");
    expect(screen.getByTestId("queue-statuses")).toHaveTextContent("12:CLAIMED");

    await act(async () => { save.resolve({ success: false, error: "Conflict" }); await save.promise; });
    await waitFor(() => expect(queueStatuses(queryClient)?.[0]).toBe("PENDING"));
  });

  it("preserves unrelated edits on rollback and leaves newer or cleared cache untouched", async () => {
    const queryClient = client();
    const queueKey = ownerPreviewKeys.section(identity, "dashboard", "queue");
    const otherQueueKey = ownerPreviewKeys.section({ ...identity, businessId: "business-2", businessSlug: "other" }, "dashboard", "queue");
    queryClient.setQueryData(otherQueueKey, queue);
    mocks.fetch.mockImplementation((url: string) => Promise.resolve(url.endsWith("/queue")
      ? queryClient.getQueryData<OwnerDashboardQueueDto>(queueKey) ?? queue
      : url.endsWith("/today") ? today : url.endsWith("/performance") ? performance : growth));
    seed(queryClient);
    const failure = deferred<{ success: boolean; error?: string }>();
    mocks.claim.mockReturnValueOnce(failure.promise);
    view(queryClient);
    fireEvent.click(screen.getByText("Claim test"));
    await waitFor(() => expect(queueStatuses(queryClient)?.[0]).toBe("CLAIMED"));
    queryClient.setQueryData<OwnerDashboardQueueDto>(queueKey, (current) => current && ({
      ...current, queue: current.queue.map((item) => item.id === 13 ? { ...item, price: 999 } : item),
    }));
    await act(async () => { failure.resolve({ success: false, error: "Conflict" }); await failure.promise; });
    await waitFor(() => expect(queueStatuses(queryClient)?.[0]).toBe("PENDING"));
    expect(queryClient.getQueryData<OwnerDashboardQueueDto>(queueKey)?.queue[1].price).toBe(999);
    expect(queryClient.getQueryData(otherQueueKey)).toBe(queue);

    const newerFailure = deferred<{ success: boolean; error?: string }>();
    mocks.claim.mockReturnValueOnce(newerFailure.promise);
    fireEvent.click(screen.getByText("Claim test"));
    await waitFor(() => expect(queueStatuses(queryClient)?.[0]).toBe("CLAIMED"));
    queryClient.setQueryData<OwnerDashboardQueueDto>(queueKey, (current) => current && ({
      ...current, generatedAt: "2026-09-28T00:00:00.000Z", queue: current.queue.map((item) => item.id === 12 ? { ...item, status: "SERVING" } : item),
    }));
    await act(async () => { newerFailure.resolve({ success: false, error: "Conflict" }); await newerFailure.promise; });
    expect(queueStatuses(queryClient)?.[0]).toBe("SERVING");

    queryClient.setQueryData(queueKey, queue);
    const clearedFailure = deferred<{ success: boolean; error?: string }>();
    mocks.claim.mockReturnValueOnce(clearedFailure.promise);
    fireEvent.click(screen.getByText("Claim test"));
    await waitFor(() => expect(queueStatuses(queryClient)?.[0]).toBe("CLAIMED"));
    queryClient.clear();
    await act(async () => { clearedFailure.reject(new Error("offline")); await clearedFailure.promise.catch(() => undefined); });
    expect(queryClient.getQueryData(queueKey)).toBeUndefined();
  });

  it("does not refresh private sections after the cache is cleared during a successful save", async () => {
    const queryClient = client();
    const queueKey = ownerPreviewKeys.section(identity, "dashboard", "queue");
    seed(queryClient);
    const save = deferred<{ success: boolean; error?: string }>();
    mocks.serve.mockReturnValueOnce(save.promise);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    view(queryClient);
    fireEvent.click(screen.getByText("Serve test"));
    await waitFor(() => expect(queueStatuses(queryClient)?.[1]).toBe("COMPLETED"));
    queryClient.clear();
    invalidate.mockClear();
    await act(async () => { save.resolve({ success: true }); await save.promise; });
    expect(queryClient.getQueryData(queueKey)).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each([
    ["Serve test", mocks.serve],
    ["Unserve test", mocks.unserve],
  ] as const)("invalidates queue and dependent owner pages after %s", async (label, handler) => {
    const queryClient = client();
    seed(queryClient);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    view(queryClient);
    fireEvent.click(screen.getByText(label));
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(7));
    const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
    expect(keys).toEqual(expect.arrayContaining([
      ownerPreviewKeys.section(identity, "dashboard", "queue"),
      ownerPreviewKeys.section(identity, "dashboard", "today"),
      ownerPreviewKeys.section(identity, "dashboard", "performance"),
      [...ownerPreviewKeys.page(identity, "dashboard"), "financials"],
      ownerPreviewKeys.page(identity, "bookings"),
      ownerPreviewKeys.page(identity, "customers"),
      ownerPreviewKeys.page(identity, "reports"),
    ]));
  });
  it("uses a cold skeleton but renders a fresh revisit without any new request", async () => {
    const queryClient = client();
    const first = view(queryClient);
    expect(screen.getByLabelText("Loading owner dashboard preview")).toBeInTheDocument();
    expect(await screen.findByText("Revenue 100")).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    first.unmount();

    view(queryClient);
    expect(screen.queryByLabelText("Loading owner dashboard preview")).not.toBeInTheDocument();
    expect(screen.getByText("Revenue 100")).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
  });

  it("refreshes only the selected section and retains cached content on failure", async () => {
    const queryClient = client();
    seed(queryClient);
    view(queryClient);
    mocks.fetch.mockRejectedValue(new Error("offline"));

    fireEvent.click(screen.getByText("Refresh today"));
    expect(screen.getByText("Revenue 100")).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    expect(mocks.fetch.mock.calls[0][0]).toContain("/today");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("One or more sections could not refresh"));
  });

  it("fetches a chart range on demand, keeps the month chart while loading, and refreshes both chart and performance", async () => {
    const queryClient = client();
    seed(queryClient);
    let resolveRange!: (value: OwnerDashboardFinancialRangeDto) => void;
    const pendingRange = new Promise<OwnerDashboardFinancialRangeDto>((resolve) => { resolveRange = resolve; });
    mocks.fetch.mockImplementation(async (url: string) => url.includes("/financials") ? pendingRange : url.endsWith("/performance") ? performance : null);
    view(queryClient);

    fireEvent.click(screen.getByText("Select 7d"));
    expect(screen.getByText("Chart September")).toBeInTheDocument();
    expect(screen.getByText("Selected 7d; displayed month")).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await act(async () => { resolveRange(financials); await pendingRange; });
    expect(await screen.findByText("Chart Sunday")).toBeInTheDocument();
    expect(screen.getByText("Selected 7d; displayed 7d")).toBeInTheDocument();

    mocks.fetch.mockClear();
    fireEvent.click(screen.getByText("Refresh performance"));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(mocks.fetch.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
      expect.stringContaining("/performance"),
      expect.stringContaining("/financials?range=7d"),
    ]));
  });

  it("polls the queue only while its panel is visible", async () => {
    const queryClient = client();
    seed(queryClient);
    view(queryClient);
    await act(async () => { vi.useFakeTimers(); });
    try {
      await act(async () => { vi.advanceTimersByTime(30_000); });
      expect(mocks.fetch).not.toHaveBeenCalled();
      const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      fireEvent.click(screen.getByText("Show queue"));
      await act(async () => { vi.advanceTimersByTime(30_000); });
      expect(mocks.fetch).not.toHaveBeenCalled();
      visibility.mockReturnValue("visible");
      await act(async () => { vi.advanceTimersByTime(30_000); });
      expect(mocks.fetch.mock.calls.filter((call) => String(call[0]).endsWith("/queue"))).toHaveLength(1);
      fireEvent.click(screen.getByText("Hide queue"));
      mocks.fetch.mockClear();
      await act(async () => { vi.advanceTimersByTime(30_000); });
      expect(mocks.fetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it("keeps the last successful range visible if a later range fails", async () => {
    const queryClient = client();
    seed(queryClient);
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes("range=7d")) return financials;
      if (url.includes("range=6m")) throw new Error("offline");
      throw new Error(`Unexpected dashboard URL: ${url}`);
    });
    view(queryClient);

    fireEvent.click(screen.getByText("Select 7d"));
    expect(await screen.findByText("Chart Sunday")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Select 6m"));
    expect(screen.getByText("Chart Sunday")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.getByText("Chart Sunday")).toBeInTheDocument();
    expect(screen.getByText("Selected 6m; displayed 7d")).toBeInTheDocument();
  });
});
