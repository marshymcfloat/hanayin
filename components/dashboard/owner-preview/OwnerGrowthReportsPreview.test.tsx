import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
const identity: OwnerPreviewIdentity = { userId: "owner-1", businessId: "business-1", businessSlug: "beautyfeel", businessName: "BeautyFeel", ownerName: "Owner" };
vi.mock("./OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => identity,
  useOwnerPreviewFetch: () => mocks.fetch,
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Area: () => null, Bar: () => null, CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));

import { OwnerGrowthPreview } from "./OwnerGrowthPreview";
import { OwnerReportsPreview, buildReportView } from "./OwnerReportsPreview";

function client() { return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 15 * 60 * 1000 } } }); }
function mount(ui: ReactNode, queryClient: QueryClient) { return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>); }
const growth = { range: "30d", from: "2026-09-01", to: "2026-10-01", kpis: [{ id: "revenue", value: 500, delta: null }], trend: [], topServices: [] };
const overview = {
  range: { preset: "30d", label: "Last 30 days" },
  kpis: { collectedRevenue: 0, totalBookings: 0, bookedRevenue: 0, outstandingBalance: 0, totalExpenses: 0, trueNetProfit: 0, completionRate: 0 },
  trend: [], topServices: [], topCustomers: [], bookingVolume: { hold: 0, accepted: 0, completed: 0, cancelled: 0 }, insights: [],
};

describe("owner Growth and Reports preview cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses a warm growth result without a skeleton or redundant request", async () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "growth", "page", { range: "30d" }), growth);
    mount(<OwnerGrowthPreview />, queryClient);
    expect(screen.getByText("₱500")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading owner dashboard preview")).not.toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("keeps saved growth data visible when refresh fails", async () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "growth", "page", { range: "30d" }), growth);
    mocks.fetch.mockRejectedValue(new Error("offline"));
    mount(<OwnerGrowthPreview />, queryClient);
    fireEvent.click(screen.getByRole("button", { name: "Refresh growth" }));
    expect(screen.getByText("₱500")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Growth refresh failed/)).toBeInTheDocument());
  });

  it("never substitutes demo report totals or rankings for empty live data", () => {
    const view = buildReportView("overview", overview as never);
    expect(view.metrics[0].value).toBe("₱0");
    expect(view.trend).toEqual([]);
    expect(view.tableRows).toEqual([]);
    expect(view.breakdown.every((row) => row.value === "0")).toBe(true);
  });

  it("loads a selected report under its own key, retaining the prior report meanwhile", async () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "reports", "page", { tab: "overview", range: "30d", groupBy: "day" }), { success: true, tab: "overview", range: overview.range, data: overview });
    let resolveRequest: (value: unknown) => void = () => undefined;
    mocks.fetch.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    mount(<OwnerReportsPreview />, queryClient);
    fireEvent.click(screen.getByRole("tab", { name: "Revenue" }));
    expect(screen.getByText(/Showing the previous report/)).toBeInTheDocument();
    expect(screen.getAllByText("₱0").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Export report" })).toBeDisabled();
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("tab=revenue"), expect.anything()));
    resolveRequest({ success: true, tab: "revenue", range: overview.range, data: { kpis: { grossRevenue: 100, collectedRevenue: 80, averageTicket: 80, discountRate: 0 }, trend: [], topCategories: [], paymentMix: [] } });
    await waitFor(() => expect(screen.getByText("₱100")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Export report" })).toHaveAttribute("href", expect.stringContaining("tab=revenue"));
  });

  it("reports failed Growth range switches as retryable while retaining the old range", async () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "growth", "page", { range: "30d" }), growth);
    mocks.fetch.mockRejectedValue(new Error("offline"));
    mount(<OwnerGrowthPreview />, queryClient);
    fireEvent.change(screen.getByRole("combobox", { name: "Range" }), { target: { value: "7d" } });
    await waitFor(() => expect(screen.getByText(/The 7d range could not be loaded/)).toBeInTheDocument());
    expect(screen.getByText("₱500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh growth" })).toHaveTextContent("Retry");
    expect(screen.queryByText(/while 7d loads/)).not.toBeInTheDocument();
  });

  it("reports failed Reports tab switches and disables export for previous data", async () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "reports", "page", { tab: "overview", range: "30d", groupBy: "day" }), { success: true, tab: "overview", range: overview.range, data: overview });
    mocks.fetch.mockRejectedValue(new Error("offline"));
    mount(<OwnerReportsPreview />, queryClient);
    fireEvent.click(screen.getByRole("tab", { name: "Revenue" }));
    await waitFor(() => expect(screen.getByText(/The selected report could not be loaded/)).toBeInTheDocument());
    expect(screen.getAllByText("₱0").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Export report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh reports" })).toHaveTextContent("Retry");
    expect(screen.queryByText(/while the selected report loads/)).not.toBeInTheDocument();
  });

  it("disables unsupported Expenses export with an explanation", () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "reports", "page", { tab: "overview", range: "30d", groupBy: "day" }), { success: true, tab: "overview", range: overview.range, data: overview });
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "reports", "page", { tab: "expenses", range: "30d", groupBy: "day" }), {
      success: true,
      tab: "expenses",
      range: overview.range,
      data: { kpis: { totalExpenses: 0, entryCount: 0, avgPerDay: 0, topCategory: null, expenseToRevenueRatio: 0 }, trend: [], entries: [], byCategory: [] },
    });
    mount(<OwnerReportsPreview />, queryClient);
    fireEvent.click(screen.getByRole("tab", { name: "Expenses" }));
    expect(screen.getByRole("button", { name: "Export report" })).toBeDisabled();
    expect(screen.getByText("Expenses export is not available yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Export report" })).not.toBeInTheDocument();
  });
});
