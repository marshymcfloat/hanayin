import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecentBookingsWidget } from "./RecentBookingsWidget";
import { approveGcashPaymentAction } from "@/features/payments/actions/manual-gcash";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/features/payments/actions/manual-gcash", () => ({
  approveGcashPaymentAction: vi.fn(),
}));

function booking(submittedAt: Date | null = null) {
  const paymentDeadline = new Date(Date.now() + 15 * 60 * 1000);
  return {
    id: 124,
    status: "HOLD",
    payment_status: "UNPAID",
    grand_total: 1499,
    amount_paid: 0,
    total_discount: 0,
    created_at: new Date(),
    scheduled_at: new Date("2026-08-19T09:30:00Z"),
    hold_expires_at: paymentDeadline,
    customer_label: null,
    customer: { name: "Daniel", phone: "09951804645" },
    vouchers: [],
    payments: [
      {
        id: 51,
        status: "PENDING",
        amount_principal: 299.8,
        payer_name: submittedAt ? "Daniel Canoy" : null,
        provider_reference: submittedAt ? "ABC123" : null,
        submitted_at: submittedAt,
        expires_at: paymentDeadline,
      },
    ],
    availed_services: [
      {
        id: 801,
        price: 1499,
        service: { name: "Soft gel nail extensions" },
        served_by: null,
        served_by_owner: null,
      },
    ],
  } as never;
}

describe("RecentBookingsWidget quick modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(approveGcashPaymentAction).mockResolvedValue({ success: true });
    window.history.replaceState({}, "", "/app/beautyfeel");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a live countdown for an unsubmitted payment", () => {
    render(
      <RecentBookingsWidget bookings={[booking()]} businessSlug="beautyfeel" />,
    );

    expect(
      screen.getByText(/awaiting payment · \d{2}:\d{2}/i),
    ).toBeInTheDocument();
  });

  it("locally expires an unpaid hold at zero and refreshes once", () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-19T08:00:00Z");
    vi.setSystemTime(now);
    const expiringBooking = booking();
    const mutableExpiringBooking = expiringBooking as unknown as {
      created_at: Date;
      hold_expires_at: Date;
    };
    mutableExpiringBooking.created_at = now;
    mutableExpiringBooking.hold_expires_at = new Date(now.getTime() + 1_000);

    render(
      <RecentBookingsWidget
        bookings={[expiringBooking]}
        businessSlug="beautyfeel"
      />,
    );

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(2_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps submitted payments in awaiting verification", () => {
    render(
      <RecentBookingsWidget
        bookings={[booking(new Date())]}
        businessSlug="beautyfeel"
      />,
    );

    expect(screen.getByText("Awaiting verification")).toBeInTheDocument();
    expect(screen.queryByText(/awaiting payment ·/i)).not.toBeInTheDocument();
  });

  it("does not show bookings created before today", () => {
    const yesterday = booking();
    const mutableYesterday = yesterday as unknown as {
      created_at: Date;
    };
    mutableYesterday.created_at = new Date(Date.now() - 24 * 60 * 60 * 1000);

    render(
      <RecentBookingsWidget
        bookings={[yesterday]}
        businessSlug="beautyfeel"
      />,
    );

    expect(screen.getByText("No bookings today yet.")).toBeInTheDocument();
  });

  it("opens in place and confirms an unsubmitted payment with the owner source", async () => {
    render(
      <RecentBookingsWidget bookings={[booking()]} businessSlug="beautyfeel" />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /open booking 124 for daniel/i }),
    );

    expect(window.location.pathname).toBe("/app/beautyfeel");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Soft gel nail extensions")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "09951804645" })).toHaveAttribute(
      "href",
      "tel:09951804645",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /confirm gcash payment/i }),
    );

    await waitFor(() =>
      expect(approveGcashPaymentAction).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 51,
          businessSlug: "beautyfeel",
          source: "OWNER_VERIFIED_WITHOUT_SUBMISSION",
        }),
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("uses the customer-submitted source from the compact widget", async () => {
    render(
      <RecentBookingsWidget
        bookings={[booking(new Date("2026-08-19T08:10:00Z"))]}
        businessSlug="beautyfeel"
        compact
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /open booking 124 for daniel/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /confirm gcash payment/i }),
    );

    await waitFor(() =>
      expect(approveGcashPaymentAction).toHaveBeenCalledWith(
        expect.objectContaining({ source: "CUSTOMER_SUBMITTED" }),
      ),
    );
  });
});
