import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerPreviewBookingQuickPanel } from "./OwnerPreviewBookingQuickPanel";

const catalog = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true, data: { services: [], packages: [], categories: [] } }));
beforeEach(() => catalog.mockReset().mockResolvedValue({ success: true, data: { services: [], packages: [], categories: [] } }));
vi.mock("@/features/bookings/actions/owner-booking-catalog", () => ({ getOwnerBookingCatalog: catalog }));
vi.mock("./OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => ({ userId: "owner", businessId: "business", businessSlug: "beautyfeel" }),
  useOwnerPreviewRevoke: () => vi.fn(),
}));
vi.mock("@/components/bookings/BookingForm", () => ({
  default: () => <input aria-label="Customer name" />,
}));

describe("owner booking panel draft retention", () => {
  it("keeps the form mounted until an ordinary close finishes animating", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const props = { businessSlug: "beautyfeel", bookingSession: 1, onOpenChange: vi.fn(), onOwnerSubmit: vi.fn() };
    const view = render(<QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel {...props} open /></QueryClientProvider>);
    const input = await screen.findByRole("textbox", { name: "Customer name" });
    view.rerender(<QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel {...props} open={false} /></QueryClientProvider>);
    expect(input.isConnected).toBe(true);
    await waitFor(() => expect(document.querySelector('[data-testid="catalog-editor-overlay"]')).not.toBeInTheDocument());
    expect(input.isConnected).toBe(false);
  });

  it("removes the closed modal while keeping the exact form instance for recovery", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpenChange = vi.fn();
    const props = { businessSlug: "beautyfeel", bookingSession: 1, onOpenChange, onOwnerSubmit: vi.fn(), preserveDraft: true };
    const view = render(<QueryClientProvider client={client}><button type="button">Outside action</button><OwnerPreviewBookingQuickPanel {...props} open /></QueryClientProvider>);
    const input = await screen.findByRole("textbox", { name: "Customer name" });
    fireEvent.change(input, { target: { value: "Mila Santos" } });
    view.rerender(<QueryClientProvider client={client}><button type="button">Outside action</button><OwnerPreviewBookingQuickPanel {...props} open={false} /></QueryClientProvider>);
    await waitFor(() => expect(document.querySelector('[data-testid="catalog-editor-overlay"]')).not.toBeInTheDocument());
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(input).toHaveValue("Mila Santos");
    view.rerender(<QueryClientProvider client={client}><button type="button">Outside action</button><OwnerPreviewBookingQuickPanel {...props} open /></QueryClientProvider>);
    expect(await screen.findByRole("textbox", { name: "Customer name" })).toBe(input);
    expect(input).toHaveValue("Mila Santos");
  });

  it("keeps form pointer interactions inside the dialog and allows outside dismissal", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpenChange = vi.fn();
    render(<QueryClientProvider client={client}><button type="button">Outside action</button><OwnerPreviewBookingQuickPanel businessSlug="beautyfeel" bookingSession={1} onOpenChange={onOpenChange} onOwnerSubmit={vi.fn()} open /></QueryClientProvider>);
    const input = await screen.findByRole("textbox", { name: "Customer name" });
    fireEvent.pointerDown(input);
    fireEvent.focusIn(input);
    expect(onOpenChange).not.toHaveBeenCalled();
    const calendarPortal = document.createElement("div");
    calendarPortal.dataset.ownerBookingCalendar = "";
    const calendarDay = document.createElement("button");
    calendarPortal.appendChild(calendarDay);
    document.body.appendChild(calendarPortal);
    fireEvent.pointerDown(calendarDay);
    expect(onOpenChange).not.toHaveBeenCalled();
    calendarPortal.remove();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("keeps the draft visible when a catalog refresh fails", async () => {
    catalog.mockResolvedValueOnce({ success: true, data: { services: [], packages: [], categories: [] } }).mockResolvedValueOnce({ success: false, denied: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPreviewBookingQuickPanel businessSlug="beautyfeel" bookingSession={1} onOpenChange={vi.fn()} onOwnerSubmit={vi.fn()} open /></QueryClientProvider>);
    const input = await screen.findByRole("textbox", { name: "Customer name" });
    fireEvent.change(input, { target: { value: "Mila Santos" } });
    await client.refetchQueries();
    expect(await screen.findByRole("alert")).toHaveTextContent("Your booking draft is still available");
    expect(screen.getByRole("textbox", { name: "Customer name" })).toBe(input);
    expect(input).toHaveValue("Mila Santos");
  });
});
