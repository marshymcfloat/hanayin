import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), revoke: vi.fn() }));
const identity: OwnerPreviewIdentity = { userId: "owner-a", businessId: "business-a", businessSlug: "beautyfeel", businessName: "BeautyFeel", ownerName: "Owner" };

vi.mock("@/features/bookings/actions/owner-booking-catalog", () => ({ getOwnerBookingCatalog: mocks.catalog }));
vi.mock("./OwnerPreviewQueryProvider", () => ({ useOwnerPreviewContext: () => identity, useOwnerPreviewRevoke: () => mocks.revoke }));
vi.mock("./CatalogEditorOverlay", () => ({
  CatalogEditorOverlay: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div role="dialog">{children}</div> : null,
  CatalogEditorBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/bookings/BookingForm", () => ({
  default: ({ onSuccess, catalogPending, businessSlug, bookingDesign }: { onSuccess: () => void; catalogPending: boolean; businessSlug: string; bookingDesign: string }) => <><input aria-label="Booking draft" /><output data-testid="form-routing">{businessSlug}:{bookingDesign}</output><output data-testid="catalog-state">{catalogPending ? "pending" : "ready"}</output><button type="button" disabled={catalogPending} onClick={onSuccess}>Complete booking</button></>,
}));

import { OwnerPreviewBookingQuickPanel } from "./OwnerPreviewBookingQuickPanel";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.catalog.mockResolvedValue({ success: true, data: { services: [], packages: [], categories: [] } });
});

describe("owner quick booking panel", () => {
  it("passes verified tenant routing into the redesign even outside a slug route", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel businessSlug="beautyfeel" bookingDesign="redesign" open onOpenChange={vi.fn()} bookingSession={1} /></QueryClientProvider>);
    expect(await screen.findByTestId("form-routing")).toHaveTextContent("beautyfeel:redesign");
  });
  it("mounts the form before a cold catalog resolves without replacing its draft", async () => {
    let resolveCatalog!: (value: { success: true; data: { services: []; packages: []; categories: [] } }) => void;
    mocks.catalog.mockReturnValue(new Promise((resolve) => { resolveCatalog = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel businessSlug="beautyfeel" open onOpenChange={vi.fn()} bookingSession={1} /></QueryClientProvider>);
    const draft = await screen.findByRole("textbox", { name: "Booking draft" });
    expect(screen.getByTestId("catalog-state")).toHaveTextContent("pending");
    expect(screen.getByRole("button", { name: "Complete booking" })).toBeDisabled();
    fireEvent.change(draft, { target: { value: "Mila" } });
    await act(async () => resolveCatalog({ success: true, data: { services: [], packages: [], categories: [] } }));
    await waitFor(() => expect(screen.getByTestId("catalog-state")).toHaveTextContent("ready"));
    expect(screen.getByRole("textbox", { name: "Booking draft" })).toBe(draft);
    expect(draft).toHaveValue("Mila");
  });

  it("uses a fresh cached catalog immediately without another request", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(ownerPreviewKeys.section(identity, "bookings", "create-catalog"), { services: [], packages: [], categories: [] });
    render(<QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel businessSlug="beautyfeel" open onOpenChange={vi.fn()} bookingSession={1} /></QueryClientProvider>);
    await screen.findByRole("textbox", { name: "Booking draft" });
    expect(screen.getByTestId("catalog-state")).toHaveTextContent("ready");
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it("reuses the fetched catalog across repeated fresh closes and reopens", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const props = { businessSlug: "beautyfeel", onOpenChange: vi.fn() };
    const tree = (open: boolean, bookingSession: number) => <QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel {...props} open={open} bookingSession={bookingSession} /></QueryClientProvider>;
    const view = render(tree(true, 1));
    await waitFor(() => expect(screen.getByTestId("catalog-state")).toHaveTextContent("ready"));
    expect(mocks.catalog).toHaveBeenCalledOnce();
    for (const bookingSession of [2, 3]) {
      view.rerender(tree(false, bookingSession - 1));
      view.rerender(tree(true, bookingSession));
      expect(screen.getByTestId("catalog-state")).toHaveTextContent("ready");
      expect(screen.getByRole("button", { name: "Complete booking" })).toBeEnabled();
      await act(async () => { await Promise.resolve(); });
      expect(mocks.catalog).toHaveBeenCalledOnce();
    }
  });

  it("keeps a stale catalog and draft visible during a failed background refresh", async () => {
    let resolveCatalog!: (value: { success: false; denied: false }) => void;
    mocks.catalog.mockReturnValue(new Promise((resolve) => { resolveCatalog = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(ownerPreviewKeys.section(identity, "bookings", "create-catalog"), { services: [], packages: [], categories: [] }, { updatedAt: Date.now() - 180_000 });
    render(<QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel businessSlug="beautyfeel" open onOpenChange={vi.fn()} bookingSession={1} /></QueryClientProvider>);
    const draft = await screen.findByRole("textbox", { name: "Booking draft" });
    fireEvent.change(draft, { target: { value: "Mila" } });
    expect(screen.getByTestId("catalog-state")).toHaveTextContent("ready");
    await act(async () => resolveCatalog({ success: false, denied: false }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your booking draft is still available");
    expect(screen.getByRole("textbox", { name: "Booking draft" })).toBe(draft);
    expect(draft).toHaveValue("Mila");
    expect(screen.getByTestId("catalog-state")).toHaveTextContent("ready");
  });

  it("loads on opening and invalidates only after confirmed creation", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue(undefined);
    const props = { businessSlug: "beautyfeel", onOpenChange: vi.fn(), bookingSession: 1 };
    const view = render(<QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel {...props} open={false} /></QueryClientProvider>);
    expect(mocks.catalog).not.toHaveBeenCalled();
    view.rerender(<QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel {...props} open /></QueryClientProvider>);
    const complete = await screen.findByRole("button", { name: "Complete booking" });
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(complete);
    expect(mocks.catalog).toHaveBeenCalledOnce();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.page(identity, "bookings") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "queue") });
  });

  it("offers retry when catalog loading fails", async () => {
    mocks.catalog.mockResolvedValueOnce({ success: false, denied: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel businessSlug="beautyfeel" open onOpenChange={vi.fn()} bookingSession={1} /></QueryClientProvider>);
    const retry = await screen.findByRole("button", { name: "Try again" });
    const draft = await screen.findByRole("textbox", { name: "Booking draft" });
    fireEvent.change(draft, { target: { value: "Mila" } });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole("button", { name: "Complete booking" })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: "Booking draft" })).toBe(draft);
    expect(draft).toHaveValue("Mila");
    expect(mocks.catalog).toHaveBeenCalledTimes(2);
  });

  it("revokes owner state after an access denial", async () => {
    mocks.catalog.mockResolvedValue({ success: false, denied: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel businessSlug="beautyfeel" open onOpenChange={vi.fn()} bookingSession={1} /></QueryClientProvider>);
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledOnce());
  });
});
