import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OwnerDashboardStudy from "@/components/dashboard/design-study/OwnerDashboardStudy";
import { dashboardProps } from "@/components/dashboard/design-study/owner-redesign.test-fixtures";

beforeEach(() => vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)", media: query, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }))));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("live owner redesign", () => {
  it("keeps navigation and resolved cards visible while other sections load", () => {
    const props = dashboardProps();
    const view = render(<OwnerDashboardStudy {...props} business={props.analytics.business} analytics={undefined} queueData={undefined} growth={undefined} />);
    const navigation = screen.getByRole("navigation", { name: "Dashboard sections" });
    expect(navigation).toHaveTextContent("Live queue");
    expect(within(navigation).queryByLabelText(/pending services/)).not.toBeInTheDocument();
    expect(screen.getByText("Test Studio")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Business performance" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("region", { name: /Today’s bookings/ })).toHaveTextContent("Sofia M.");
    expect(screen.queryByText("No upcoming bookings today.")).not.toBeInTheDocument();
    const originalNavigation = navigation;
    view.rerender(<OwnerDashboardStudy {...props} analytics={undefined} business={props.analytics.business} />);
    expect(screen.getByRole("navigation", { name: "Dashboard sections" })).toBe(originalNavigation);
    expect(within(navigation).getByLabelText("1 pending services")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim" })).toBeInTheDocument();
  });

  it("contains an initial queue failure without hiding other sections", () => {
    const props = dashboardProps();
    render(<OwnerDashboardStudy {...props} queueData={undefined} queueError />);
    const queue = screen.getByRole("region", { name: "Live queue" });
    expect(within(queue).getByRole("alert")).toHaveTextContent("This section could not be loaded.");
    expect(screen.getByRole("article", { name: "Total revenue" })).toHaveTextContent("₱280.75");
    expect(screen.queryByText("Queue is clear.")).not.toBeInTheDocument();
  });

  it("preserves accessible internal scrolling and idle timer cleanup", () => {
    vi.useFakeTimers();
    const view = render(<OwnerDashboardStudy {...dashboardProps()} />);
    const dashboard = screen.getByRole("main", { name: "Dashboard overview" });
    const observer = new MutationObserver(() => {});
    observer.observe(dashboard, { attributes: true, attributeFilter: ["data-scrolling"] });
    expect(dashboard).toHaveAttribute("tabindex", "0");
    fireEvent.scroll(dashboard);
    expect(dashboard).toHaveAttribute("data-scrolling", "true");
    fireEvent.scroll(dashboard);
    expect(observer.takeRecords()).toHaveLength(1);
    observer.disconnect();
    act(() => vi.advanceTimersByTime(800));
    expect(dashboard).not.toHaveAttribute("data-scrolling");
    fireEvent.scroll(dashboard);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("uses backend identity and cents without sample claims", () => {
    const { container } = render(<OwnerDashboardStudy {...dashboardProps()} />);
    expect(screen.getByText("Test Studio")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/sample|fictional|preview only|Atelier Studio/i);
    expect(within(screen.getByRole("article", { name: "Total revenue" })).getByText("₱280.75")).toBeInTheDocument();
    expect(screen.getByText("Not tracked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all bookings" })).toHaveAttribute("href", "/app/test-studio/bookings");
  });
  it("keeps failed queue writes unchanged and exposes the server error", async () => {
    const props = dashboardProps();
    props.onQueueAction = vi.fn().mockResolvedValue({ success: false, error: "Already claimed" });
    render(<OwnerDashboardStudy {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim" }));
    expect(await screen.findByText("Already claimed")).toBeInTheDocument();
    expect(props.onQueueAction).toHaveBeenCalledWith(1, "claim");
    expect(screen.getByRole("button", { name: "Pending 1" })).toHaveAttribute("aria-pressed", "true");
  });
  it("switches queue only after confirmation and disables pending actions", async () => {
    const props = dashboardProps();
    const view = render(<OwnerDashboardStudy {...props} pending />);
    expect(screen.getByRole("button", { name: "Claim" })).toBeDisabled();
    view.rerender(<OwnerDashboardStudy {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim" }));
    expect(await screen.findByText("Service moved to in progress.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "In progress 0" })).toHaveAttribute("aria-pressed", "true");
  });
  it("submits the expense sheet with Philippine today, category and description", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T18:00:00Z"));
    const props = dashboardProps();
    props.onExpense = vi.fn().mockResolvedValue({ success: true });
    render(<OwnerDashboardStudy {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    const dialog = screen.getByRole("dialog", { name: "Add expense" });
    expect(dialog).toHaveAttribute("data-slot", "sheet-content");
    expect(within(dialog).getAllByRole("radio")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Date Oct 8, 2026" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount (₱)" }), { target: { value: "125.50" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Description (optional)" }), { target: { value: "Water bill" } });
    fireEvent.click(screen.getByRole("radio", { name: "Utilities" }));
    fireEvent.click(screen.getByRole("button", { name: "Save expense" }));
    expect(await screen.findByText(/Saved ₱125.50/)).toBeInTheDocument();
    expect(props.onExpense).toHaveBeenCalledWith({ amount: 125.50, category: "UTILITIES", description: "Water bill", date: new Date("2026-10-08T12:00:00+08:00") });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("retains expense draft on rejection", async () => {
    const props = dashboardProps();
    props.onExpense = vi.fn().mockResolvedValue({ success: false, error: "Read-only account" });
    render(<OwnerDashboardStudy {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount (₱)" }), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Save expense" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Read-only account");
    expect(screen.getByRole("spinbutton", { name: "Amount (₱)" })).toHaveValue(100);
  });
  it("filters periods independently and preserves chart metric", () => {
    render(<OwnerDashboardStudy {...dashboardProps()} />);
    const choose = (name: string, value: string) => { fireEvent.keyDown(screen.getByRole("combobox", { name }), { key: "Enter" }); fireEvent.click(screen.getByRole("option", { name: value })); };
    choose("Top services time span", "Year");
    expect(screen.getByRole("combobox", { name: "Staff performance time span" })).toHaveTextContent("Month");
    choose("Top customers time span", "Week");
    expect(screen.getByRole("combobox", { name: "Top services time span" })).toHaveTextContent("Year");
    fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
    choose("Chart time span", "Year");
    const chart = within(screen.getByRole("region", { name: "Business performance" }));
    expect(chart.getByRole("button", { name: "Bookings" })).toHaveAttribute("aria-pressed", "true");
    expect(chart.getByText("Bookings created")).toBeInTheDocument();
    expect(chart.getByRole("img", { name: "Bookings trend over Last 12 months" })).toBeInTheDocument();
  });
  it("renders empty backend results without fabricated rows or invalid dimensions", () => {
    const props = dashboardProps();
    props.today.bookings = []; props.queueData.queue = []; props.analytics.expenses = [];
    for (const period of Object.values(props.analytics.periods)) { period.staff = []; period.topCustomers = []; period.topServices = []; period.revenue = period.labels.map(() => 0); }
    const { container } = render(<OwnerDashboardStudy {...props} />);
    expect(screen.getByText("No upcoming bookings today.")).toBeInTheDocument();
    expect(screen.getByText("No expenses logged this month.")).toBeInTheDocument();
    expect(screen.getByText("No completed staff work in this period.")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
  it("opens real booking controller and preserves mobile navigation", async () => {
    const props = dashboardProps(); props.onBooking = vi.fn();
    render(<OwnerDashboardStudy {...props} />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile workspace" })).getByRole("button", { name: "New booking" }));
    expect(props.onBooking).toHaveBeenCalledOnce();
    const toggle = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Services" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/services");
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(screen.getByRole("main", { name: "Dashboard overview" })).toHaveFocus());
  });
  it("shows illustrated, status-specific queue empty states without hiding populated rows", () => {
    const props = dashboardProps();
    const view = render(<OwnerDashboardStudy {...props} />);
    const queue = screen.getByRole("region", { name: "Live queue" });
    expect(queue.querySelector("[data-dashboard-empty]")).toBeNull();
    fireEvent.click(within(queue).getByRole("button", { name: "Done 0" }));
    expect(within(queue).getByRole("heading", { name: "No completed services yet." })).toBeInTheDocument();
    expect(queue.querySelector("[data-dashboard-empty] [aria-hidden=true] svg")).not.toBeNull();
    fireEvent.click(within(queue).getByRole("button", { name: "In progress 0" }));
    expect(within(queue).getByText("Claim a pending service to start your next treatment.")).toBeInTheDocument();
    fireEvent.click(within(queue).getByRole("button", { name: "Pending 1" }));
    expect(within(queue).getByRole("button", { name: "Claim" })).toBeInTheDocument();
    view.rerender(<OwnerDashboardStudy {...props} queueData={{ ...props.queueData, queue: [] }} />);
    expect(within(queue).getByRole("heading", { name: "Queue is clear." })).toBeInTheDocument();
  });
  it("uses matching empty illustrations for bookings and filtered insight cards", () => {
    const props = dashboardProps();
    props.today.bookings = [];
    for (const period of Object.values(props.analytics.periods)) { period.staff = []; period.topServices = []; period.topCustomers = []; }
    const view = render(<OwnerDashboardStudy {...props} />);
    for (const name of ["Today’s bookings 0", "Top services", "Staff performance", "Top customers"]) {
      const card = screen.getByRole("region", { name });
      expect(card.querySelector("[data-dashboard-empty] [aria-hidden=true] svg")).not.toBeNull();
      expect(within(card).getByRole("status")).toHaveTextContent(/No /);
    }
    expect(screen.queryByRole("table", { name: "Staff performance" })).not.toBeInTheDocument();
    view.rerender(<OwnerDashboardStudy {...dashboardProps()} />);
    expect(screen.getByRole("table", { name: "Staff performance" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Top customers" }).querySelector("[data-dashboard-empty]")).toBeNull();
  });
});
