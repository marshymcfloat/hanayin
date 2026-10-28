import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotificationsPage from "./notifications/page";

vi.mock("@/components/dashboard/owner-preview/OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => ({
    userId: "owner-a",
    businessId: "business-a",
    businessSlug: "studio-luna",
    businessName: "Studio Luna",
    ownerName: "Avery",
  }),
  useOwnerPreviewFetch: () => async () => ({
    notifications: [],
    totalCount: 0,
    page: 1,
    pageSize: 50,
    totalPages: 0,
  }),
}));

afterEach(cleanup);

describe("owner-preview live route", () => {
  it("Notifications loads with verified layout identity", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><NotificationsPage /></QueryClientProvider>);

    expect(await screen.findByRole("heading", { level: 1, name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText(/Studio Luna ·/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/owner-dashboard-preview/studio-luna",
    );
  });
});
