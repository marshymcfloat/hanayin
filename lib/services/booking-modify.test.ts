import {
  AvailedServiceStatus,
  BookingStatus,
  PaymentStatus,
} from "@/prisma/generated/prisma/enums";

import {
  checkAvailedServiceRemovable,
  recomputeTotalsAfterRemoval,
  rejectionMessage,
} from "./booking-modify";

function bookingFixture(overrides: {
  status?: BookingStatus;
  amount_paid?: number;
  payment_status?: PaymentStatus;
  lines?: ReadonlyArray<{ id: number; status: AvailedServiceStatus }>;
} = {}) {
  return {
    id: 100,
    status: overrides.status ?? BookingStatus.ACCEPTED,
    amount_paid: overrides.amount_paid ?? 0,
    payment_status: overrides.payment_status ?? PaymentStatus.UNPAID,
    availed_services: overrides.lines ?? [
      { id: 1, status: AvailedServiceStatus.PENDING },
      { id: 2, status: AvailedServiceStatus.PENDING },
    ],
  };
}

describe("checkAvailedServiceRemovable", () => {
  it("allows removing a PENDING line from an ACCEPTED, unpaid booking with multiple lines", () => {
    expect(
      checkAvailedServiceRemovable({
        bookingId: 100,
        booking: bookingFixture(),
        availedServiceId: 1,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects when booking is missing", () => {
    expect(
      checkAvailedServiceRemovable({
        bookingId: 100,
        booking: null,
        availedServiceId: 1,
      }),
    ).toEqual({ ok: false, reason: "BOOKING_NOT_FOUND" });
  });

  it("rejects when the line is not on the booking", () => {
    expect(
      checkAvailedServiceRemovable({
        bookingId: 100,
        booking: bookingFixture(),
        availedServiceId: 999,
      }),
    ).toEqual({ ok: false, reason: "AVAILED_SERVICE_NOT_FOUND" });
  });

  it("rejects when booking status is not ACCEPTED", () => {
    expect(
      checkAvailedServiceRemovable({
        bookingId: 100,
        booking: bookingFixture({ status: BookingStatus.COMPLETED }),
        availedServiceId: 1,
      }),
    ).toEqual({ ok: false, reason: "BOOKING_NOT_ACCEPTED" });

    expect(
      checkAvailedServiceRemovable({
        bookingId: 100,
        booking: bookingFixture({ status: BookingStatus.CANCELLED }),
        availedServiceId: 1,
      }),
    ).toEqual({ ok: false, reason: "BOOKING_NOT_ACCEPTED" });
  });

  it("rejects when there is any amount_paid", () => {
    expect(
      checkAvailedServiceRemovable({
        bookingId: 100,
        booking: bookingFixture({ amount_paid: 0.01 }),
        availedServiceId: 1,
      }),
    ).toEqual({ ok: false, reason: "BOOKING_HAS_PAYMENT" });
  });

  it("rejects when payment_status is not UNPAID even with zero amount_paid", () => {
    expect(
      checkAvailedServiceRemovable({
        bookingId: 100,
        booking: bookingFixture({
          payment_status: PaymentStatus.PARTIALLY_PAID,
        }),
        availedServiceId: 1,
      }),
    ).toEqual({ ok: false, reason: "BOOKING_HAS_PAYMENT" });
  });

  it("rejects when the line has already started or finished", () => {
    for (const status of [
      AvailedServiceStatus.CLAIMED,
      AvailedServiceStatus.SERVING,
      AvailedServiceStatus.COMPLETED,
      AvailedServiceStatus.CANCELLED,
    ]) {
      expect(
        checkAvailedServiceRemovable({
          bookingId: 100,
          booking: bookingFixture({
            lines: [
              { id: 1, status },
              { id: 2, status: AvailedServiceStatus.PENDING },
            ],
          }),
          availedServiceId: 1,
        }),
      ).toEqual({ ok: false, reason: "AVAILED_SERVICE_ALREADY_STARTED" });
    }
  });

  it("rejects when removing the last remaining line", () => {
    expect(
      checkAvailedServiceRemovable({
        bookingId: 100,
        booking: bookingFixture({
          lines: [{ id: 1, status: AvailedServiceStatus.PENDING }],
        }),
        availedServiceId: 1,
      }),
    ).toEqual({ ok: false, reason: "LAST_REMAINING_SERVICE" });
  });
});

describe("recomputeTotalsAfterRemoval", () => {
  it("subtracts the line's final_price from grand_total", () => {
    expect(
      recomputeTotalsAfterRemoval({
        currentGrandTotal: 1000,
        currentTotalDiscount: 100,
        removedLine: { final_price: 250, discount: 0 },
      }),
    ).toEqual({ grandTotal: 750, totalDiscount: 100 });
  });

  it("subtracts the line's discount from total_discount", () => {
    expect(
      recomputeTotalsAfterRemoval({
        currentGrandTotal: 800,
        currentTotalDiscount: 200,
        removedLine: { final_price: 200, discount: 50 },
      }),
    ).toEqual({ grandTotal: 600, totalDiscount: 150 });
  });

  it("rounds money to 2 decimals", () => {
    expect(
      recomputeTotalsAfterRemoval({
        currentGrandTotal: 1.005, // floating-point fun
        currentTotalDiscount: 0,
        removedLine: { final_price: 0.005, discount: 0 },
      }),
    ).toEqual({ grandTotal: 1, totalDiscount: 0 });
  });

  it("clamps negative results to zero", () => {
    expect(
      recomputeTotalsAfterRemoval({
        currentGrandTotal: 100,
        currentTotalDiscount: 0,
        removedLine: { final_price: 200, discount: 0 },
      }),
    ).toEqual({ grandTotal: 0, totalDiscount: 0 });
  });
});

describe("rejectionMessage", () => {
  it("returns a non-empty user-facing string for every rejection reason", () => {
    const reasons = [
      "BOOKING_NOT_FOUND",
      "AVAILED_SERVICE_NOT_FOUND",
      "AVAILED_SERVICE_BELONGS_TO_OTHER_BOOKING",
      "BOOKING_NOT_ACCEPTED",
      "BOOKING_HAS_PAYMENT",
      "AVAILED_SERVICE_ALREADY_STARTED",
      "LAST_REMAINING_SERVICE",
    ] as const;
    for (const reason of reasons) {
      const msg = rejectionMessage(reason);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});
