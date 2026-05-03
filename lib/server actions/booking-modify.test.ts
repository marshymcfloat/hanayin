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
  availedServiceDelete: vi.fn(),
  bookingUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  outboxMessageCreate: vi.fn(),
  revalidatePath: vi.fn(),
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
      update: mocks.bookingUpdate,
    },
    availedService: {
      delete: mocks.availedServiceDelete,
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
      $transaction: async <T>(fn: (tx: typeof txDelegate) => Promise<T>) =>
        fn(txDelegate),
    },
  };
});

import { removeBookingServiceAction } from "./booking-modify";

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
