import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingDetailPayload } from "@/features/bookings/booking-detail-types";

const mocks = vi.hoisted(() => ({ detail: vi.fn(), error: vi.fn(), viewer: vi.fn() }));
vi.mock("@/features/bookings/actions/booking-detail", () => ({ getBookingDetailAction: mocks.detail }));
vi.mock("@/lib/auth/viewer-context", () => ({ useViewer: mocks.viewer }));
vi.mock("@/components/feedback/permission-toasts", () => ({ showActionErrorToast: mocks.error }));
vi.mock("@/components/bookings/BookingQuickPanel", () => ({
  deriveBookingViewerContext: () => ({ role: "OWNER" }),
  BookingQuickPanel: ({ booking, onBookingChanged }: { booking: { amount_paid: number; payments: Array<{ submitted_at: Date | null }> } | null; onBookingChanged: () => void }) =>
    booking ? <button type="button" onClick={onBookingChanged}>Paid {booking.amount_paid}; submitted {booking.payments[0]?.submitted_at instanceof Date ? "yes" : "no"}</button> : null,
}));

import { LazyBookingQuickPanel } from "./LazyBookingQuickPanel";

const detail = (amount_paid: number): BookingDetailPayload => ({
  id: 12, business_id: "biz_a", status: "HOLD", customer: null,
  is_anonymous_walk_in: true, customer_label: "Walk-in", payment_method: "GCASH",
  payment_status: "PARTIALLY_PAID", amount_paid, grand_total: 500, total_discount: 0,
  downpayment: 100, downpayment_status: "HOLD", scheduled_at: null,
  estimated_end: null, created_at: "2026-09-16T02:00:00.000Z",
  hold_expires_at: "2026-09-16T05:00:00.000Z", cancelled_at: null,
  vouchers: [], availed_services: [], payments: [{
    id: 1, type: "DOWNPAYMENT", status: "PENDING", payment_method: "GCASH",
    amount_principal: 100, payer_name: null, provider_reference: null,
    submitted_at: "2026-09-16T02:30:00.000Z", verified_at: null,
    verified_by: null, paid_at: null, escalated_at: null, escalation_reason: null,
    rejection_reason: null, resolution_outcome: null, resolution_note: null, void_reason: null,
  }],
});

describe("LazyBookingQuickPanel", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.viewer.mockReturnValue({ role: "OWNER" }); });

  it("reloads confirmed detail and informs the caller after a management action", async () => {
    mocks.detail.mockResolvedValueOnce({ success: true, booking: detail(100) })
      .mockResolvedValueOnce({ success: true, booking: detail(200) });
    const onBookingChanged = vi.fn();
    render(<LazyBookingQuickPanel bookingId={12} open onOpenChange={vi.fn()} onBookingChanged={onBookingChanged} />);
    fireEvent.click(await screen.findByRole("button", { name: "Paid 100; submitted yes" }));
    expect(onBookingChanged).toHaveBeenCalledOnce();
    await screen.findByRole("button", { name: "Paid 200; submitted yes" });
    expect(mocks.detail).toHaveBeenCalledTimes(2);
  });

  it("closes a booking denied by the tenant-scoped detail boundary", async () => {
    mocks.detail.mockResolvedValue({ success: false, error: "Booking not found" });
    const onOpenChange = vi.fn();
    render(<LazyBookingQuickPanel bookingId={99} open onOpenChange={onOpenChange} />);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.error).toHaveBeenCalledWith("Booking not found", { action: "open this booking" });
    expect(screen.queryByRole("button", { name: /Paid/ })).not.toBeInTheDocument();
  });

  it("accepts an explicit owner viewer outside the legacy viewer provider", async () => {
    mocks.viewer.mockImplementation(() => { throw new Error("Legacy viewer provider unavailable"); });
    mocks.detail.mockResolvedValue({ success: true, booking: detail(100) });
    render(<LazyBookingQuickPanel bookingId={12} open onOpenChange={vi.fn()} viewerContext={{
      role: "OWNER", canAddService: true, canMarkPaid: true, canMarkNoShow: true,
      canDelete: true, canCancel: true, canAdjustPrice: true, canReassignStaff: true,
      canSeeAuditTrail: true,
    }} />);
    await screen.findByRole("button", { name: "Paid 100; submitted yes" });
    expect(mocks.viewer).not.toHaveBeenCalled();
  });
});
