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

// ─── Reschedule helper tests ─────────────────────────────────────

import {
  applyRescheduleShift,
  checkBookingReschedulable,
  rescheduleRejectionMessage,
} from "./booking-modify";

const NOW = new Date("2026-05-03T10:00:00Z");
const TWO_PM = new Date("2026-05-03T14:00:00Z");
const FOUR_PM = new Date("2026-05-03T16:00:00Z");
const YESTERDAY = new Date("2026-05-02T10:00:00Z");

function reschedFixture(overrides: {
  status?: BookingStatus;
  scheduled_at?: Date | null;
  lines?: ReadonlyArray<{ status: AvailedServiceStatus }>;
} = {}) {
  return {
    id: 100,
    status: overrides.status ?? BookingStatus.ACCEPTED,
    scheduled_at:
      overrides.scheduled_at === undefined ? TWO_PM : overrides.scheduled_at,
    availed_services:
      overrides.lines ?? [
        { status: AvailedServiceStatus.PENDING },
        { status: AvailedServiceStatus.PENDING },
      ],
  };
}

describe("checkBookingReschedulable", () => {
  it("allows rescheduling an ACCEPTED booking with no started services to a future time", () => {
    expect(
      checkBookingReschedulable({
        booking: reschedFixture(),
        newScheduledAt: FOUR_PM,
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects when booking is missing", () => {
    expect(
      checkBookingReschedulable({
        booking: null,
        newScheduledAt: FOUR_PM,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "BOOKING_NOT_FOUND" });
  });

  it("rejects when booking is not ACCEPTED", () => {
    expect(
      checkBookingReschedulable({
        booking: reschedFixture({ status: BookingStatus.COMPLETED }),
        newScheduledAt: FOUR_PM,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "BOOKING_NOT_ACCEPTED" });
  });

  it("rejects when booking has no scheduled_at", () => {
    expect(
      checkBookingReschedulable({
        booking: reschedFixture({ scheduled_at: null }),
        newScheduledAt: FOUR_PM,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "BOOKING_HAS_NO_SCHEDULED_TIME" });
  });

  it("rejects when any service has started or finished", () => {
    for (const status of [
      AvailedServiceStatus.SERVING,
      AvailedServiceStatus.COMPLETED,
    ]) {
      expect(
        checkBookingReschedulable({
          booking: reschedFixture({
            lines: [
              { status: AvailedServiceStatus.PENDING },
              { status },
            ],
          }),
          newScheduledAt: FOUR_PM,
          now: NOW,
        }),
      ).toEqual({ ok: false, reason: "BOOKING_HAS_STARTED_SERVICE" });
    }
  });

  it("rejects when the new time matches the current scheduled_at exactly", () => {
    expect(
      checkBookingReschedulable({
        booking: reschedFixture({ scheduled_at: TWO_PM }),
        newScheduledAt: new Date(TWO_PM),
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "BOOKING_ALREADY_AT_TIME" });
  });

  it("rejects when the new time is in the past", () => {
    expect(
      checkBookingReschedulable({
        booking: reschedFixture(),
        newScheduledAt: YESTERDAY,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "NEW_TIME_IN_PAST" });
  });

  it("CLAIMED-but-not-started services don't block reschedule", () => {
    expect(
      checkBookingReschedulable({
        booking: reschedFixture({
          lines: [
            { status: AvailedServiceStatus.PENDING },
            { status: AvailedServiceStatus.CLAIMED },
          ],
        }),
        newScheduledAt: FOUR_PM,
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });
});

describe("applyRescheduleShift", () => {
  it("shifts each line and the booking's estimated_end by the same delta", () => {
    const old = new Date("2026-05-03T14:00:00Z");
    const next = new Date("2026-05-03T16:00:00Z");
    const oldEnd = new Date("2026-05-03T15:30:00Z");

    const result = applyRescheduleShift({
      oldScheduledAt: old,
      newScheduledAt: next,
      oldEstimatedEnd: oldEnd,
      lines: [
        {
          id: 1,
          scheduled_at: new Date("2026-05-03T14:00:00Z"),
          estimated_end: new Date("2026-05-03T14:30:00Z"),
        },
        {
          id: 2,
          scheduled_at: new Date("2026-05-03T14:30:00Z"),
          estimated_end: new Date("2026-05-03T15:30:00Z"),
        },
      ],
    });

    expect(result.deltaMs).toBe(2 * 60 * 60 * 1000); // 2 hours
    expect(result.newEstimatedEnd?.toISOString()).toBe(
      "2026-05-03T17:30:00.000Z",
    );
    expect(result.shiftedLines[0].scheduled_at?.toISOString()).toBe(
      "2026-05-03T16:00:00.000Z",
    );
    expect(result.shiftedLines[1].estimated_end?.toISOString()).toBe(
      "2026-05-03T17:30:00.000Z",
    );
  });

  it("preserves nulls on lines that had no timestamps", () => {
    const result = applyRescheduleShift({
      oldScheduledAt: new Date("2026-05-03T14:00:00Z"),
      newScheduledAt: new Date("2026-05-03T16:00:00Z"),
      oldEstimatedEnd: null,
      lines: [{ id: 1, scheduled_at: null, estimated_end: null }],
    });

    expect(result.newEstimatedEnd).toBeNull();
    expect(result.shiftedLines[0].scheduled_at).toBeNull();
    expect(result.shiftedLines[0].estimated_end).toBeNull();
  });
});

describe("rescheduleRejectionMessage", () => {
  it("returns a non-empty string for every reschedule rejection reason", () => {
    const reasons = [
      "BOOKING_NOT_FOUND",
      "BOOKING_NOT_ACCEPTED",
      "BOOKING_HAS_NO_SCHEDULED_TIME",
      "BOOKING_HAS_STARTED_SERVICE",
      "BOOKING_ALREADY_AT_TIME",
      "NEW_TIME_IN_PAST",
    ] as const;
    for (const reason of reasons) {
      const msg = rescheduleRejectionMessage(reason);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

// ─── Reassign helper tests ──────────────────────────────────────

import {
  checkAvailedServiceReassignable,
  reassignRejectionMessage,
} from "./booking-modify";

describe("checkAvailedServiceReassignable", () => {
  it("allows reassigning a PENDING line to a different employee", () => {
    expect(
      checkAvailedServiceReassignable({
        availedService: {
          id: 1,
          status: AvailedServiceStatus.PENDING,
          served_by_id: null,
        },
        newEmployeeId: 42,
      }),
    ).toEqual({ ok: true });
  });

  it("allows reassigning a CLAIMED line to a different employee", () => {
    expect(
      checkAvailedServiceReassignable({
        availedService: {
          id: 1,
          status: AvailedServiceStatus.CLAIMED,
          served_by_id: 7,
        },
        newEmployeeId: 42,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects when the line is missing", () => {
    expect(
      checkAvailedServiceReassignable({
        availedService: null,
        newEmployeeId: 42,
      }),
    ).toEqual({ ok: false, reason: "AVAILED_SERVICE_NOT_FOUND" });
  });

  it("rejects when the line is already SERVING or COMPLETED", () => {
    for (const status of [
      AvailedServiceStatus.SERVING,
      AvailedServiceStatus.COMPLETED,
    ]) {
      expect(
        checkAvailedServiceReassignable({
          availedService: { id: 1, status, served_by_id: 7 },
          newEmployeeId: 42,
        }),
      ).toEqual({ ok: false, reason: "AVAILED_SERVICE_ALREADY_STARTED" });
    }
  });

  it("rejects CANCELLED with its own reason", () => {
    expect(
      checkAvailedServiceReassignable({
        availedService: {
          id: 1,
          status: AvailedServiceStatus.CANCELLED,
          served_by_id: null,
        },
        newEmployeeId: 42,
      }),
    ).toEqual({ ok: false, reason: "AVAILED_SERVICE_CANCELLED" });
  });

  it("rejects when the line is already assigned to the same employee", () => {
    expect(
      checkAvailedServiceReassignable({
        availedService: {
          id: 1,
          status: AvailedServiceStatus.CLAIMED,
          served_by_id: 42,
        },
        newEmployeeId: 42,
      }),
    ).toEqual({ ok: false, reason: "ALREADY_ASSIGNED_TO_EMPLOYEE" });
  });
});

describe("reassignRejectionMessage", () => {
  it("returns a non-empty string for every reassign rejection reason", () => {
    const reasons = [
      "AVAILED_SERVICE_NOT_FOUND",
      "AVAILED_SERVICE_ALREADY_STARTED",
      "AVAILED_SERVICE_CANCELLED",
      "EMPLOYEE_NOT_FOUND",
      "ALREADY_ASSIGNED_TO_EMPLOYEE",
    ] as const;
    for (const reason of reasons) {
      const msg = reassignRejectionMessage(reason);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

// ─── Price-adjust helper tests ───────────────────────────────────

import {
  checkBookingPriceAdjustable,
  priceAdjustRejectionMessage,
} from "./booking-modify";

function priceAdjustFixture(overrides: {
  status?: BookingStatus;
  payment_status?: PaymentStatus;
  grand_total?: number;
  lines?: ReadonlyArray<{ id: number; final_price: number }>;
} = {}) {
  return {
    id: 100,
    status: overrides.status ?? BookingStatus.ACCEPTED,
    payment_status: overrides.payment_status ?? PaymentStatus.UNPAID,
    grand_total: overrides.grand_total ?? 1000,
    availed_services: overrides.lines ?? [
      { id: 1, final_price: 400 },
      { id: 2, final_price: 600 },
    ],
  };
}

describe("checkBookingPriceAdjustable", () => {
  it("allows a booking-level discount on an ACCEPTED, unpaid booking", () => {
    const result = checkBookingPriceAdjustable({
      booking: priceAdjustFixture(),
      deltaAmount: -100,
      reason: "Loyalty discount",
    });
    expect(result).toEqual({ ok: true, resultingGrandTotal: 900 });
  });

  it("allows a line-level surcharge", () => {
    const result = checkBookingPriceAdjustable({
      booking: priceAdjustFixture(),
      availedServiceId: 1,
      deltaAmount: 50,
      reason: "Premium upgrade",
    });
    expect(result).toEqual({ ok: true, resultingGrandTotal: 1050 });
  });

  it("rejects when booking is missing", () => {
    expect(
      checkBookingPriceAdjustable({
        booking: null,
        deltaAmount: -50,
        reason: "x",
      }),
    ).toEqual({ ok: false, reason: "BOOKING_NOT_FOUND" });
  });

  it("rejects when booking is not ACCEPTED", () => {
    expect(
      checkBookingPriceAdjustable({
        booking: priceAdjustFixture({ status: BookingStatus.COMPLETED }),
        deltaAmount: -50,
        reason: "x",
      }),
    ).toEqual({ ok: false, reason: "BOOKING_NOT_ACCEPTED" });
  });

  it("rejects when booking is fully PAID", () => {
    expect(
      checkBookingPriceAdjustable({
        booking: priceAdjustFixture({ payment_status: PaymentStatus.PAID }),
        deltaAmount: -50,
        reason: "x",
      }),
    ).toEqual({ ok: false, reason: "BOOKING_FULLY_PAID" });
  });

  it("allows adjustment when payment_status is PARTIALLY_PAID", () => {
    expect(
      checkBookingPriceAdjustable({
        booking: priceAdjustFixture({
          payment_status: PaymentStatus.PARTIALLY_PAID,
        }),
        deltaAmount: -50,
        reason: "Partial refund",
      }),
    ).toMatchObject({ ok: true });
  });

  it("rejects a zero delta", () => {
    expect(
      checkBookingPriceAdjustable({
        booking: priceAdjustFixture(),
        deltaAmount: 0,
        reason: "x",
      }),
    ).toEqual({ ok: false, reason: "DELTA_IS_ZERO" });
  });

  it("rejects an empty or whitespace-only reason", () => {
    expect(
      checkBookingPriceAdjustable({
        booking: priceAdjustFixture(),
        deltaAmount: -50,
        reason: "   ",
      }),
    ).toEqual({ ok: false, reason: "REASON_REQUIRED" });
  });

  it("rejects when target line is not on the booking", () => {
    expect(
      checkBookingPriceAdjustable({
        booking: priceAdjustFixture(),
        availedServiceId: 999,
        deltaAmount: -50,
        reason: "x",
      }),
    ).toEqual({ ok: false, reason: "AVAILED_SERVICE_NOT_FOUND" });
  });

  it("rejects when resulting total would go negative", () => {
    expect(
      checkBookingPriceAdjustable({
        booking: priceAdjustFixture({ grand_total: 100 }),
        deltaAmount: -200,
        reason: "x",
      }),
    ).toEqual({ ok: false, reason: "RESULTING_TOTAL_NEGATIVE" });
  });
});

describe("priceAdjustRejectionMessage", () => {
  it("returns a non-empty string for every price-adjust rejection reason", () => {
    const reasons = [
      "BOOKING_NOT_FOUND",
      "BOOKING_NOT_ACCEPTED",
      "BOOKING_FULLY_PAID",
      "AVAILED_SERVICE_NOT_FOUND",
      "AVAILED_SERVICE_BELONGS_TO_OTHER_BOOKING",
      "DELTA_IS_ZERO",
      "REASON_REQUIRED",
      "RESULTING_TOTAL_NEGATIVE",
    ] as const;
    for (const reason of reasons) {
      const msg = priceAdjustRejectionMessage(reason);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

// ─── Cancel helper tests ─────────────────────────────────────────

import {
  cancelRejectionMessage,
  checkBookingCancellable,
} from "./booking-modify";

describe("checkBookingCancellable", () => {
  it("allows cancelling an ACCEPTED booking with a reason", () => {
    expect(
      checkBookingCancellable({
        booking: { id: 1, status: BookingStatus.ACCEPTED },
        reason: "Customer requested",
      }),
    ).toEqual({ ok: true });
  });

  it("allows cancelling a HOLD booking", () => {
    expect(
      checkBookingCancellable({
        booking: { id: 1, status: BookingStatus.HOLD },
        reason: "Hold expired",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects when booking is missing", () => {
    expect(
      checkBookingCancellable({ booking: null, reason: "x" }),
    ).toEqual({ ok: false, reason: "BOOKING_NOT_FOUND" });
  });

  it("rejects when booking is already CANCELLED", () => {
    expect(
      checkBookingCancellable({
        booking: { id: 1, status: BookingStatus.CANCELLED },
        reason: "x",
      }),
    ).toEqual({ ok: false, reason: "BOOKING_ALREADY_CANCELLED" });
  });

  it("rejects when booking is COMPLETED (refund instead)", () => {
    expect(
      checkBookingCancellable({
        booking: { id: 1, status: BookingStatus.COMPLETED },
        reason: "x",
      }),
    ).toEqual({ ok: false, reason: "BOOKING_ALREADY_COMPLETED" });
  });

  it("rejects empty / whitespace-only reason", () => {
    expect(
      checkBookingCancellable({
        booking: { id: 1, status: BookingStatus.ACCEPTED },
        reason: "   ",
      }),
    ).toEqual({ ok: false, reason: "REASON_REQUIRED" });
  });
});

describe("cancelRejectionMessage", () => {
  it("returns a non-empty string for every cancel rejection reason", () => {
    const reasons = [
      "BOOKING_NOT_FOUND",
      "BOOKING_ALREADY_CANCELLED",
      "BOOKING_ALREADY_COMPLETED",
      "REASON_REQUIRED",
    ] as const;
    for (const reason of reasons) {
      const msg = cancelRejectionMessage(reason);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});
