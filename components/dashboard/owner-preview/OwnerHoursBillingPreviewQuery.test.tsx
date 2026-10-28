import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn() }));
const identity: OwnerPreviewIdentity = { userId: "owner-a", businessId: "business-a", businessSlug: "beautyfeel", businessName: "BeautyFeel", ownerName: "Owner" };
vi.mock("./OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => identity,
  useOwnerPreviewFetch: () => mocks.fetch,
}));
vi.mock("@/features/businesses/actions/business-hours", () => ({ updateBusinessHours: mocks.update }));

import { OwnerBillingPreviewQuery } from "./OwnerBillingPreviewQuery";
import { OwnerBusinessHoursPreviewQuery } from "./OwnerBusinessHoursPreviewQuery";

function client() { return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 15 * 60 * 1000 } } }); }
const hours = { businessName: "BeautyFeel", hours: [], serviceCategories: [] };
const billing = { businessName: "BeautyFeel", subscription: null, availableUpgradePlanNames: [], invoices: [], upgradeRequests: [] };

describe("owner hours and billing preview cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a warm hours return immediately with no redundant GET", () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "business-hours", "page"), hours);
    render(<QueryClientProvider client={queryClient}><OwnerBusinessHoursPreviewQuery /></QueryClientProvider>);
    expect(screen.getByRole("heading", { name: "Business hours" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading business hours preview")).not.toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("keeps warm billing data visible while a manual refresh fails", async () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "billing", "page"), billing);
    mocks.fetch.mockRejectedValue(new Error("offline"));
    render(<QueryClientProvider client={queryClient}><OwnerBillingPreviewQuery /></QueryClientProvider>);
    expect(screen.getByRole("heading", { name: "No subscription record" })).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh billing" }));
    expect(screen.getByRole("heading", { name: "No subscription record" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Refresh failed; showing saved data/)).toBeInTheDocument());
  });

  it("refetches only hours after a successful save", async () => {
    const queryClient = client();
    const hoursKey = ownerPreviewKeys.section(identity, "business-hours", "page");
    const dashboardKey = ownerPreviewKeys.section(identity, "dashboard", "performance");
    const initial = { ...hours, serviceCategories: ["Skin"], hours: [{ day_of_week: 1, category: "Skin", open_time: "09:00", close_time: "17:00", is_closed: false }] };
    queryClient.setQueryData(hoursKey, initial);
    queryClient.setQueryData(dashboardKey, { kpis: { revenue: 1 } });
    mocks.update.mockResolvedValue({ success: true });
    mocks.fetch.mockResolvedValue({ ...initial, hours: [{ ...initial.hours[0], open_time: "11:00" }] });
    render(<QueryClientProvider client={queryClient}><OwnerBusinessHoursPreviewQuery /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Monday opening time"), { target: { value: "11:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save business hours" }));
    await waitFor(() => expect(screen.getByText("Business hours saved.")).toBeInTheDocument());
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe("/api/owner-dashboard-preview/beautyfeel/business-hours");
    expect(queryClient.getQueryState(dashboardKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(hoursKey)).toMatchObject({ hours: [{ open_time: "11:00" }] });
  });

  it("keeps the hours draft when the post-save GET fails", async () => {
    const queryClient = client();
    const initial = { ...hours, serviceCategories: ["Skin"], hours: [{ day_of_week: 1, category: "Skin", open_time: "09:00", close_time: "17:00", is_closed: false }] };
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "business-hours", "page"), initial);
    mocks.update.mockResolvedValue({ success: true });
    mocks.fetch.mockRejectedValue(new Error("offline"));
    render(<QueryClientProvider client={queryClient}><OwnerBusinessHoursPreviewQuery /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Monday opening time"), { target: { value: "11:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save business hours" }));
    await waitFor(() => expect(screen.getByText(/could not be reloaded/)).toBeInTheDocument());
    expect(screen.getByLabelText("Monday opening time")).toHaveValue("11:00");
  });
});
