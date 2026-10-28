import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerNotificationsStudy } from "@/components/dashboard/design-study/OwnerNotificationsStudy";
import type { NotificationHistoryResponse } from "@/features/notifications/types";

const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
afterEach(() => {
  cleanup();
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});
const history: NotificationHistoryResponse = {
  notifications: [
    { id: "unknown", eventType: "BOOKING_CONFIRMED", subject: "Booking confirmation", customerName: "Fixture customer", customerEmail: null, customerPhone: null, sentAt: "2026-10-10T18:30:00.000Z", success: true, failureReason: null, smsSent: null, emailSent: null },
    { id: "partial", eventType: "PAYSLIP_GENERATED", subject: "Payslip ready", customerName: "Fixture employee", customerEmail: "fixture@example.test", customerPhone: "fixture", sentAt: "2026-10-10T18:30:00.000Z", success: true, failureReason: null, smsSent: false, emailSent: true },
    { id: "failed", eventType: "PAYMENT_CONFIRMED", subject: "Payment receipt", customerName: "Fixture failed", customerEmail: "fixture@example.test", customerPhone: null, sentAt: "2026-10-10T18:30:00.000Z", success: false, failureReason: "Notification delivery failed.", smsSent: null, emailSent: false },
  ], totalCount: 53, page: 1, pageSize: 50, totalPages: 2,
};
const mount = (data = history) => render(<OwnerNotificationsStudy data={data} refreshControl={null} onPageChange={vi.fn()} />);

describe("Notifications redesign", () => {
  it("preserves unknown and partial outcomes, page scope, and Philippine timestamps", () => {
    mount();
    const list = within(screen.getByRole("list"));
    expect(list.getByText("Untracked")).toBeInTheDocument();
    expect(list.getByText("Partial delivery")).toBeInTheDocument();
    expect(list.getByText("SMS failed")).toBeInTheDocument();
    expect(list.getByText("Email delivered")).toBeInTheDocument();
    expect(list.getAllByText(/Oct 11, 2026, 2:30 AM/)).toHaveLength(3);
    expect(screen.getByText("53 in history")).toBeInTheDocument();
    expect(screen.getByText(/3 of 3 on this page/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark.*read|send|retry delivery/i })).not.toBeInTheDocument();
  });
  it("filters and resets without changing the server page", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Payslips" }));
    expect(screen.getByText("Fixture employee")).toBeInTheDocument();
    expect(screen.queryByText("Fixture customer")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "absent" } });
    expect(screen.getByText("No matching notifications on this page")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Fixture customer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All events" })).toHaveAttribute("aria-pressed", "true");
  });
  it("opens a read-only themed details sheet with a keyboard-accessible scroll area", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "View notification for Fixture employee: Payslip" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Fixture employee")).toBeInTheDocument();
    expect(dialog.getByText("Partial delivery")).toBeInTheDocument();
    expect(dialog.getByLabelText("Notification details")).toHaveAttribute("tabindex", "0");
    expect(dialog.getByText(/Opening it does not send a message/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Close" }));
  });
  it("filters outcomes through the themed menu", async () => {
    mount();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Delivery outcome on this page" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Failed" }));
    expect(screen.getByText("Fixture failed")).toBeInTheDocument();
    expect(screen.queryByText("Fixture employee")).not.toBeInTheDocument();
    expect(screen.queryByText("Fixture customer")).not.toBeInTheDocument();
  });
  it("does not invent delivery rates for empty history", () => {
    mount({ ...history, notifications: [], totalCount: 0, totalPages: 0 });
    expect(screen.getByText("No notifications on this page")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });
});
