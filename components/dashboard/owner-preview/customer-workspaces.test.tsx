import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OwnerPreviewCustomer, OwnerPreviewCustomerDirectory } from "@/features/customers/types/owner-preview";
import type { NotificationHistoryResponse } from "@/features/notifications/types";
import { OwnerCustomersPreview } from "./OwnerCustomersPreview";
import { OwnerNotificationsPreview } from "./OwnerNotificationsPreview";

vi.mock("./OwnerDashboardPreview", () => ({ PreviewDesktopRail: () => null, PreviewMobileNavigation: () => null }));
const customerFetch = vi.hoisted(() => vi.fn());
vi.mock("./OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => ({ userId: "owner-a", businessId: "business-a", businessSlug: "studio-luna", businessName: "Studio Luna", ownerName: "Avery" }),
  useOwnerPreviewFetch: () => customerFetch,
}));
afterEach(cleanup);
const props = { businessSlug: "studio-luna", businessName: "Studio Luna" };
const customerData: OwnerPreviewCustomerDirectory = {
  businessName: "Studio Luna", page: 1, pageSize: 25, filteredCount: 2,
  totals: { customers: 2, newCustomers: 1, returningCustomers: 1, completedVisits: 2 },
  customers: [
    { id: "bianca", name: "Bianca Cruz", phone: "0917 624 8103", email: "bianca@example.com", joinedAt: "2026-06-12T00:00:00.000Z", completedVisits: 2, lastVisitAt: "2026-09-02T00:00:00.000Z" },
    { id: "sophia", name: "Sophia Ramos", phone: "0995 271 4682", email: "sophia.ramos@example.com", joinedAt: "2026-09-10T00:00:00.000Z", completedVisits: 0, lastVisitAt: null },
  ],
};
function renderCustomers(overrides: { query?: string; customers?: OwnerPreviewCustomer[] } = {}) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OwnerCustomersPreview businessSlug="studio-luna" data={customerData} customers={overrides.customers ?? [...customerData.customers]} query={overrides.query ?? ""} segment="All customers" isFetching={false} refreshControl={null} onQueryChange={() => {}} onSegmentChange={() => {}} onPageChange={() => {}} onAdd={() => {}} /></QueryClientProvider>);
}

describe("Customers preview", () => {
  it("shows live contacts and search input", () => {
    renderCustomers();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "09176248103" } });
    expect(screen.getByRole("status")).toHaveTextContent("2 matching customers");
    expect(screen.getByRole("button", { name: "View profile for Bianca Cruz" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View profile for Nicole Garcia" })).not.toBeInTheDocument();
  });

  it("shows a recoverable empty result", () => {
    renderCustomers({ customers: [] });
    expect(screen.getByText("No matching customers")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  });

  it("opens lazy read-only customer history and handles customers without visits", async () => {
    customerFetch.mockResolvedValue({ customerId: "sophia", services: [], hasMore: false });
    renderCustomers();
    fireEvent.click(screen.getByRole("button", { name: "View profile for Sophia Ramos" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("No completed services yet.")).toBeInTheDocument();
    expect(within(dialog).getByText("sophia.ramos@example.com")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /save|delete|edit/i })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Notifications preview", () => {
  const data: NotificationHistoryResponse = {
    notifications: [
      { id: "n1", eventType: "BOOKING_CONFIRMED", subject: "Booking confirmation", customerName: "Bianca Cruz", customerEmail: null, customerPhone: null, sentAt: "2026-09-16T02:12:00.000Z", success: true, failureReason: null, smsSent: true, emailSent: true },
      { id: "n2", eventType: "PAYMENT_CONFIRMED", subject: "Payment receipt", customerName: "Nicole Garcia", customerEmail: null, customerPhone: null, sentAt: "2026-09-16T02:04:00.000Z", success: true, failureReason: null, smsSent: null, emailSent: null },
      { id: "n3", eventType: "REMINDER_DUE", subject: "Appointment reminder", customerName: "Trisha Mendoza", customerEmail: null, customerPhone: null, sentAt: "2026-09-16T01:00:00.000Z", success: true, failureReason: null, smsSent: false, emailSent: true },
      { id: "n4", eventType: "BOOKING_CANCELLED", subject: "Booking cancellation", customerName: "Janelle Cruz", customerEmail: null, customerPhone: null, sentAt: "2026-09-16T00:30:00.000Z", success: false, failureReason: "Notification delivery failed.", smsSent: false, emailSent: false },
      { id: "n5", eventType: "PAYSLIP_GENERATED", subject: "Payslip ready", customerName: "Mika Santos", customerEmail: null, customerPhone: null, sentAt: "2026-09-15T23:00:00.000Z", success: true, failureReason: null, smsSent: null, emailSent: true },
      { id: "n6", eventType: "FLOW_REMINDER_SENT", subject: "Service follow-up", customerName: "Alina Reyes", customerEmail: null, customerPhone: null, sentAt: "2026-09-15T22:00:00.000Z", success: true, failureReason: null, smsSent: true, emailSent: null },
    ],
    totalCount: 75,
    page: 1,
    pageSize: 50,
    totalPages: 2,
  };

  it("distinguishes partial channel delivery from failed delivery", () => {
    render(<OwnerNotificationsPreview {...props} data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Partial delivery" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 of 6 on this page");
    expect(screen.getByText("Trisha Mendoza")).toBeInTheDocument();
    expect(screen.getByText("SMS failed")).toBeInTheDocument();
    expect(screen.getByText("Email delivered")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Failed" }));
    expect(screen.getByText("Janelle Cruz")).toBeInTheDocument();
    expect(screen.queryByText("Trisha Mendoza")).not.toBeInTheDocument();
  });

  it("does not interpret an unrequested channel as failed", async () => {
    render(<OwnerNotificationsPreview {...props} data={data} />);
    expect(screen.getByRole("progressbar", { name: "SMS delivery success" })).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByRole("progressbar", { name: "Email delivery success" })).toHaveAttribute("aria-valuenow", "75");
    expect(screen.getByText("2 delivered of 4 recorded attempts")).toBeInTheDocument();
    expect(screen.getByText("1 untracked outcomes on this page.", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View notification for Mika Santos: Payslip" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Not recorded")).toBeInTheDocument();
    expect(within(dialog).queryByText("Delivery issue")).not.toBeInTheDocument();
  });

  it("combines event/outcome/search filters and resets all of them", () => {
    render(<OwnerNotificationsPreview {...props} data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Payments" }));
    fireEvent.click(screen.getByRole("button", { name: "Failed" }));
    expect(screen.getByText("No matching notifications on this page")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("status")).toHaveTextContent("6 of 6 on this page");
  });

  it("shows untracked delivery and page-scoped totals without claiming delivery", () => {
    render(<OwnerNotificationsPreview {...props} data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Untracked" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 of 6 on this page · 75 total events");
    expect(screen.getByText("Nicole Garcia")).toBeInTheDocument();
    expect(screen.getByText("Channel outcome not recorded")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("keeps a terminal outbox failure failed even if stored channel flags conflict", () => {
    const conflicting: NotificationHistoryResponse = {
      ...data,
      notifications: data.notifications.map((notification) =>
        notification.id === "n4" ? { ...notification, smsSent: true, emailSent: true } : notification
      ),
    };
    render(<OwnerNotificationsPreview {...props} data={conflicting} />);
    fireEvent.click(screen.getByRole("button", { name: "Failed" }));
    expect(screen.getByText("Janelle Cruz")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 6 on this page");
  });
});
