import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerNotificationsPreviewRoute } from "./OwnerNotificationsPreview";

const previewFetch = vi.hoisted(() => vi.fn());
vi.mock("./OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => ({
    userId: "owner-a", businessId: "business-a", businessSlug: "studio-luna", businessName: "Studio Luna", ownerName: "Avery",
  }),
  useOwnerPreviewFetch: () => previewFetch,
}));

const history = {
  notifications: [{
    id: "event-1", eventType: "BOOKING_CONFIRMED", subject: "Booking confirmation",
    customerName: "Bianca Cruz", customerEmail: null, customerPhone: null,
    sentAt: "2026-09-16T02:12:00.000Z", success: true, failureReason: null,
    smsSent: null, emailSent: null,
  }],
  totalCount: 1, page: 1, pageSize: 50, totalPages: 1,
};

function mount(client: QueryClient, redesign = false) {
  return render(<QueryClientProvider client={client}><OwnerNotificationsPreviewRoute redesign={redesign} /></QueryClientProvider>);
}

beforeEach(() => { vi.clearAllMocks(); previewFetch.mockResolvedValue(history); });
afterEach(cleanup);

describe.each([false, true])("live Notifications preview cache and refresh (redesign=%s)", (redesign) => {
  it("loads tenant-scoped history, retains warm data on refresh error, and retries", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount(client, redesign);
    expect(await screen.findByText("Bianca Cruz")).toBeInTheDocument();
    expect(previewFetch).toHaveBeenCalledWith(
      "/api/owner-dashboard-preview/studio-luna/notifications?page=1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    previewFetch.mockRejectedValueOnce(new Error("network unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh notifications" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Refresh failed; showing saved data"));
    expect(screen.getByText("Bianca Cruz")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh notifications" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(previewFetch).toHaveBeenCalledTimes(3);
  });

  it("reuses fresh in-memory history on remount", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = mount(client, redesign);
    expect(await screen.findByText("Bianca Cruz")).toBeInTheDocument();
    first.unmount();
    mount(client, redesign);
    expect(screen.getByText("Bianca Cruz")).toBeInTheDocument();
    expect(previewFetch).toHaveBeenCalledTimes(1);
  });

  it("loads each page under a separate cache key", async () => {
    previewFetch.mockImplementation(async (url: string) => url.endsWith("page=2")
      ? { ...history, page: 2, totalCount: 51, totalPages: 2, notifications: [{ ...history.notifications[0], id: "event-2", customerName: "Nicole Garcia" }] }
      : { ...history, totalCount: 51, totalPages: 2 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount(client, redesign);
    expect(await screen.findByText("Bianca Cruz")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Nicole Garcia")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Bianca Cruz")).toBeInTheDocument();
    expect(previewFetch).toHaveBeenCalledTimes(2);
  });
});

describe("Notifications redesign cold reads", () => {
  it("shows a stable shell while data is unknown, then a retryable cold error", async () => {
    let reject!: (reason: Error) => void;
    previewFetch.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount(client, true);
    expect(screen.getByRole("heading", { name: "Notifications", level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText("Loading notifications")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("No notifications on this page")).not.toBeInTheDocument();
    reject(new Error("network"));
    expect(await screen.findByText(/Notification history is unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh notifications" }));
    expect(await screen.findByText("Bianca Cruz")).toBeInTheDocument();
  });
});
