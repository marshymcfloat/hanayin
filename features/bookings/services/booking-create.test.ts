import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBookingWorkflow,
  requireWritableBookingTenant,
} from "./booking-create";
import { BookingAvailabilityError } from "./booking-availability";

const mocks = vi.hoisted(() => ({
  getTenantAccessState: vi.fn(),
  buildBookingPricingSnapshot: vi.fn(),
  resolveStaffSelectionOrThrow: vi.fn(),
  validateBookingOrThrow: vi.fn(),
  recordBookingMetric: vi.fn(),
  createBookingInDb: vi.fn(),
}));

vi.mock("@/prisma/prisma", () => ({ prisma: {} }));
vi.mock("@/features/billing/subscription-service", () => ({
  getTenantAccessState: mocks.getTenantAccessState,
  SUBSCRIPTION_READ_ONLY_ERROR: "SUBSCRIPTION_READ_ONLY",
}));
vi.mock("./booking-pricing", () => ({
  buildBookingPricingSnapshot: mocks.buildBookingPricingSnapshot,
}));
vi.mock("./booking-availability", () => ({
  BookingAvailabilityError: class BookingAvailabilityError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  resolveStaffSelectionOrThrow: mocks.resolveStaffSelectionOrThrow,
  validateBookingOrThrow: mocks.validateBookingOrThrow,
}));
vi.mock("./booking-metrics", () => ({
  recordBookingMetric: mocks.recordBookingMetric,
}));
vi.mock("./booking-persistence", () => ({
  createBookingInDb: mocks.createBookingInDb,
}));

const input = {
  customerName: "John Doe",
  businessSlug: "demo-business",
  scheduledAt: new Date("2026-09-20T02:00:00.000Z"),
  paymentMethod: "CASH" as const,
  paymentType: "FULL" as const,
  services: [{ id: 1, quantity: 1 }],
  isWalkIn: false,
  staffSelectionMode: "ANY_AVAILABLE" as const,
  isAnonymousWalkIn: false,
  forceCreateCustomer: false,
};

const context = {
  businessId: "biz_1",
  isPublicBooking: false,
  allowWalkInCapacityBypass: false,
};

describe("booking creation service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.recordBookingMetric.mockResolvedValue(undefined);
    mocks.resolveStaffSelectionOrThrow.mockResolvedValue({
      assignedEmployeeId: null,
      assignmentDowngraded: false,
    });
    mocks.validateBookingOrThrow.mockResolvedValue(undefined);
    mocks.buildBookingPricingSnapshot.mockResolvedValue({
      services: [
        {
          id: 1,
          quantity: 1,
          duration: 30,
        },
      ],
      estimatedEnd: new Date("2026-09-20T02:30:00.000Z"),
      voucher: null,
      voucherDiscount: 0,
    });
    mocks.createBookingInDb.mockResolvedValue({ id: 123 });
  });

  it("rejects missing and read-only tenants", async () => {
    mocks.getTenantAccessState.mockResolvedValueOnce({
      exists: false,
      readOnly: true,
    });
    await expect(requireWritableBookingTenant("missing")).rejects.toThrow(
      "Business not found",
    );

    mocks.getTenantAccessState.mockResolvedValueOnce({
      exists: true,
      readOnly: true,
      businessId: "biz_1",
    });
    await expect(requireWritableBookingTenant("demo-business")).rejects.toThrow(
      "SUBSCRIPTION_READ_ONLY",
    );
  });

  it("returns the verified tenant identity", async () => {
    mocks.getTenantAccessState.mockResolvedValue({
      exists: true,
      readOnly: false,
      businessId: "biz_1",
    });

    await expect(
      requireWritableBookingTenant("demo-business"),
    ).resolves.toEqual({ businessId: "biz_1" });
  });

  it("runs pricing, availability, and atomic persistence in order", async () => {
    mocks.resolveStaffSelectionOrThrow.mockResolvedValue({
      assignedEmployeeId: null,
      assignmentDowngraded: true,
      warning: "Preferred staff unavailable",
    });

    await expect(createBookingWorkflow(input, context)).resolves.toEqual({
      bookingId: 123,
      warnings: ["Preferred staff unavailable"],
    });
    expect(mocks.buildBookingPricingSnapshot).toHaveBeenCalled();
    expect(mocks.validateBookingOrThrow).toHaveBeenCalled();
    expect(mocks.createBookingInDb).toHaveBeenCalledWith(
      expect.objectContaining({
        businessSlug: "demo-business",
        isPublicBooking: false,
      }),
    );
    expect(mocks.recordBookingMetric).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BOOKING_SUBMIT_SUCCESS" }),
    );
  });

  it("records an availability rejection before propagating it", async () => {
    const rejection = new BookingAvailabilityError(
      "SLOT_JUST_TAKEN",
      "Slot unavailable",
    );
    mocks.validateBookingOrThrow.mockRejectedValue(rejection);

    await expect(createBookingWorkflow(input, context)).rejects.toBe(rejection);
    expect(mocks.recordBookingMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BOOKING_SUBMIT_REJECTION",
        reason: "SLOT_JUST_TAKEN",
      }),
    );
    expect(mocks.createBookingInDb).not.toHaveBeenCalled();
  });
});
