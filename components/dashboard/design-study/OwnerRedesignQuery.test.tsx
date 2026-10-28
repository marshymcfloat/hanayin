import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OwnerRedesignQuery from "@/components/dashboard/design-study/OwnerRedesignQuery";
import type { OwnerDashboardStudyProps } from "@/components/dashboard/design-study/OwnerDashboardStudy";
import { dashboardProps } from "@/components/dashboard/design-study/owner-redesign.test-fixtures";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), claim: vi.fn(), expense: vi.fn(), booking: vi.fn(), signOut: vi.fn(), render: vi.fn(), props: null as OwnerDashboardStudyProps | null }));
vi.mock("next-auth/react", () => ({ signOut: mocks.signOut }));
const identity = { userId: "u1", businessId: "b1", businessSlug: "test-studio", businessName: "Test Studio", ownerName: "Owner" };
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewQueryProvider", () => ({ useOwnerPreviewContext: () => identity, useOwnerPreviewFetch: () => mocks.fetch }));
vi.mock("@/components/dashboard/owner-preview/OwnerBookingController", () => ({ useOwnerBookingController: () => ({ openBooking: mocks.booking }) }));
vi.mock("@/features/dashboard/actions/owner", () => ({ claimServiceAsOwnerAction: mocks.claim, unclaimServiceAsOwnerAction: mocks.claim, markServiceServedAsOwnerAction: mocks.claim, unserveServiceAsOwnerAction: mocks.claim }));
vi.mock("@/features/payroll/actions/expenses", () => ({ createExpense: mocks.expense }));
vi.mock("@/components/dashboard/design-study/OwnerDashboardStudy", () => ({ default: (props: OwnerDashboardStudyProps) => { mocks.render(); mocks.props = props; return <div>{props.business?.name}{props.refreshControl}<button onClick={() => props.onBooking()}>Book</button></div>; } }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><OwnerRedesignQuery fontClassName="font" /></QueryClientProvider>);
  return { client, ...view };
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.props = null;
  const fixture = dashboardProps();
  mocks.fetch.mockImplementation(async (url: string) => ({ redesign: fixture.analytics, today: fixture.today, queue: fixture.queueData, growth: { growth: fixture.growth } })[url.split("/").at(-1)! as "redesign"]);
  mocks.claim.mockResolvedValue({ success: true }); mocks.expense.mockResolvedValue({ success: true });
});
describe("live redesign adapter", () => {
  it("publishes fast sections without waiting for analytics or queue counts", async () => {
    const fixture = dashboardProps();
    let resolveAnalytics!: (value: unknown) => void;
    let resolveQueue!: (value: unknown) => void;
    mocks.fetch.mockImplementation((url: string) => {
      if (url.endsWith("/redesign")) return new Promise(resolve => { resolveAnalytics = resolve; });
      if (url.endsWith("/queue")) return new Promise(resolve => { resolveQueue = resolve; });
      return Promise.resolve(url.endsWith("/today") ? fixture.today : { growth: fixture.growth });
    });
    const view = mount();
    expect(screen.getByText("Test Studio")).toBeInTheDocument();
    await waitFor(() => expect(mocks.props!.today).toEqual(fixture.today));
    expect(mocks.props!.growth).toEqual(fixture.growth);
    expect(mocks.props!.analytics).toBeUndefined();
    expect(mocks.props!.queueData).toBeUndefined();
    await act(async () => resolveQueue(fixture.queueData));
    await waitFor(() => expect(mocks.props!.queueData).toEqual(fixture.queueData));
    expect(mocks.props!.analytics).toBeUndefined();
    await act(async () => resolveAnalytics(fixture.analytics));
    await waitFor(() => expect(mocks.props!.analytics).toEqual(fixture.analytics));
    view.unmount(); view.client.clear();
  });
  it("isolates background fetch status and timestamp-only queue responses from dashboard renders", async () => {
    const view = mount();
    await screen.findByText("Test Studio");
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh data" })).toBeEnabled());
    const queueKey = ownerPreviewKeys.section(identity, "dashboard", "queue");
    await waitFor(() => expect(mocks.props!.queueData).toBeDefined());
    const previous = mocks.props!.queueData!;
    const renders = mocks.render.mock.calls.length;
    let resolve!: (value: unknown) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    let refreshing!: Promise<void>;
    act(() => { refreshing = view.client.refetchQueries({ queryKey: queueKey, exact: true }); });
    expect(await screen.findByRole("button", { name: "Refreshing…" })).toBeDisabled();
    expect(mocks.render).toHaveBeenCalledTimes(renders);
    await act(async () => {
      resolve({ generatedAt: "2026-10-08T04:01:00Z", queue: structuredClone(previous.queue) });
      await refreshing;
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh data" })).toBeEnabled());
    expect(mocks.render).toHaveBeenCalledTimes(renders);
    expect(mocks.props!.queueData).toBe(previous);
    expect(view.client.getQueryData(queueKey)).toMatchObject({ generatedAt: "2026-10-08T04:01:00Z" });
    act(() => { view.client.setQueryData(queueKey, { generatedAt: "2026-10-08T04:02:00Z", queue: previous.queue.map(item => ({ ...item, status: "IN_PROGRESS" })) }); });
    await waitFor(() => expect(mocks.props!.queueData!.queue[0].status).toBe("IN_PROGRESS"));
    expect(mocks.render.mock.calls.length).toBeGreaterThan(renders);
    view.unmount(); view.client.clear();
  });
  it("loads authenticated sections without fixture fallback and opens the booking controller", async () => {
    const view = mount();
    expect(screen.getByText("Test Studio")).toBeInTheDocument();
    expect(await screen.findByText("Test Studio")).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    for (const section of ["redesign", "today", "queue", "growth"]) expect(mocks.fetch).toHaveBeenCalledWith(`/api/owner-dashboard-preview/test-studio/dashboard/${section}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    fireEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(mocks.booking).toHaveBeenCalledWith("redesign-new-booking");
    mocks.props!.onBooking("redesign-mobile-new-booking");
    expect(mocks.booking).toHaveBeenLastCalledWith("redesign-mobile-new-booking");
    expect(mocks.props!.ownerName).toBe(identity.ownerName);
    await mocks.props!.onSignOut!();
    expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    view.unmount(); view.client.clear();
  });
  it("shows a retry state instead of invented data on initial failure", async () => {
    mocks.fetch.mockRejectedValue(new Error("unavailable"));
    const view = mount();
    await waitFor(() => expect(mocks.props!.analyticsError).toBe(true));
    expect(mocks.props!.analytics).toBeUndefined();
    expect(mocks.props!.todayError).toBe(true);
    expect(screen.getByText("Test Studio")).toBeInTheDocument();
    view.unmount(); view.client.clear();
  });
  it("locks concurrent writes and refreshes only after confirmed success", async () => {
    let resolve!: (result: { success: boolean }) => void;
    mocks.claim.mockReturnValue(new Promise(done => { resolve = done; }));
    const view = mount(); await screen.findByText("Test Studio");
    const invalidate = vi.spyOn(view.client, "invalidateQueries");
    let saving!: ReturnType<OwnerDashboardStudyProps["onQueueAction"]>;
    await act(async () => { saving = mocks.props!.onQueueAction(42, "claim"); });
    expect(mocks.props!.pending).toBe(true);
    expect(await mocks.props!.onQueueAction(43, "claim")).toEqual({ success: false, error: "Another change is still saving." });
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => { resolve({ success: true }); await saving; });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.business(identity) });
    expect(mocks.props!.pending).toBe(false);
    view.unmount(); view.client.clear();
  });
  it("uses the verified slug for expenses and preserves rejected outcomes", async () => {
    mocks.expense.mockResolvedValue({ success: false, error: "Read-only account" });
    const view = mount(); await screen.findByText("Test Studio");
    const invalidate = vi.spyOn(view.client, "invalidateQueries");
    const draft = { amount: 42.50, category: "SUPPLIES" as const, date: new Date("2026-10-08T04:00:00Z") };
    await act(async () => { expect(await mocks.props!.onExpense(draft)).toEqual({ success: false, error: "Read-only account" }); });
    expect(mocks.expense).toHaveBeenCalledWith({ ...draft, businessSlug: "test-studio" });
    expect(invalidate).not.toHaveBeenCalled();
    view.unmount(); view.client.clear();
  });
  it("retains confirmed data when a background refresh fails", async () => {
    const view = mount(); await screen.findByText("Test Studio");
    mocks.fetch.mockRejectedValue(new Error("offline"));
    act(() => mocks.props!.onRefresh());
    await waitFor(() => expect(mocks.props!.refreshError).toBe(true));
    expect(screen.getByText("Test Studio")).toBeInTheDocument();
    view.unmount(); view.client.clear();
  });
});
