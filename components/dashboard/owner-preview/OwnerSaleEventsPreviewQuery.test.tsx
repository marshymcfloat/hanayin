import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
const identity: OwnerPreviewIdentity = {
  userId: "owner-1", businessId: "business-1", businessSlug: "beautyfeel", businessName: "BeautyFeel", ownerName: "Owner",
};

vi.mock("./OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => identity,
  useOwnerPreviewFetch: () => mocks.fetch,
}));
vi.mock("./OwnerSaleEventsPreview", () => ({
  OwnerSaleEventsPreview: ({ result }: { result: { success: boolean; data?: { events: Array<{ title: string }> } } }) => (
    <main><h1>Sale events</h1>{result.success ? <p>{result.data?.events[0]?.title ?? "No events"}</p> : <p>Unavailable</p>}</main>
  ),
}));
vi.mock("./OwnerCatalogPreviewSkeleton", () => ({ OwnerCatalogPreviewSkeleton: ({ label }: { label: string }) => <main aria-label={`Loading ${label}`} /> }));

import { invalidateAfterSaleEventMutation, OwnerSaleEventsPreviewQuery } from "./OwnerSaleEventsPreviewQuery";

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 15 * 60 * 1000 } } });
}

function view(queryClient: QueryClient, redesign = false) {
  return render(<QueryClientProvider client={queryClient}><OwnerSaleEventsPreviewQuery redesign={redesign} /></QueryClientProvider>);
}

describe("sale events preview cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the redesign skeleton and provides a local retry after a cold failure", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("offline"));
    const queryClient = client();
    view(queryClient, true);
    expect(screen.getByLabelText("Loading sale events")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    mocks.fetch.mockResolvedValueOnce({ section: "sale-events", events: [{ title: "Recovered offer" }] });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Recovered offer")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading sale events")).not.toBeInTheDocument();
  });

  it("retains redesign content on a failed background refresh", async () => {
    const queryClient = client();
    const key = ownerPreviewKeys.section(identity, "sale-events", "page");
    queryClient.setQueryData(key, { section: "sale-events", events: [{ title: "Saved offer" }] });
    mocks.fetch.mockRejectedValue(new Error("offline"));
    view(queryClient, true);
    await queryClient.refetchQueries({ queryKey: key, exact: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh failed");
    expect(screen.getByText("Saved offer")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading sale events")).not.toBeInTheDocument();
  });

  it("shows a cold skeleton and a fresh warm result without another request", async () => {
    mocks.fetch.mockResolvedValue({ section: "sale-events", events: [{ title: "Autumn offer" }] });
    const queryClient = client();
    const first = view(queryClient);
    expect(screen.getByLabelText("Loading sale events preview")).toBeInTheDocument();
    expect(await screen.findByText("Autumn offer")).toBeInTheDocument();
    first.unmount();
    view(queryClient);
    expect(screen.queryByLabelText("Loading sale events preview")).not.toBeInTheDocument();
    expect(screen.getByText("Autumn offer")).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps stale content visible when a manual refresh fails", async () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "sale-events", "page"), { section: "sale-events", events: [{ title: "Autumn offer" }] });
    mocks.fetch.mockRejectedValue(new Error("offline"));
    view(queryClient);
    fireEvent.click(screen.getByRole("button", { name: "Refresh sale events" }));
    expect(screen.getByText("Autumn offer")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Refresh failed; showing saved data/)).toBeInTheDocument());
    expect(screen.queryByLabelText("Loading sale events preview")).not.toBeInTheDocument();
  });

  it("invalidates dependent pages for this owner", () => {
    const queryClient = client();
    for (const page of ["sale-events", "social-posts", "dashboard", "growth", "reports", "bookings", "billing"]) {
      queryClient.setQueryData(ownerPreviewKeys.section(identity, page, "page"), { page });
    }
    invalidateAfterSaleEventMutation(queryClient, identity);
    for (const page of ["sale-events", "social-posts", "dashboard", "growth", "reports", "bookings"]) {
      expect(queryClient.getQueryState(ownerPreviewKeys.section(identity, page, "page"))?.isInvalidated).toBe(true);
    }
    expect(queryClient.getQueryState(ownerPreviewKeys.section(identity, "billing", "page"))?.isInvalidated).toBe(false);
  });
});
