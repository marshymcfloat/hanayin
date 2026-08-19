import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBooking } from "./booking";

const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/booking", () => ({
  createBookingInDb: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/utils/pricing", () => ({
  calculateBookingTotal: vi.fn(
    ({ subtotal, voucherDiscount }) => subtotal - voucherDiscount,
  ),
}));

vi.mock("@/lib/services/booking-pricing", () => ({
  buildBookingPricingSnapshot: vi.fn(),
}));

vi.mock("@/lib/services/booking-availability", () => ({
  resolveStaffSelectionOrThrow: vi.fn(),
  validateBookingOrThrow: vi.fn(),
  BookingAvailabilityError: class BookingAvailabilityError extends Error {
    code: string;
    alternatives: unknown[];
    constructor(code: string, message: string, alternatives: unknown[] = []) {
      super(message);
      this.code = code;
      this.alternatives = alternatives;
    }
  },
}));
vi.mock("@/lib/services/booking-metrics", () => ({
  recordBookingMetric: vi.fn(),
}));

import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createBookingInDb } from "@/lib/services/booking";
import { buildBookingPricingSnapshot } from "@/lib/services/booking-pricing";
import {
  resolveStaffSelectionOrThrow,
  validateBookingOrThrow,
} from "@/lib/services/booking-availability";

const mockedHeaders = vi.mocked(headers);
const mockedGetServerSession = vi.mocked(getServerSession);
const mockedRateLimit = vi.mocked(rateLimit);
const mockedBuildBookingPricingSnapshot = vi.mocked(buildBookingPricingSnapshot);
const mockedCreateBookingInDb = vi.mocked(createBookingInDb);
const mockedBusinessFindUnique = vi.mocked(prismaMock.business.findUnique);
const mockedResolveStaffSelectionOrThrow = vi.mocked(resolveStaffSelectionOrThrow);
const mockedValidateBookingOrThrow = vi.mocked(validateBookingOrThrow);

describe("createBooking Server Action", () => {
  const mockDate = new Date("2024-01-01T10:00:00Z");

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.BOOKING_SUCCESS_TOKEN_SECRET = "booking-test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://demo.serviceflow.test";

    mockedHeaders.mockResolvedValue({
      get: vi.fn((key: string) => {
        if (key === "x-forwarded-for") return "203.0.113.10";
        if (key === "host") return "malicious.example.com";
        if (key === "x-forwarded-proto") return "http";
        return null;
      }),
    } as never);

    mockedGetServerSession.mockResolvedValue({
      user: { id: "owner_1" },
    } as never);
    mockedRateLimit.mockResolvedValue({
      success: true,
      limit: 8,
      remaining: 7,
      reset: Date.now() + 1_000,
    });
    mockedBusinessFindUnique.mockResolvedValue({
      id: "biz_1",
      slug: "demo-business",
      subscriptions: [],
    });
    mockedResolveStaffSelectionOrThrow.mockResolvedValue({
      assignedEmployeeId: null,
      assignmentDowngraded: false,
    });
    mockedValidateBookingOrThrow.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create a CASH booking successfully", async () => {
    const mockBusiness = {
      id: "biz_1",
      slug: "demo-business",
      name: "Demo Business",
      commission_calculation_basis: "ORIGINAL_PRICE" as const,
    };

    mockedBuildBookingPricingSnapshot.mockResolvedValue({
      business: mockBusiness,
      services: [
        {
          id: 1,
          name: "Haircut",
          quantity: 1,
          duration: 30,
          price: 500,
          originalPrice: 500,
          estimatedCost: 200,
          discount: 0,
          discountReason: null,
          saleEventId: null,
          commissionBase: 500,
        },
      ],
      subtotal: 500,
      voucherDiscount: 0,
      grandTotal: 500,
      appliedSaleEventId: null,
      downpaymentAmount: null,
      amountToPay: 500,
      totalDuration: 30,
      estimatedEnd: new Date(mockDate.getTime() + 30 * 60 * 1000),
      voucher: null,
    });

    mockedCreateBookingInDb.mockResolvedValue({
      id: 123,
    } as never);

    const result = await createBooking({
      customerName: "John Doe",
      businessSlug: "demo-business",
      scheduledAt: mockDate,
      paymentMethod: "CASH",
      paymentType: "FULL",
      services: [
        {
          id: 1,
          quantity: 1,
        },
      ],
      email: "john@example.com",
      phone: "+639171234567",
    });

    expect(buildBookingPricingSnapshot).toHaveBeenCalled();
    expect(createBookingInDb).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: "CASH",
        email: "john@example.com",
        phone: "+639171234567",
      }),
    );
    expect(result).toEqual({
      type: "internal",
      url: "/app/demo-business/bookings/123?created=true",
    });
  });

  it("should return warning when preferred staff is downgraded to any available", async () => {
    const mockBusiness = {
      id: "biz_1",
      slug: "demo-business",
      name: "Demo Business",
      commission_calculation_basis: "ORIGINAL_PRICE" as const,
    };

    mockedBuildBookingPricingSnapshot.mockResolvedValue({
      business: mockBusiness,
      services: [
        {
          id: 1,
          name: "Haircut",
          quantity: 1,
          duration: 30,
          price: 500,
          originalPrice: 500,
          estimatedCost: 200,
          discount: 0,
          discountReason: null,
          saleEventId: null,
          commissionBase: 500,
        },
      ],
      subtotal: 500,
      voucherDiscount: 0,
      grandTotal: 500,
      appliedSaleEventId: null,
      downpaymentAmount: null,
      amountToPay: 500,
      totalDuration: 30,
      estimatedEnd: new Date(mockDate.getTime() + 30 * 60 * 1000),
      voucher: null,
    });

    mockedResolveStaffSelectionOrThrow.mockResolvedValueOnce({
      assignedEmployeeId: null,
      assignmentDowngraded: true,
      warning: "Preferred staff unavailable; booking kept with any available provider.",
    });

    mockedCreateBookingInDb.mockResolvedValue({
      id: 456,
    } as never);

    const result = await createBooking({
      customerName: "John Doe",
      businessSlug: "demo-business",
      scheduledAt: mockDate,
      paymentMethod: "CASH",
      paymentType: "FULL",
      employeeId: 999,
      staffSelectionMode: "PREFER_SELECTED",
      services: [
        {
          id: 1,
          quantity: 1,
        },
      ],
      email: "john@example.com",
      phone: "+639171234567",
    });

    expect(result).toEqual({
      type: "internal",
      url: "/app/demo-business/bookings/456?created=true",
      warnings: [
        "Preferred staff unavailable; booking kept with any available provider.",
      ],
    });
  });

  it("should return a client-safe rate-limit error", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    mockedRateLimit.mockResolvedValue({
      success: false,
      limit: 8,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    await expect(
      createBooking({
        customerName: "John Doe",
        businessSlug: "demo-business",
        scheduledAt: mockDate,
        paymentMethod: "CASH",
        paymentType: "FULL",
        services: [{ id: 1, quantity: 1 }],
        email: "john@example.com",
      }),
    ).resolves.toEqual({
      type: "error",
      code: "Too many booking attempts. Please wait a few minutes and try again.",
    });

    expect(mockedBuildBookingPricingSnapshot).not.toHaveBeenCalled();
  });

  it("should return a client-safe error if business is not found", async () => {
    mockedBusinessFindUnique.mockResolvedValueOnce(null);

    await expect(
      createBooking({
        customerName: "John",
        businessSlug: "invalid-slug",
        scheduledAt: mockDate,
        paymentMethod: "CASH",
        paymentType: "FULL",
        services: [],
      }),
    ).resolves.toEqual({ type: "error", code: "Business not found" });

    expect(mockedBuildBookingPricingSnapshot).not.toHaveBeenCalled();
  });

  it("does not expose unexpected server errors to public clients", async () => {
    mockedBuildBookingPricingSnapshot.mockRejectedValueOnce(
      new Error("Database connection includes sensitive details"),
    );

    await expect(
      createBooking({
        customerName: "John Doe",
        businessSlug: "demo-business",
        scheduledAt: mockDate,
        paymentMethod: "CASH",
        paymentType: "FULL",
        services: [{ id: 1, quantity: 1 }],
      }),
    ).resolves.toEqual({ type: "error", code: "BOOKING_FAILED" });
  });
});
