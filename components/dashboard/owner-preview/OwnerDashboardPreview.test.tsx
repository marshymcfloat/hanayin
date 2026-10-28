import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";

import type { OwnerDashboardPreviewReadModel } from "@/features/dashboard/types/owner-dashboard-preview";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

vi.mock("gsap", () => ({
  gsap: {
    registerPlugin: vi.fn(),
    timeline: () => ({ fromTo: vi.fn().mockReturnThis() }),
    to: vi.fn(),
  },
}));

vi.mock("@gsap/react", () => ({
  useGSAP: (callback: () => void) => {
    callback();
    return { contextSafe: (fn: () => void) => fn };
  },
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Area: () => null,
  Bar: () => null,
  CartesianGrid: () => null,
  Line: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import { OwnerDashboardPreview, PreviewDesktopRail, PreviewMobileNavigation } from "./OwnerDashboardPreview";
import { OwnerWorkspaceBaseProvider } from "./owner-preview-routing";

const liveData: OwnerDashboardPreviewReadModel = {
  generatedAt: "2026-09-23T10:00:00.000Z",
  business: { slug: "live-studio", name: "Live Studio" },
  kpis: [
    { id: "revenue", label: "Live revenue", value: 125000, format: "currency", change: "+5%" },
  ],
  financials: {
    "7d": [],
    month: [{ period: "Live period", revenue: 125000, expenses: 45000, cashflow: 80000 }],
    "6m": [],
    "1y": [],
  },
  bookings: [
    { id: 901, time: "9:00 AM", customer: "Live Customer", service: "Live Service", staff: "Live Stylist", status: "Confirmed", phone: null, duration: "1 hr", total: 1200, deposit: 300 },
  ],
  expenseBreakdown: [{ name: "Live Expense", detail: "Current period", value: 45000, share: 100 }],
  topServices: [{ name: "Live Top Service", detail: "12 appointments", value: 50000, share: 100 }],
  topCustomers: [{ name: "Live Top Customer", detail: "4 visits", value: 10000, share: 100 }],
  staff: [{ id: "staff-live", name: "Live Staff", role: "Stylist", bookings: 12, revenue: 50000, utilization: null }],
  queue: [{ id: 902, service: "Live Queue Service", customer: "Queue Customer", time: "10:00 AM", price: 900, status: "PENDING" }],
  growth: {
    enabled: true,
    opportunity: {
      id: "growth-live",
      reason: "Live growth reason",
      confidence: 82,
      timeWindowStart: "2:00 PM",
      timeWindowEnd: "5:00 PM",
      recommendedOfferTypes: ["Percentage discount"],
    },
    occupancy: null,
  },
  availability: {
    staffUtilization: "unavailable",
    growthOccupancy: "unavailable",
  },
};

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OwnerDashboardPreview live read model", () => {
  it("keeps primary and account controls in separate desktop rail groups", () => {
    render(
      <OwnerWorkspaceBaseProvider basePath="/app">
        <PreviewDesktopRail businessSlug="beautyfeel" active="services" />
      </OwnerWorkspaceBaseProvider>,
    );

    const primary = screen.getByRole("group", { name: "Primary navigation" });
    const account = screen.getByRole("group", { name: "Account controls" });
    expect(primary.parentElement).toBe(account.parentElement);
    expect(primary).toContainElement(screen.getByRole("navigation", { name: "Owner dashboard navigation" }));
    expect(account).toContainElement(screen.getByRole("link", { name: "Settings" }));
    expect(account).toContainElement(screen.getByRole("button", { name: "Sign out" }));

    fireEvent.click(within(primary).getByRole("button", { name: "Open Business navigation" }));
    expect(screen.getByRole("link", { name: "Services" })).toHaveAttribute("href", "/app/beautyfeel/services");
    expect(screen.getByRole("link", { name: "Services" })).toHaveAttribute("aria-current", "page");
  });

  it("closes the mobile destination menu after selecting a route", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<PreviewMobileNavigation businessSlug="live-studio" />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Team" }));
    expect(screen.getByRole("menu", { name: "Team destinations" })).toBeInTheDocument();
    const payrollLink = screen.getByRole("menuitem", { name: "Payroll" });
    payrollLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(payrollLink);
    expect(screen.queryByRole("menu", { name: "Team destinations" })).not.toBeInTheDocument();
  });

  it("shows a compact mobile expense label with the full accessible action name", () => {
    render(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" />);

    const action = screen.getByRole("button", { name: "Log expense" });
    expect(action.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(within(action).getByText("Expense")).toHaveClass("md:hidden");
    expect(within(action).getByText("Log expense")).toHaveClass("hidden", "md:inline");
    fireEvent.click(action);
    expect(screen.getByRole("dialog", { name: "Log expense" })).toBeInTheDocument();
  });

  it("closes the expense dialog immediately and waits for confirmed success", async () => {
    let finish!: (result: { success: boolean }) => void;
    const onExpenseSubmit = vi.fn(() => new Promise<{ success: boolean }>((resolve) => { finish = resolve; }));
    const view = render(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" onExpenseSubmit={onExpenseSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Log expense" }));
    const dialog = screen.getByRole("dialog", { name: "Log expense" });
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: "125.50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Log expense" }));

    expect(onExpenseSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 125.5, category: "SUPPLIES", date: expect.any(Date) }));
    expect(screen.queryByRole("dialog", { name: "Log expense" })).not.toBeInTheDocument();
    view.rerender(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" onExpenseSubmit={onExpenseSubmit} expenseFeedback={{ pending: true, status: "Saving expense…", error: null, separate: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving expense");
    expect(screen.getByRole("status")).toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Log expense" })).toBeDisabled();
    await act(async () => { finish({ success: true }); });
    view.rerender(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" onExpenseSubmit={onExpenseSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Log expense" }));
    expect(within(screen.getByRole("dialog", { name: "Log expense" })).getByLabelText(/Amount/)).toHaveValue(null);
  });

  it("keeps expense progress visually quiet while preserving errors and provisional amounts", () => {
    const onExpenseSubmit = vi.fn();
    const view = render(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" onExpenseSubmit={onExpenseSubmit} expenseFeedback={{ pending: true, status: "Saving expense…", error: null, separate: { name: "Marketing", amount: 80 } }} />);
    expect(screen.getByRole("status")).toHaveClass("sr-only");
    expect(screen.getByText("Marketing")).toBeInTheDocument();
    expect(screen.getByText(/\+₱80/)).toBeInTheDocument();
    expect(screen.queryByText(/Saving contribution/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log expense" })).toBeDisabled();

    view.rerender(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" onExpenseSubmit={onExpenseSubmit} expenseFeedback={{ pending: true, status: "Expense saved. Updating breakdown…", error: null, separate: null }} />);
    expect(screen.getByRole("status")).toHaveClass("sr-only");
    expect(screen.getByRole("status")).toHaveTextContent("Updating breakdown");

    view.rerender(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" onExpenseSubmit={onExpenseSubmit} expenseFeedback={{ pending: false, status: null, error: "Subscription is read only", separate: null }} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Subscription is read only");
    expect(screen.getByRole("alert")).not.toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Log expense" })).toBeEnabled();
  });

  it("retains the expense draft and error for deliberate retry after a failed save", async () => {
    let finish!: (result: { success: boolean; error?: string }) => void;
    const onExpenseSubmit = vi.fn(() => new Promise<{ success: boolean; error?: string }>((resolve) => { finish = resolve; }));
    render(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" onExpenseSubmit={onExpenseSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Log expense" }));
    const dialog = screen.getByRole("dialog", { name: "Log expense" });
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: "125" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Log expense" }));
    expect(screen.queryByRole("dialog", { name: "Log expense" })).not.toBeInTheDocument();
    await act(async () => { finish({ success: false, error: "Subscription is read only" }); });
    fireEvent.click(screen.getByRole("button", { name: "Log expense" }));
    const retryDialog = screen.getByRole("dialog", { name: "Log expense" });
    expect(within(retryDialog).getByLabelText(/Amount/)).toHaveValue(125);
    expect(within(retryDialog).getByRole("alert")).toHaveTextContent("Subscription is read only");
    expect(onExpenseSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft after an uncertain transport failure", async () => {
    const onExpenseSubmit = vi.fn().mockRejectedValue(new Error("offline"));
    render(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" onExpenseSubmit={onExpenseSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Log expense" }));
    const dialog = screen.getByRole("dialog", { name: "Log expense" });
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: "12.75" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Log expense" }));
    expect(screen.queryByRole("dialog", { name: "Log expense" })).not.toBeInTheDocument();
    await waitFor(() => expect(onExpenseSubmit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Log expense" }));
    const retryDialog = screen.getByRole("dialog", { name: "Log expense" });
    expect(within(retryDialog).getByLabelText(/Amount/)).toHaveValue(12.75);
    expect(within(retryDialog).getByRole("alert")).toHaveTextContent("Could not confirm the save");
  });

  it("wires each dashboard refresh control to its section", () => {
    const onRefresh = {
      all: vi.fn(), performance: vi.fn(), today: vi.fn(), queue: vi.fn(), growth: vi.fn(), financials: vi.fn(),
    };
    const state = (callback: () => void) => ({ isFetching: false, updatedAt: 1, error: null, onRefresh: callback });
    render(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" refresh={{
      all: state(onRefresh.all), performance: state(onRefresh.performance),
      today: state(onRefresh.today), queue: state(onRefresh.queue),
      growth: state(onRefresh.growth), financials: state(onRefresh.financials),
    }} />);

    for (const [label, callback] of [
      ["dashboard", onRefresh.all],
      ["today’s bookings", onRefresh.today],
      ["live queue", onRefresh.queue],
      ["growth opportunity", onRefresh.growth],
      ["financial chart", onRefresh.financials],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: `Refresh ${label}` }));
      expect(callback).toHaveBeenCalledTimes(1);
    }
    expect(screen.getAllByText("Refresh")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Refresh dashboard performance" })).not.toBeInTheDocument();
    expect(onRefresh.performance).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Monthly performance" }).firstElementChild).toHaveClass("grid");
    expect(screen.getByRole("region", { name: "Financial pulse" })).toContainElement(screen.getByRole("button", { name: "Refresh financial chart" }));
    expect(screen.getByRole("region", { name: "Today’s bookings" })).toContainElement(screen.getByRole("button", { name: "Refresh today’s bookings" }));
    expect(screen.getByRole("region", { name: "Live queue" })).toContainElement(screen.getByRole("button", { name: "Refresh live queue" }));
    expect(screen.getByRole("region", { name: "Growth opportunity" })).toContainElement(screen.getByRole("button", { name: "Refresh growth opportunity" }));
    expect(screen.queryByText("vs Jul")).not.toBeInTheDocument();
  });

  it("renders backend-provided dashboard values and explicit unavailable states", () => {
    render(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" />);

    expect(screen.queryByRole("link", { name: "Current dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard", hidden: true })).not.toBeInTheDocument();
    expect(screen.getAllByText("Live Studio").length).toBeGreaterThan(0);
    expect(screen.getByText("Live revenue")).toBeInTheDocument();
    expect(screen.getByText("Live period")).toBeInTheDocument();
    expect(screen.getByText("Live Customer")).toBeInTheDocument();
    expect(screen.getByText("Live Expense")).toBeInTheDocument();
    expect(screen.getByText("Live Top Service")).toBeInTheDocument();
    expect(screen.getByText("Live Top Customer")).toBeInTheDocument();
    expect(screen.getByText("Live Staff")).toBeInTheDocument();
    expect(screen.getByText("Utilization unavailable")).toBeInTheDocument();
    expect(screen.getByText("Live Queue Service")).toBeInTheDocument();
    expect(screen.getByText("Live growth reason")).toBeInTheDocument();
    expect(screen.getByText("Occupancy unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Bianca Cruz")).not.toBeInTheDocument();
  });

  it("moves to the destination tab immediately and respects a manual tab choice after saving", async () => {
    let finishAction!: (result: { success: boolean }) => void;
    const onQueueAction = vi.fn().mockImplementation(() => new Promise<{ success: boolean }>((resolve) => { finishAction = resolve; }));
    const queue = [
      liveData.queue[0],
      { ...liveData.queue[0], id: 903, status: "CLAIMED" as const, service: "Claimed service" },
      { ...liveData.queue[0], id: 904, status: "COMPLETED" as const, service: "Completed service" },
    ];
    const view = render(<OwnerDashboardPreview dashboardData={{ ...liveData, queue }} ownerName="Avery Owner" onQueueAction={onQueueAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim" }));
    expect(onQueueAction).toHaveBeenCalledWith("claim", 902);
    expect(screen.getByRole("tab", { name: /In progress/ })).toHaveAttribute("aria-selected", "true");
    const claimedQueue = [{ ...queue[0], status: "CLAIMED" as const }, ...queue.slice(1)];
    view.rerender(<OwnerDashboardPreview dashboardData={{ ...liveData, queue: claimedQueue }} ownerName="Avery Owner" onQueueAction={onQueueAction} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving");
    fireEvent.click(screen.getByRole("tab", { name: /Pending/ }));
    await act(async () => { finishAction({ success: true }); });
    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: /In progress/ }));
    expect(screen.getByText("Claimed service")).toBeInTheDocument();
    view.rerender(<OwnerDashboardPreview dashboardData={{ ...liveData, generatedAt: "2026-09-23T11:00:00.000Z", queue: claimedQueue }} ownerName="Avery Owner" onQueueAction={onQueueAction} />);
    expect(screen.getByRole("tab", { name: /In progress/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getAllByRole("button", { name: "Done" })[1]);
    await waitFor(() => expect(onQueueAction).toHaveBeenCalledWith("serve", 903));
    expect(screen.getByRole("tab", { name: /Done/ })).toHaveAttribute("aria-selected", "true");
    await act(async () => { finishAction({ success: true }); });
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("restores the previous tab on failure unless the owner selected another tab", async () => {
    const onQueueAction = vi.fn().mockResolvedValue({ success: false, error: "Already claimed" });
    render(<OwnerDashboardPreview dashboardData={liveData} ownerName="Avery Owner" onQueueAction={onQueueAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim" }));
    expect(screen.getByRole("tab", { name: /In progress/ })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("alert")).toHaveTextContent("Already claimed");
    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveAttribute("aria-selected", "true");

    let finishAction!: (result: { success: boolean; error?: string }) => void;
    onQueueAction.mockImplementationOnce(() => new Promise((resolve) => { finishAction = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Claim" }));
    fireEvent.click(screen.getByRole("tab", { name: /Done/ }));
    await act(async () => { finishAction({ success: false, error: "Conflict" }); });
    expect(screen.getByRole("tab", { name: /Done/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Conflict");
  });

  it("keeps every dashboard region stable when collections are empty", () => {
    const emptyData: OwnerDashboardPreviewReadModel = {
      ...liveData,
      kpis: [],
      financials: { "7d": [], month: [], "6m": [], "1y": [] },
      bookings: [],
      expenseBreakdown: [],
      topServices: [],
      topCustomers: [],
      staff: [],
      queue: [],
      growth: { enabled: true, opportunity: null, occupancy: null },
    };

    render(<OwnerDashboardPreview dashboardData={emptyData} ownerName="Avery Owner" />);

    expect(screen.getByText("Performance data unavailable")).toBeInTheDocument();
    expect(screen.getByText("Financial data unavailable")).toBeInTheDocument();
    expect(screen.getByText("No bookings today")).toBeInTheDocument();
    expect(screen.getByText("No expense breakdown yet")).toBeInTheDocument();
    expect(screen.getByText("No top services yet")).toBeInTheDocument();
    expect(screen.getByText("No top customers yet")).toBeInTheDocument();
    expect(screen.getByText("No staff performance data")).toBeInTheDocument();
    expect(screen.getByText("Queue is clear")).toBeInTheDocument();
    expect(screen.getByText("No growth opportunity")).toBeInTheDocument();
  });

  it("renders the complete KPI set as a compact responsive metric rail", () => {
    const kpis: OwnerDashboardPreviewReadModel["kpis"] = [
      { id: "revenue", label: "Monthly revenue", value: 258600, format: "currency", change: "+4.7% from July" },
      { id: "expenses", label: "Operating expenses", value: 92400, format: "currency", change: "35.7% of revenue" },
      { id: "income", label: "Net income", value: 166200, format: "currency", change: "+6.1% from July" },
      { id: "completion", label: "Booking completion", value: 92, format: "percent", change: "184 of 200 bookings" },
      { id: "average", label: "Average booking", value: 1405, format: "currency", change: "+2.3% from July" },
    ];

    render(<OwnerDashboardPreview dashboardData={{ ...liveData, kpis }} ownerName="Avery Owner" />);

    const metricRail = screen.getByRole("region", { name: "Monthly performance" });
    const metricCards = metricRail.querySelectorAll("[data-metric-card]");

    expect(metricCards[0]?.parentElement?.parentElement).toHaveClass("sm:grid-cols-3");
    expect(metricCards).toHaveLength(5);
    expect(Array.from(metricCards).every((card) => card.classList.contains("min-h-[142px]"))).toBe(true);
    expect(Array.from(metricCards).every((card) => card.querySelector(':scope > [aria-hidden="true"]') === null)).toBe(true);
    expect(screen.getByText("Booking completion")).toBeInTheDocument();
    expect(screen.getByText("184 of 200 bookings")).toBeInTheDocument();
  });
});
