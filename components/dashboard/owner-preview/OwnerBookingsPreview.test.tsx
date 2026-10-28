import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerBookingList, OwnerBookingSummary } from "@/features/bookings/types/owner-bookings-preview";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), panel: vi.fn(), openBooking: vi.fn(), pending: false, recovery: false }));
vi.mock("@/components/dashboard/owner-preview/OwnerBookingController", () => ({ useOwnerBookingController: () => ({ openBooking: mocks.openBooking, pending: mocks.pending, recoveryAvailable: mocks.recovery }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/bookings/LazyBookingQuickPanel", () => ({ LazyBookingQuickPanel: (props: unknown) => { mocks.panel(props); return null; } }));
const identity: OwnerPreviewIdentity = { userId: "owner-a", businessId: "business-a", businessSlug: "beautyfeel", businessName: "BeautyFeel", ownerName: "Owner" };
vi.mock("./OwnerPreviewQueryProvider", () => ({ useOwnerPreviewContext: () => identity, useOwnerPreviewFetch: () => mocks.fetch }));
import { OwnerBookingsPreviewRoute } from "./OwnerBookingsPreview";

const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
const date = `${part("year")}-${part("month")}-${part("day")}`;
const summary: OwnerBookingSummary = { date, totalBookings: 1, acceptedCount: 0, holdCount: 1, amountReceived: 0, openBalance: 400, pendingGcashCount: 0, pendingGcash: null };
const list: OwnerBookingList = { totalCount: 1, page: 1, pageSize: 25, totalPages: 1, bookings: [{ id: 42, status: "HOLD", paymentStage: "AWAITING_PAYMENT", paymentStatus: "UNPAID", paymentMethod: "GCASH", customerName: "Actual Customer", scheduledAt: new Date(`${date}T10:00:00+08:00`).toISOString(), estimatedEnd: null, services: ["Lash lift"], providers: [], total: 400, paid: 0 }] };
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }); }
function seed(queryClient: QueryClient) {
  queryClient.setQueryData(ownerPreviewKeys.section(identity, "bookings", "summary", { date }), summary);
  queryClient.setQueryData(ownerPreviewKeys.section(identity, "bookings", "list", { date, status: "ALL", q: "", page: 1 }), list);
  queryClient.setQueryData(ownerPreviewKeys.section(identity, "bookings", "gcash-review"), { verificationItems: [], followUpItems: [] });
}

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.pending = false; mocks.recovery = false; });

describe("owner bookings preview", () => {
  it("opens the full owner booking panel for a selected register item", () => {
    const queryClient = client();
    seed(queryClient);
    render(<QueryClientProvider client={queryClient}><OwnerBookingsPreviewRoute /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "View booking 42" }));
    expect(mocks.panel).toHaveBeenLastCalledWith(expect.objectContaining({ bookingId: 42, open: true, viewerContext: expect.objectContaining({ role: "OWNER", canCancel: true }) }));
  });

  it("shows cached real booking state without a request, and refreshes only booking sections", async () => {
    const queryClient = client();
    seed(queryClient);
    mocks.fetch.mockImplementation((url: string) => Promise.resolve(url.includes("/gcash-review") ? { verificationItems: [], followUpItems: [] } : url.includes("/summary") ? summary : list));
    render(<QueryClientProvider client={queryClient}><OwnerBookingsPreviewRoute /></QueryClientProvider>);
    expect(screen.getByText("Actual Customer")).toBeInTheDocument();
    expect(screen.getByText("No submitted GCash payments await review.")).toBeInTheDocument();
    expect(screen.getByText("Awaiting payment · ₱400 remaining")).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "New booking unavailable" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh bookings" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
    expect(mocks.fetch.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([expect.stringContaining("/bookings/summary"), expect.stringContaining("/bookings/list")]));
  });

  it("keys a status filter independently and never substitutes a held booking for submitted payment review", async () => {
    const queryClient = client();
    seed(queryClient);
    mocks.fetch.mockResolvedValue({ ...list, totalCount: 0, bookings: [] });
    render(<QueryClientProvider client={queryClient}><OwnerBookingsPreviewRoute /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    expect(mocks.fetch.mock.calls[0][0]).toContain("status=ACCEPTED");
    expect(screen.getByText("No submitted GCash payments await review.")).toBeInTheDocument();
  });

  it("can switch the register to all dates without changing selected-day KPIs", async () => {
    const queryClient = client();
    seed(queryClient);
    mocks.fetch.mockResolvedValue(list);
    render(<QueryClientProvider client={queryClient}><OwnerBookingsPreviewRoute /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("checkbox", { name: "All dates" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    expect(mocks.fetch.mock.calls[0][0]).toContain("/bookings/list?");
    expect(mocks.fetch.mock.calls[0][0]).not.toContain("date=");
    expect(screen.getByText("Selected-day bookings")).toBeInTheDocument();
  });
});

describe("redesign bookings workspace", () => {
  function setup(queryClient = client()) {
    return { queryClient, ...render(<QueryClientProvider client={queryClient}><OwnerBookingsPreviewRoute redesign fontClassName="booking-font" /></QueryClientProvider>) };
  }

  it("opens the shared live editor with its own focus key and respects pending recovery", () => {
    const queryClient = client(); seed(queryClient);
    const view = setup(queryClient);
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    expect(mocks.openBooking).toHaveBeenCalledWith("redesign-bookings-new-booking");
    mocks.pending = true;
    view.rerender(<QueryClientProvider client={queryClient}><OwnerBookingsPreviewRoute redesign /></QueryClientProvider>);
    expect(screen.getByRole("button", { name: "Creating booking…" })).toBeDisabled();
    mocks.pending = false; mocks.recovery = true;
    view.rerender(<QueryClientProvider client={queryClient}><OwnerBookingsPreviewRoute redesign /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Resume booking" }));
    expect(mocks.openBooking).toHaveBeenCalledTimes(2);
  });

  it("loads the overview and register independently without hiding filters or the editor trigger", () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "bookings", "summary", { date }), summary);
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    setup(queryClient);
    expect(screen.getByRole("region", { name: "Booking overview" })).toBeInTheDocument();
    expect(screen.getByLabelText("Loading booking register")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "New booking" })).toBeEnabled();
    expect(screen.getByRole("group", { name: "Booking status" })).toBeInTheDocument();
  });

  it("retains the register while the independent overview is loading", () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "bookings", "list", { date, status: "ALL", q: "", page: 1 }), list);
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    setup(queryClient);
    expect(screen.getByText("Actual Customer")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading booking overview")).toHaveAttribute("aria-busy", "true");
  });

  it("uses server filters for status, all dates, search and date selection", async () => {
    const queryClient = client(); seed(queryClient);
    mocks.fetch.mockImplementation((url: string) => Promise.resolve(url.includes("/summary") ? summary : { ...list, bookings: [], totalCount: 0 }));
    setup(queryClient);
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("status=ACCEPTED"), expect.anything()));
    fireEvent.click(screen.getByRole("checkbox", { name: "All dates" }));
    await waitFor(() => expect(mocks.fetch.mock.calls.at(-1)?.[0]).not.toContain("date="));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search customer, service or ID" }), { target: { value: "Ada" } });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("q=Ada"), expect.anything()));
    fireEvent.change(screen.getByLabelText("Booking date"), { target: { value: "2026-10-12" } });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("/summary?date=2026-10-12"), expect.anything()));
    expect(screen.getByText("No bookings match this filter.")).toBeInTheDocument();
  });

  it("retries a failed payment-review request independently", async () => {
    const queryClient = client(); seed(queryClient);
    queryClient.removeQueries({ queryKey: ownerPreviewKeys.section(identity, "bookings", "gcash-review") });
    mocks.fetch.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({ verificationItems: [], followUpItems: [] });
    setup(queryClient);
    fireEvent.click(await screen.findByRole("button", { name: "Retry payment review" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(mocks.fetch.mock.calls.every(([url]) => url.endsWith("/gcash-review"))).toBe(true);
    expect(screen.getByText("Actual Customer")).toBeInTheDocument();
  });

  it("passes verified slug and theme to detail actions and invalidates redesign only on confirmation", () => {
    const queryClient = client(); seed(queryClient);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    setup(queryClient);
    const opener = screen.getByRole("button", { name: "View booking 42" });
    opener.focus();
    fireEvent.click(opener);
    expect(invalidate).not.toHaveBeenCalled();
    const props = mocks.panel.mock.lastCall![0];
    expect(props).toEqual(expect.objectContaining({ bookingId: 42, businessSlug: "beautyfeel", themeClassName: expect.stringContaining("booking-font") }));
    opener.blur();
    props.restoreFocus();
    expect(opener).toHaveFocus();
    props.onBookingChanged();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "redesign") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.page(identity, "bookings") });
  });
});
