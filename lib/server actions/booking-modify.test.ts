import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AvailedServiceStatus,
  BookingStatus,
  PaymentStatus,
} from "@/prisma/generated/prisma/enums";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  resolveTenantActorContext: vi.fn(),
  hasStaffPermission: vi.fn(),
  bookingFindFirst: vi.fn(),
  bookingFindFirstOrThrow: vi.fn(),
  availedServiceDelete: vi.fn(),
  availedServiceUpdate: vi.fn(),
  availedServiceFindFirst: vi.fn(),
  availedServiceFindFirstOrThrow: vi.fn(),
  bookingPriceAdjustmentCreate: vi.fn(),
  bookingNoteCreate: vi.fn(),
  employeeFindFirst: vi.fn(),
  bookingUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  outboxMessageCreate: vi.fn(),
  revalidatePath: vi.fn(),
  appendServicesToUntouchedBookingInTx: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/auth/staff-access", () => ({
  resolveTenantActorContext: mocks.resolveTenantActorContext,
  hasStaffPermission: mocks.hasStaffPermission,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/prisma/prisma", () => {
  const txDelegate = {
    booking: {
      findFirst: mocks.bookingFindFirst,
      findFirstOrThrow: mocks.bookingFindFirstOrThrow,
      update: mocks.bookingUpdate,
    },
    availedService: {
      delete: mocks.availedServiceDelete,
      update: mocks.availedServiceUpdate,
      findFirst: mocks.availedServiceFindFirst,
      findFirstOrThrow: mocks.availedServiceFindFirstOrThrow,
    },
    employee: {
      findFirst: mocks.employeeFindFirst,
    },
    bookingPriceAdjustment: {
      create: mocks.bookingPriceAdjustmentCreate,
    },
    bookingNote: {
      create: mocks.bookingNoteCreate,
    },
    auditLog: {
      create: mocks.auditLogCreate,
    },
    outboxMessage: {
      create: mocks.outboxMessageCreate,
    },
  };

  return {
    prisma: {
      ...txDelegate,
      $transaction: async <T>(
        fn: (tx: typeof txDelegate) => Promise<T>,
        _options?: unknown,
      ) => fn(txDelegate),
    },
  };
});

vi.mock("@/lib/services/booking-addons", () => ({
  appendServicesToUntouchedBookingInTx: mocks.appendServicesToUntouchedBookingInTx,
}));

import {
  addBookingNoteAction,
  adjustBookingPriceAction,
  cancelBookingAction,
  reassignBookingStaffAction,
  removeBookingServiceAction,
  rescheduleBookingAction,
  swapBookingServiceAction,
} from "./booking-modify";

const baseEmployeeContext = {
  success: true as const,
  businessId: "biz_1",
  businessSlug: "demo-business",
  userId: "user_manager",
  actorType: "EMPLOYEE" as const,
  role: "EMPLOYEE" as const,
  employeeId: 42,
  businessPolicy: {
    structure: "OWNER_EMPLOYEE_SELF_SERVICE" as const,
    allowEmployeeSelfBooking: true,
    managerCanServe: true,
  },
  profile: "MANAGER" as const,
  permissions: ["BOOKING_MODIFY"],
  ownerId: null,
};

function bookingFixture(overrides: {
  status?: BookingStatus;
  amount_paid?: number;
  payment_status?: PaymentStatus;
  grand_total?: number;
  total_discount?: number;
  lines?: Array<{
    id: number;
    status: AvailedServiceStatus;
    final_price: number;
    discount: number;
    serviceName?: string;
  }>;
} = {}) {
  return {
    id: 100,
    business_id: "biz_1",
    status: overrides.status ?? BookingStatus.ACCEPTED,
    amount_paid: overrides.amount_paid ?? 0,
    payment_status: overrides.payment_status ?? PaymentStatus.UNPAID,
    grand_total: overrides.grand_total ?? 1000,
    total_discount: overrides.total_discount ?? 100,
    customer: { name: "Jane Cruz", email: "jane@example.com" },
    availed_services: (
      overrides.lines ?? [
        {
          id: 1,
          status: AvailedServiceStatus.PENDING,
          final_price: 400,
          discount: 0,
          serviceName: "Haircut",
        },
        {
          id: 2,
          status: AvailedServiceStatus.PENDING,
          final_price: 600,
          discount: 100,
          serviceName: "Color",
        },
      ]
    ).map((line) => ({
      id: line.id,
      status: line.status,
      final_price: line.final_price,
      discount: line.discount,
      service: { name: line.serviceName ?? `Service ${line.id}` },
    })),
  };
}

beforeEach(() => {
  vi.resetAllMocks();

  mocks.requireAuth.mockResolvedValue({
    success: true,
    businessSlug: "demo-business",
    session: { user: { id: "user_manager" } },
  });
  mocks.resolveTenantActorContext.mockResolvedValue(baseEmployeeContext);
  mocks.hasStaffPermission.mockReturnValue(true);
  mocks.bookingFindFirst.mockResolvedValue(bookingFixture());
  mocks.availedServiceDelete.mockResolvedValue({ id: 1 });
  mocks.bookingUpdate.mockResolvedValue({
    id: 100,
    grand_total: 600,
    total_discount: 100,
  });
  mocks.auditLogCreate.mockResolvedValue({});
  mocks.outboxMessageCreate.mockResolvedValue({});

  // Defaults for swap path. Tests that exercise edge cases override.
  mocks.appendServicesToUntouchedBookingInTx.mockResolvedValue({
    bookingId: 100,
  });
  mocks.bookingFindFirstOrThrow.mockResolvedValue({ grand_total: 800 });
  mocks.availedServiceFindFirstOrThrow.mockResolvedValue({
    id: 99,
    service: { id: 5, name: "Massage" },
  });
});

describe("removeBookingServiceAction — happy path", () => {
  it("removes a PENDING line, recomputes totals, writes audit + outbox", async () => {
    const result = await removeBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
    });

    expect(result).toEqual({
      success: true,
      bookingId: 100,
      removedAvailedServiceId: 1,
      newGrandTotal: 600,
      newTotalDiscount: 100,
    });

    expect(mocks.availedServiceDelete).toHaveBeenCalledWith({
      where: { id: 1 },
    });

    expect(mocks.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({
          grand_total: 600, // 1000 - 400
          total_discount: 100, // unchanged because removed line had 0 discount
        }),
      }),
    );

    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity_type: "Booking",
          entity_id: "100",
          action: "UPDATED",
          actor_id: "user_manager",
          actor_type: "USER",
          business_id: "biz_1",
        }),
      }),
    );

    expect(mocks.outboxMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: "BOOKING_SERVICE_REMOVED",
          aggregate_type: "Booking",
          aggregate_id: "100",
          business_id: "biz_1",
        }),
      }),
    );

    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/app/demo-business/bookings",
    );
  });
});

describe("removeBookingServiceAction — permission gate", () => {
  it("rejects when employee lacks BOOKING_MODIFY", async () => {
    mocks.hasStaffPermission.mockReturnValue(false);

    const result = await removeBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
    });

    expect(result).toEqual({
      success: false,
      error: "Forbidden",
      code: "Forbidden",
    });
    // No mutations should have happened.
    expect(mocks.availedServiceDelete).not.toHaveBeenCalled();
    expect(mocks.bookingUpdate).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it("returns Unauthorized when not signed in", async () => {
    mocks.requireAuth.mockResolvedValue({
      success: false,
      error: "Unauthorized",
    });

    const result = await removeBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
    });

    expect(result).toMatchObject({
      success: false,
      error: "Unauthorized",
      code: "Unauthorized",
    });
  });

  it("returns the actor-context error when tenant resolution fails", async () => {
    mocks.resolveTenantActorContext.mockResolvedValue({
      success: false,
      error: "Forbidden",
    });

    const result = await removeBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
    });

    expect(result).toMatchObject({ success: false, code: "Forbidden" });
  });
});

describe("removeBookingServiceAction — state-machine guards", () => {
  it("rejects when booking is missing", async () => {
    mocks.bookingFindFirst.mockResolvedValue(null);

    const result = await removeBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
    });

    expect(result).toMatchObject({ success: false, code: "BOOKING_NOT_FOUND" });
  });

  it("rejects when the line isn't on the booking", async () => {
    const result = await removeBookingServiceAction({
      bookingId: 100,
      availedServiceId: 999,
    });

    expect(result).toMatchObject({
      success: false,
      code: "AVAILED_SERVICE_NOT_FOUND",
    });
  });

  it("rejects when booking is not ACCEPTED", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      bookingFixture({ status: BookingStatus.COMPLETED }),
    );

    const result = await removeBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
    });

    expect(result).toMatchObject({
      success: false,
      code: "BOOKING_NOT_ACCEPTED",
    });
  });

  it("rejects when there is any payment recorded", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      bookingFixture({ amount_paid: 200, payment_status: PaymentStatus.PARTIALLY_PAID }),
    );

    const result = await removeBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
    });

    expect(result).toMatchObject({
      success: false,
      code: "BOOKING_HAS_PAYMENT",
    });
  });

  it("rejects when the line has already started", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      bookingFixture({
        lines: [
          {
            id: 1,
            status: AvailedServiceStatus.SERVING,
            final_price: 400,
            discount: 0,
          },
          {
            id: 2,
            status: AvailedServiceStatus.PENDING,
            final_price: 600,
            discount: 0,
          },
        ],
      }),
    );

    const result = await removeBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
    });

    expect(result).toMatchObject({
      success: false,
      code: "AVAILED_SERVICE_ALREADY_STARTED",
    });
  });

  it("rejects when removing the last remaining line", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      bookingFixture({
        lines: [
          {
            id: 1,
            status: AvailedServiceStatus.PENDING,
            final_price: 400,
            discount: 0,
          },
        ],
      }),
    );

    const result = await removeBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
    });

    expect(result).toMatchObject({
      success: false,
      code: "LAST_REMAINING_SERVICE",
    });
  });
});

describe("removeBookingServiceAction — input validation", () => {
  it("rejects non-positive bookingId", async () => {
    const result = await removeBookingServiceAction({
      bookingId: 0,
      availedServiceId: 1,
    });
    expect(result).toMatchObject({ success: false, code: "InvalidInput" });
  });

  it("rejects non-positive availedServiceId", async () => {
    const result = await removeBookingServiceAction({
      bookingId: 100,
      availedServiceId: -1,
    });
    expect(result).toMatchObject({ success: false, code: "InvalidInput" });
  });
});

// ─── Swap action tests ─────────────────────────────────────────────

describe("swapBookingServiceAction — happy path", () => {
  it("deletes the old line, calls append helper, writes audit + outbox", async () => {
    const result = await swapBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
      newServiceId: 5,
    });

    expect(result).toEqual({
      success: true,
      bookingId: 100,
      removedAvailedServiceId: 1,
      addedServiceId: 5,
    });

    expect(mocks.availedServiceDelete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
    expect(mocks.appendServicesToUntouchedBookingInTx).toHaveBeenCalled();
    const [, params] =
      mocks.appendServicesToUntouchedBookingInTx.mock.calls[0];
    expect(params.services).toEqual([
      expect.objectContaining({
        id: 5,
        quantity: 1,
        claimedByCurrentEmployee: false,
      }),
    ]);

    expect(mocks.outboxMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: "BOOKING_SERVICE_SWAPPED",
          aggregate_type: "Booking",
          aggregate_id: "100",
        }),
      }),
    );

    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity_type: "Booking",
          entity_id: "100",
          action: "UPDATED",
        }),
      }),
    );
  });

  it("forwards claimedByCurrentEmployee to the append helper", async () => {
    await swapBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
      newServiceId: 5,
      claimedByCurrentEmployee: true,
    });

    const [, params] =
      mocks.appendServicesToUntouchedBookingInTx.mock.calls[0];
    expect(params.services[0].claimedByCurrentEmployee).toBe(true);
    // Employee actor's own employeeId is passed as currentEmployeeId
    // so the append helper can mark the new line as claimed by them.
    expect(params.currentEmployeeId).toBe(42);
  });
});

describe("swapBookingServiceAction — permission gate", () => {
  it("rejects when employee lacks BOOKING_MODIFY", async () => {
    mocks.hasStaffPermission.mockReturnValue(false);

    const result = await swapBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
      newServiceId: 5,
    });

    expect(result).toMatchObject({ success: false, code: "Forbidden" });
    expect(mocks.availedServiceDelete).not.toHaveBeenCalled();
    expect(mocks.appendServicesToUntouchedBookingInTx).not.toHaveBeenCalled();
  });

  it("returns Unauthorized when not signed in", async () => {
    mocks.requireAuth.mockResolvedValue({
      success: false,
      error: "Unauthorized",
    });
    const result = await swapBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
      newServiceId: 5,
    });
    expect(result).toMatchObject({ code: "Unauthorized" });
  });
});

describe("swapBookingServiceAction — state-machine guards", () => {
  it("rejects when the old line is not on the booking", async () => {
    const result = await swapBookingServiceAction({
      bookingId: 100,
      availedServiceId: 999,
      newServiceId: 5,
    });
    expect(result).toMatchObject({
      success: false,
      code: "AVAILED_SERVICE_NOT_FOUND",
    });
  });

  it("rejects when the booking is paid", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      bookingFixture({
        amount_paid: 200,
        payment_status: PaymentStatus.PARTIALLY_PAID,
      }),
    );
    const result = await swapBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
      newServiceId: 5,
    });
    expect(result).toMatchObject({ code: "BOOKING_HAS_PAYMENT" });
    expect(mocks.appendServicesToUntouchedBookingInTx).not.toHaveBeenCalled();
  });

  it("rejects when the old line has already started", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      bookingFixture({
        lines: [
          {
            id: 1,
            status: AvailedServiceStatus.SERVING,
            final_price: 400,
            discount: 0,
          },
          {
            id: 2,
            status: AvailedServiceStatus.PENDING,
            final_price: 600,
            discount: 0,
          },
        ],
      }),
    );
    const result = await swapBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
      newServiceId: 5,
    });
    expect(result).toMatchObject({ code: "AVAILED_SERVICE_ALREADY_STARTED" });
  });

  it("translates BOOKING_STATE_CHANGED race into a friendly error", async () => {
    // Simulates the case where the append helper detects that the
    // booking moved out of APPEND mode mid-transaction.
    mocks.appendServicesToUntouchedBookingInTx.mockRejectedValue(
      new Error("BOOKING_STATE_CHANGED"),
    );
    const result = await swapBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
      newServiceId: 5,
    });
    expect(result).toMatchObject({ code: "BOOKING_STATE_CHANGED" });
  });
});

describe("swapBookingServiceAction — input validation", () => {
  it("rejects non-positive newServiceId", async () => {
    const result = await swapBookingServiceAction({
      bookingId: 100,
      availedServiceId: 1,
      newServiceId: 0,
    });
    expect(result).toMatchObject({ code: "InvalidInput" });
  });
});

// ─── Reschedule action tests ─────────────────────────────────────

// Use the canonical Date.prototype.toISOString() format with explicit
// milliseconds so the action's `.toISOString()` output matches exactly.
const RESCHED_OLD = "2026-05-03T14:00:00.000Z";
const RESCHED_NEW = "2099-05-03T16:00:00.000Z"; // far-future to avoid past-time guard

function reschedFixture(overrides: {
  status?: BookingStatus;
  scheduled_at?: Date | null;
  estimated_end?: Date | null;
  lines?: Array<{
    id: number;
    status: AvailedServiceStatus;
    scheduled_at?: Date | null;
    estimated_end?: Date | null;
  }>;
} = {}) {
  return {
    id: 100,
    business_id: "biz_1",
    status: overrides.status ?? BookingStatus.ACCEPTED,
    scheduled_at:
      overrides.scheduled_at === undefined
        ? new Date(RESCHED_OLD)
        : overrides.scheduled_at,
    estimated_end:
      overrides.estimated_end === undefined
        ? new Date("2026-05-03T15:30:00Z")
        : overrides.estimated_end,
    customer: {
      name: "Jane Cruz",
      email: "jane@example.com",
      phone: "0917-555-1234",
    },
    availed_services: (
      overrides.lines ?? [
        {
          id: 1,
          status: AvailedServiceStatus.PENDING,
          scheduled_at: new Date("2026-05-03T14:00:00Z"),
          estimated_end: new Date("2026-05-03T14:30:00Z"),
        },
        {
          id: 2,
          status: AvailedServiceStatus.PENDING,
          scheduled_at: new Date("2026-05-03T14:30:00Z"),
          estimated_end: new Date("2026-05-03T15:30:00Z"),
        },
      ]
    ).map((line) => ({
      id: line.id,
      status: line.status,
      scheduled_at: line.scheduled_at ?? null,
      estimated_end: line.estimated_end ?? null,
    })),
  };
}

describe("rescheduleBookingAction — happy path", () => {
  beforeEach(() => {
    mocks.bookingFindFirst.mockResolvedValue(reschedFixture());
    mocks.availedServiceUpdate.mockResolvedValue({});
    mocks.bookingUpdate.mockResolvedValue({
      id: 100,
      scheduled_at: new Date(RESCHED_NEW),
      estimated_end: new Date("2099-05-03T17:30:00Z"),
    });
  });

  it("shifts each line, updates booking, writes audit + outbox", async () => {
    const result = await rescheduleBookingAction({
      bookingId: 100,
      newScheduledAt: new Date(RESCHED_NEW),
    });

    expect(result).toMatchObject({
      success: true,
      bookingId: 100,
      oldScheduledAt: RESCHED_OLD,
    });

    // Two lines updated.
    expect(mocks.availedServiceUpdate).toHaveBeenCalledTimes(2);

    // Booking updated with new times + reminder reset.
    expect(mocks.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({
          reminder_sent: false,
        }),
      }),
    );

    expect(mocks.outboxMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: "BOOKING_RESCHEDULED",
          aggregate_type: "Booking",
          aggregate_id: "100",
        }),
      }),
    );
  });
});

describe("rescheduleBookingAction — permission gate", () => {
  it("rejects when employee lacks BOOKING_MODIFY", async () => {
    mocks.hasStaffPermission.mockReturnValue(false);
    const result = await rescheduleBookingAction({
      bookingId: 100,
      newScheduledAt: new Date(RESCHED_NEW),
    });
    expect(result).toMatchObject({ success: false, code: "Forbidden" });
    expect(mocks.bookingUpdate).not.toHaveBeenCalled();
  });
});

describe("rescheduleBookingAction — state-machine guards", () => {
  it("rejects when booking is missing", async () => {
    mocks.bookingFindFirst.mockResolvedValue(null);
    const result = await rescheduleBookingAction({
      bookingId: 100,
      newScheduledAt: new Date(RESCHED_NEW),
    });
    expect(result).toMatchObject({ code: "BOOKING_NOT_FOUND" });
  });

  it("rejects when booking is not ACCEPTED", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      reschedFixture({ status: BookingStatus.COMPLETED }),
    );
    const result = await rescheduleBookingAction({
      bookingId: 100,
      newScheduledAt: new Date(RESCHED_NEW),
    });
    expect(result).toMatchObject({ code: "BOOKING_NOT_ACCEPTED" });
  });

  it("rejects when booking has no scheduled_at", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      reschedFixture({ scheduled_at: null }),
    );
    const result = await rescheduleBookingAction({
      bookingId: 100,
      newScheduledAt: new Date(RESCHED_NEW),
    });
    expect(result).toMatchObject({ code: "BOOKING_HAS_NO_SCHEDULED_TIME" });
  });

  it("rejects when a service has already started", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      reschedFixture({
        lines: [
          { id: 1, status: AvailedServiceStatus.SERVING },
          { id: 2, status: AvailedServiceStatus.PENDING },
        ],
      }),
    );
    const result = await rescheduleBookingAction({
      bookingId: 100,
      newScheduledAt: new Date(RESCHED_NEW),
    });
    expect(result).toMatchObject({ code: "BOOKING_HAS_STARTED_SERVICE" });
  });

  it("rejects when the new time is in the past", async () => {
    mocks.bookingFindFirst.mockResolvedValue(reschedFixture());
    const result = await rescheduleBookingAction({
      bookingId: 100,
      newScheduledAt: new Date("2000-01-01T00:00:00Z"),
    });
    expect(result).toMatchObject({ code: "NEW_TIME_IN_PAST" });
  });
});

// ─── Reassign action tests ────────────────────────────────────────

function reassignableLineFixture(overrides: {
  status?: AvailedServiceStatus;
  served_by_id?: number | null;
  served_by_owner_id?: number | null;
} = {}) {
  return {
    id: 555,
    status: overrides.status ?? AvailedServiceStatus.PENDING,
    served_by_id: overrides.served_by_id ?? null,
    served_by_owner_id: overrides.served_by_owner_id ?? null,
    booking_id: 100,
    booking: { business_id: "biz_1" },
    service: { name: "Massage" },
    served_by: overrides.served_by_id
      ? {
          id: overrides.served_by_id,
          user: { name: "Maria Lopez" },
        }
      : null,
  };
}

describe("reassignBookingStaffAction — happy path", () => {
  beforeEach(() => {
    mocks.availedServiceFindFirst.mockResolvedValue(reassignableLineFixture());
    mocks.employeeFindFirst.mockResolvedValue({
      id: 77,
      user: { name: "Anna Cruz" },
    });
    mocks.availedServiceUpdate.mockResolvedValue({});
  });

  it("reassigns a PENDING line to a new employee, marks it CLAIMED, writes audit + outbox", async () => {
    const result = await reassignBookingStaffAction({
      availedServiceId: 555,
      newEmployeeId: 77,
    });

    expect(result).toMatchObject({
      success: true,
      bookingId: 100,
      availedServiceId: 555,
      newEmployeeId: 77,
    });

    expect(mocks.availedServiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 555 },
        data: expect.objectContaining({
          served_by_id: 77,
          served_by_owner_id: null,
          served_by_type: "EMPLOYEE",
          status: "CLAIMED",
        }),
      }),
    );

    expect(mocks.outboxMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: "BOOKING_STAFF_REASSIGNED",
          aggregate_type: "Booking",
          aggregate_id: "100",
        }),
      }),
    );
  });

  it("preserves CLAIMED status when reassigning an already-claimed line", async () => {
    mocks.availedServiceFindFirst.mockResolvedValue(
      reassignableLineFixture({
        status: AvailedServiceStatus.CLAIMED,
        served_by_id: 7,
      }),
    );

    await reassignBookingStaffAction({
      availedServiceId: 555,
      newEmployeeId: 77,
    });

    expect(mocks.availedServiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          served_by_id: 77,
          status: "CLAIMED",
        }),
      }),
    );
  });
});

describe("reassignBookingStaffAction — permission gate", () => {
  it("rejects when employee lacks QUEUE_OVERRIDE_ALL", async () => {
    mocks.hasStaffPermission.mockReturnValue(false);
    const result = await reassignBookingStaffAction({
      availedServiceId: 555,
      newEmployeeId: 77,
    });
    expect(result).toMatchObject({ code: "Forbidden" });
    expect(mocks.availedServiceUpdate).not.toHaveBeenCalled();
  });

  it("returns Unauthorized when not signed in", async () => {
    mocks.requireAuth.mockResolvedValue({
      success: false,
      error: "Unauthorized",
    });
    const result = await reassignBookingStaffAction({
      availedServiceId: 555,
      newEmployeeId: 77,
    });
    expect(result).toMatchObject({ code: "Unauthorized" });
  });
});

describe("reassignBookingStaffAction — state-machine guards", () => {
  it("rejects when the line isn't found in this business", async () => {
    mocks.availedServiceFindFirst.mockResolvedValue(null);
    const result = await reassignBookingStaffAction({
      availedServiceId: 555,
      newEmployeeId: 77,
    });
    expect(result).toMatchObject({ code: "AVAILED_SERVICE_NOT_FOUND" });
  });

  it("rejects when the line is already SERVING", async () => {
    mocks.availedServiceFindFirst.mockResolvedValue(
      reassignableLineFixture({
        status: AvailedServiceStatus.SERVING,
        served_by_id: 7,
      }),
    );
    const result = await reassignBookingStaffAction({
      availedServiceId: 555,
      newEmployeeId: 77,
    });
    expect(result).toMatchObject({ code: "AVAILED_SERVICE_ALREADY_STARTED" });
  });

  it("rejects when the line was CANCELLED", async () => {
    mocks.availedServiceFindFirst.mockResolvedValue(
      reassignableLineFixture({ status: AvailedServiceStatus.CANCELLED }),
    );
    const result = await reassignBookingStaffAction({
      availedServiceId: 555,
      newEmployeeId: 77,
    });
    expect(result).toMatchObject({ code: "AVAILED_SERVICE_CANCELLED" });
  });

  it("rejects when assigning to the same employee already on the line", async () => {
    mocks.availedServiceFindFirst.mockResolvedValue(
      reassignableLineFixture({
        status: AvailedServiceStatus.CLAIMED,
        served_by_id: 77,
      }),
    );
    const result = await reassignBookingStaffAction({
      availedServiceId: 555,
      newEmployeeId: 77,
    });
    expect(result).toMatchObject({ code: "ALREADY_ASSIGNED_TO_EMPLOYEE" });
  });

  it("rejects when the new employee is not in the actor's business", async () => {
    mocks.availedServiceFindFirst.mockResolvedValue(reassignableLineFixture());
    mocks.employeeFindFirst.mockResolvedValue(null);
    const result = await reassignBookingStaffAction({
      availedServiceId: 555,
      newEmployeeId: 77,
    });
    expect(result).toMatchObject({ code: "EMPLOYEE_NOT_FOUND" });
  });
});

describe("reassignBookingStaffAction — input validation", () => {
  it("rejects non-positive availedServiceId", async () => {
    const result = await reassignBookingStaffAction({
      availedServiceId: 0,
      newEmployeeId: 77,
    });
    expect(result).toMatchObject({ code: "InvalidInput" });
  });

  it("rejects non-positive newEmployeeId", async () => {
    const result = await reassignBookingStaffAction({
      availedServiceId: 555,
      newEmployeeId: -1,
    });
    expect(result).toMatchObject({ code: "InvalidInput" });
  });
});

// ─── Price-adjust action tests ────────────────────────────────────

function priceAdjustBookingFixture(overrides: {
  status?: BookingStatus;
  payment_status?: PaymentStatus;
  grand_total?: number;
  lines?: Array<{ id: number; final_price: number; discount: number }>;
} = {}) {
  return {
    id: 100,
    business_id: "biz_1",
    status: overrides.status ?? BookingStatus.ACCEPTED,
    payment_status: overrides.payment_status ?? PaymentStatus.UNPAID,
    grand_total: overrides.grand_total ?? 1000,
    customer: {
      name: "Jane Cruz",
      email: "jane@example.com",
      phone: "0917-555-1234",
    },
    availed_services: overrides.lines ?? [
      { id: 1, final_price: 400, discount: 0 },
      { id: 2, final_price: 600, discount: 0 },
    ],
  };
}

describe("adjustBookingPriceAction — happy path", () => {
  beforeEach(() => {
    mocks.bookingFindFirst.mockResolvedValue(priceAdjustBookingFixture());
    mocks.bookingPriceAdjustmentCreate.mockResolvedValue({ id: "adj_1" });
    mocks.availedServiceUpdate.mockResolvedValue({});
    mocks.bookingUpdate.mockResolvedValue({});
  });

  it("applies a booking-level discount, writes adjustment row + audit + outbox", async () => {
    const result = await adjustBookingPriceAction({
      bookingId: 100,
      deltaAmount: -100,
      reason: "Loyalty discount",
    });

    expect(result).toMatchObject({
      success: true,
      bookingId: 100,
      availedServiceId: null,
      deltaAmount: -100,
      newGrandTotal: 900,
      adjustmentId: "adj_1",
    });

    expect(mocks.bookingPriceAdjustmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          booking_id: 100,
          availed_service_id: null,
          delta_amount: -100,
          reason: "Loyalty discount",
        }),
      }),
    );

    expect(mocks.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: { grand_total: 900 },
      }),
    );

    // No line update for booking-level adjustments.
    expect(mocks.availedServiceUpdate).not.toHaveBeenCalled();

    expect(mocks.outboxMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: "BOOKING_PRICE_ADJUSTED",
          aggregate_id: "100",
        }),
      }),
    );
  });

  it("applies a line-level discount and shifts the line's final_price + discount", async () => {
    const result = await adjustBookingPriceAction({
      bookingId: 100,
      availedServiceId: 1,
      deltaAmount: -50,
      reason: "Service trim",
    });

    expect(result).toMatchObject({
      success: true,
      availedServiceId: 1,
      newGrandTotal: 950,
    });

    expect(mocks.availedServiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          final_price: 350, // 400 + (-50)
          discount: 50,     // 0 - (-50)
          discount_reason: "MANUAL_ADJUSTMENT",
        }),
      }),
    );
  });

  it("clamps a line's final_price to zero when delta would push it negative", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      priceAdjustBookingFixture({
        grand_total: 100,
        lines: [{ id: 1, final_price: 50, discount: 0 }],
      }),
    );

    await adjustBookingPriceAction({
      bookingId: 100,
      availedServiceId: 1,
      deltaAmount: -50, // makes line and booking exactly zero
      reason: "Comp",
    });

    expect(mocks.availedServiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ final_price: 0 }),
      }),
    );
  });
});

describe("adjustBookingPriceAction — permission gate", () => {
  it("rejects when employee lacks BOOKING_ADJUST_PRICE", async () => {
    mocks.hasStaffPermission.mockReturnValue(false);
    const result = await adjustBookingPriceAction({
      bookingId: 100,
      deltaAmount: -50,
      reason: "x",
    });
    expect(result).toMatchObject({ code: "Forbidden" });
    expect(mocks.bookingPriceAdjustmentCreate).not.toHaveBeenCalled();
  });
});

describe("adjustBookingPriceAction — state-machine guards", () => {
  it("rejects when booking is fully PAID", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      priceAdjustBookingFixture({ payment_status: PaymentStatus.PAID }),
    );
    const result = await adjustBookingPriceAction({
      bookingId: 100,
      deltaAmount: -50,
      reason: "x",
    });
    expect(result).toMatchObject({ code: "BOOKING_FULLY_PAID" });
  });

  it("rejects when booking is not ACCEPTED", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      priceAdjustBookingFixture({ status: BookingStatus.COMPLETED }),
    );
    const result = await adjustBookingPriceAction({
      bookingId: 100,
      deltaAmount: -50,
      reason: "x",
    });
    expect(result).toMatchObject({ code: "BOOKING_NOT_ACCEPTED" });
  });

  it("rejects when delta would make booking total negative", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      priceAdjustBookingFixture({ grand_total: 100 }),
    );
    const result = await adjustBookingPriceAction({
      bookingId: 100,
      deltaAmount: -200,
      reason: "x",
    });
    expect(result).toMatchObject({ code: "RESULTING_TOTAL_NEGATIVE" });
  });

  it("rejects an empty reason", async () => {
    const result = await adjustBookingPriceAction({
      bookingId: 100,
      deltaAmount: -50,
      reason: "   ",
    });
    // zod's `.trim().min(1)` already catches this at the input layer.
    expect(result).toMatchObject({ code: "InvalidInput" });
  });
});

describe("adjustBookingPriceAction — input validation", () => {
  it("rejects non-finite delta", async () => {
    const result = await adjustBookingPriceAction({
      bookingId: 100,
      deltaAmount: Number.POSITIVE_INFINITY,
      reason: "x",
    });
    expect(result).toMatchObject({ code: "InvalidInput" });
  });
});

// ─── Cancel action tests ──────────────────────────────────────────

function cancelBookingFixture(overrides: {
  status?: BookingStatus;
} = {}) {
  return {
    id: 100,
    business_id: "biz_1",
    status: overrides.status ?? BookingStatus.ACCEPTED,
    customer: {
      name: "Jane Cruz",
      email: "jane@example.com",
      phone: "0917-555-1234",
    },
  };
}

describe("cancelBookingAction — happy path", () => {
  beforeEach(() => {
    mocks.bookingFindFirst.mockResolvedValue(cancelBookingFixture());
    mocks.bookingUpdate.mockResolvedValue({
      id: 100,
      cancelled_at: new Date("2026-05-03T18:00:00Z"),
    });
  });

  it("sets soft-cancel fields, writes audit, fires BOOKING_CANCELLED outbox", async () => {
    const result = await cancelBookingAction({
      bookingId: 100,
      reason: "Customer requested",
    });

    expect(result).toMatchObject({
      success: true,
      bookingId: 100,
    });

    expect(mocks.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({
          status: "CANCELLED",
          cancelled_by_id: "user_manager",
          cancellation_reason: "Customer requested",
        }),
      }),
    );

    expect(mocks.outboxMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: "BOOKING_CANCELLED",
          aggregate_id: "100",
        }),
      }),
    );

    // Audit action verb is CANCELLED.
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CANCELLED",
        }),
      }),
    );
  });

  it("trims the reason before storing", async () => {
    await cancelBookingAction({
      bookingId: 100,
      reason: "  Double-booked   ",
    });
    expect(mocks.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cancellation_reason: "Double-booked",
        }),
      }),
    );
  });
});

describe("cancelBookingAction — permission gate", () => {
  it("rejects when employee lacks BOOKING_CANCEL", async () => {
    mocks.hasStaffPermission.mockReturnValue(false);
    const result = await cancelBookingAction({
      bookingId: 100,
      reason: "x",
    });
    expect(result).toMatchObject({ code: "Forbidden" });
    expect(mocks.bookingUpdate).not.toHaveBeenCalled();
  });
});

describe("cancelBookingAction — state-machine guards", () => {
  it("rejects when booking is missing", async () => {
    mocks.bookingFindFirst.mockResolvedValue(null);
    const result = await cancelBookingAction({
      bookingId: 100,
      reason: "x",
    });
    expect(result).toMatchObject({ code: "BOOKING_NOT_FOUND" });
  });

  it("rejects when booking is already CANCELLED", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      cancelBookingFixture({ status: BookingStatus.CANCELLED }),
    );
    const result = await cancelBookingAction({
      bookingId: 100,
      reason: "x",
    });
    expect(result).toMatchObject({ code: "BOOKING_ALREADY_CANCELLED" });
  });

  it("rejects when booking is COMPLETED", async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      cancelBookingFixture({ status: BookingStatus.COMPLETED }),
    );
    const result = await cancelBookingAction({
      bookingId: 100,
      reason: "x",
    });
    expect(result).toMatchObject({ code: "BOOKING_ALREADY_COMPLETED" });
  });
});

describe("cancelBookingAction — input validation", () => {
  it("rejects empty reason at the input layer", async () => {
    const result = await cancelBookingAction({
      bookingId: 100,
      reason: "",
    });
    expect(result).toMatchObject({ code: "InvalidInput" });
  });
});

// ─── Add note action tests ──────────────────────────────────────

describe("addBookingNoteAction — happy path", () => {
  beforeEach(() => {
    mocks.bookingFindFirst.mockResolvedValue({
      id: 100,
      business_id: "biz_1",
    });
    mocks.bookingNoteCreate.mockResolvedValue({ id: "note_1" });
  });

  it("creates an INTERNAL note (default), writes audit + outbox", async () => {
    const result = await addBookingNoteAction({
      bookingId: 100,
      body: "Customer prefers Maria for next visit",
    });

    expect(result).toEqual({
      success: true,
      bookingId: 100,
      noteId: "note_1",
      visibility: "INTERNAL",
    });

    expect(mocks.bookingNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          booking_id: 100,
          body: "Customer prefers Maria for next visit",
          visibility: "INTERNAL",
          created_by_user_id: "user_manager",
        }),
      }),
    );

    expect(mocks.outboxMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: "BOOKING_NOTE_ADDED",
          aggregate_id: "100",
        }),
      }),
    );
  });

  it("creates a CUSTOMER_VISIBLE note when actor has BOOKING_MODIFY", async () => {
    const result = await addBookingNoteAction({
      bookingId: 100,
      body: "Allergic to ammonia bleach",
      visibility: "CUSTOMER_VISIBLE",
    });

    expect(result).toMatchObject({
      success: true,
      visibility: "CUSTOMER_VISIBLE",
    });
  });

  it("trims the body before storing", async () => {
    await addBookingNoteAction({
      bookingId: 100,
      body: "   Watch for allergies   ",
    });
    expect(mocks.bookingNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: "Watch for allergies",
        }),
      }),
    );
  });

  it("truncates the outbox bodyPreview at 140 chars with ellipsis", async () => {
    const long = "x".repeat(200);
    await addBookingNoteAction({
      bookingId: 100,
      body: long,
    });
    const call = mocks.outboxMessageCreate.mock.calls.at(-1);
    const preview = (call?.[0]?.data as { payload: { bodyPreview: string } })
      .payload.bodyPreview;
    expect(preview.length).toBeLessThanOrEqual(140);
    expect(preview.endsWith("…")).toBe(true);
  });
});

describe("addBookingNoteAction — permission gate", () => {
  it("CUSTOMER_VISIBLE requires BOOKING_MODIFY", async () => {
    mocks.hasStaffPermission.mockReturnValue(false);
    const result = await addBookingNoteAction({
      bookingId: 100,
      body: "Visible to customer",
      visibility: "CUSTOMER_VISIBLE",
    });
    expect(result).toMatchObject({ code: "Forbidden" });
    expect(mocks.bookingNoteCreate).not.toHaveBeenCalled();
  });

  it("INTERNAL notes do NOT require BOOKING_MODIFY (any tenant user can add)", async () => {
    // Even when hasStaffPermission returns false, INTERNAL notes
    // should still go through. The permission check is only
    // gated when visibility is CUSTOMER_VISIBLE.
    mocks.hasStaffPermission.mockReturnValue(false);
    mocks.bookingFindFirst.mockResolvedValue({
      id: 100,
      business_id: "biz_1",
    });
    mocks.bookingNoteCreate.mockResolvedValue({ id: "note_2" });

    const result = await addBookingNoteAction({
      bookingId: 100,
      body: "Internal note",
      visibility: "INTERNAL",
    });
    expect(result).toMatchObject({ success: true, visibility: "INTERNAL" });
  });

  it("returns Unauthorized when not signed in", async () => {
    mocks.requireAuth.mockResolvedValue({
      success: false,
      error: "Unauthorized",
    });
    const result = await addBookingNoteAction({
      bookingId: 100,
      body: "x",
    });
    expect(result).toMatchObject({ code: "Unauthorized" });
  });
});

describe("addBookingNoteAction — state-machine guards", () => {
  it("rejects when booking is not in actor's business", async () => {
    mocks.bookingFindFirst.mockResolvedValue(null);
    const result = await addBookingNoteAction({
      bookingId: 100,
      body: "x",
    });
    expect(result).toMatchObject({ code: "BOOKING_NOT_FOUND" });
  });
});

describe("addBookingNoteAction — input validation", () => {
  it("rejects empty body", async () => {
    const result = await addBookingNoteAction({
      bookingId: 100,
      body: "",
    });
    expect(result).toMatchObject({ code: "InvalidInput" });
  });

  it("rejects whitespace-only body", async () => {
    const result = await addBookingNoteAction({
      bookingId: 100,
      body: "   ",
    });
    expect(result).toMatchObject({ code: "InvalidInput" });
  });

  it("rejects non-positive bookingId", async () => {
    const result = await addBookingNoteAction({
      bookingId: 0,
      body: "x",
    });
    expect(result).toMatchObject({ code: "InvalidInput" });
  });
});
