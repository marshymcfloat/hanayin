import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnerPreviewLayoutShell } from "./OwnerPreviewLayoutShell";
import { OwnerWorkspaceBaseProvider } from "./owner-preview-routing";

const mockPathname = vi.hoisted(() => ({ value: "" }));
const mockGetPreviewDestination = vi.hoisted(() => vi.fn(() => "dashboard"));
const queryClient = new QueryClient();

function renderShell(ui: ReactElement) {
  return render(ui, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
}

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.value,
}));
vi.mock("./OwnerDashboardPreview", () => ({
  PreviewDesktopRail: () => <nav aria-label="Desktop owner navigation" />,
  PreviewMobileNavigation: ({ onNewBooking }: { onNewBooking: () => void }) => <nav aria-label="Mobile owner navigation"><button type="button" onClick={onNewBooking}>Mobile new booking</button></nav>,
  getPreviewDestination: mockGetPreviewDestination,
}));
vi.mock("./OwnerPreviewBookingQuickPanel", () => ({
  OwnerPreviewBookingQuickPanel: ({ open, bookingSession, onOpenChange }: { open: boolean; bookingSession: number; onOpenChange: (open: boolean) => void }) => open ? <div role="dialog">Booking session {bookingSession}<button type="button" onClick={() => onOpenChange(false)}>Close booking</button></div> : null,
}));
vi.mock("./OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => ({ userId: "owner", businessId: "business", businessSlug: "beautyfeel" }),
}));

afterEach(cleanup);

describe("OwnerPreviewLayoutShell", () => {
  it.each(["", "/services", "/packages", "/vouchers", "/gift-cards", "/sale-events", "/social-posts", "/growth", "/reports", "/business-hours", "/billing", "/employees", "/owners", "/attendance", "/payroll", "/customers", "/bookings", "/notifications"])(
    "keeps the navigation shell without a sample notice on %s",
    (routePath) => {
      mockPathname.value = `/owner-dashboard-preview/beautyfeel${routePath}`;

      renderShell(
        <OwnerPreviewLayoutShell businessSlug="beautyfeel">
          <main>Live page content</main>
        </OwnerPreviewLayoutShell>,
      );

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByText("Live page content")).toBeInTheDocument();
    },
  );

  it("resolves the active section from the canonical app path", () => {
    mockPathname.value = "/app/beautyfeel/bookings";

    renderShell(
      <OwnerWorkspaceBaseProvider basePath="/app">
        <OwnerPreviewLayoutShell businessSlug="beautyfeel">
          <main>Live bookings</main>
        </OwnerPreviewLayoutShell>
      </OwnerWorkspaceBaseProvider>,
    );

    expect(mockGetPreviewDestination).toHaveBeenLastCalledWith("/bookings");
    expect(screen.getByText("Live bookings")).toBeInTheDocument();
  });

  it("keeps the customer inbox inside the new shell without legacy padding", () => {
    mockPathname.value = "/app/beautyfeel/inbox";
    renderShell(
      <OwnerWorkspaceBaseProvider basePath="/app">
        <OwnerPreviewLayoutShell businessSlug="beautyfeel"><main>Customer inbox content</main></OwnerPreviewLayoutShell>
      </OwnerWorkspaceBaseProvider>,
    );
    expect(mockGetPreviewDestination).toHaveBeenLastCalledWith("/inbox");
    expect(screen.getByText("Customer inbox content").parentElement).not.toHaveClass("md:pl-[128px]");
  });

  it("shares one panel between triggers and keeps it closed after leaving and returning", async () => {
    mockPathname.value = "/app/beautyfeel";
    const content = <main>Live page content</main>;
    const view = renderShell(<OwnerPreviewLayoutShell businessSlug="beautyfeel">{content}</OwnerPreviewLayoutShell>);

    fireEvent.click(screen.getByRole("button", { name: "Mobile new booking" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Booking session 1");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Close booking" }));
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Booking session 2");

    mockPathname.value = "/app/beautyfeel/customers";
    view.rerender(<OwnerPreviewLayoutShell businessSlug="beautyfeel">{content}</OwnerPreviewLayoutShell>);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    mockPathname.value = "/app/beautyfeel";
    view.rerender(<OwnerPreviewLayoutShell businessSlug="beautyfeel">{content}</OwnerPreviewLayoutShell>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
