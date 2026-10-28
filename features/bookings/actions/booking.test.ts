// Colocated action regression test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBooking } from "./booking";
vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
  },
}));

const staffAccessMock = vi.hoisted(() => ({
  resolveTenantActorContext: vi.fn(),
  hasStaffPermission: vi.fn(),
}));
const otpMock = vi.hoisted(() => ({ resolveCustomerTrust: vi.fn() }));
vi.mock("@/features/bookings/services/booking-otp", () => otpMock);

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/staff-access", () => staffAccessMock);

vi.mock("@/features/bookings/services/booking-persistence", () => ({
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

vi.mock("@/features/bookings/services/booking-pricing", () => ({
  buildBookingPricingSnapshot: vi.fn(),
}));

vi.mock("@/features/bookings/services/booking-availability", () => ({
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
vi.mock("@/features/bookings/services/booking-metrics", () => ({
  recordBookingMetric: vi.fn(),
}));

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createBookingInDb } from "@/features/bookings/services/booking-persistence";
import { buildBookingPricingSnapshot } from "@/features/bookings/services/booking-pricing";
import {
  resolveStaffSelectionOrThrow,
  validateBookingOrThrow,
} from "@/features/bookings/services/booking-availability";

const mockedHeaders = vi.mocked(headers);
const mockedGetServerSession = vi.mocked(getServerSession);
const mockedRateLimit = vi.mocked(rateLimit);
const mockedBuildBookingPricingSnapshot = vi.mocked(buildBookingPricingSnapshot);
const mockedCreateBookingInDb = vi.mocked(createBookingInDb);
const mockedBusinessFindUnique = vi.mocked(prismaMock.business.findUnique);
const mockedResolveStaffSelectionOrThrow = vi.mocked(resolveStaffSelectionOrThrow);
const mockedValidateBookingOrThrow = vi.mocked(validateBookingOrThrow);
const mockedRevalidatePath = vi.mocked(revalidatePath);

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
      user: { id: "owner_1", role: "OWNER", businessSlug: "demo-business" },
    } as never);
    staffAccessMock.resolveTenantActorContext.mockResolvedValue({
      success: true,
      actorType: "OWNER",
      businessId: "biz_1",
      businessSlug: "demo-business",
      ownerId: 1,
      userId: "owner_1",
    });
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
    staffAccessMock.hasStaffPermission.mockReturnValue(true);
    otpMock.resolveCustomerTrust.mockResolvedValue({ tier: "NEW", requiresOtp: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects malformed input before accessing persistence", async () => {
    await expect(
      createBooking({
        customerName: "John Doe",
        businessSlug: "demo-business",
        scheduledAt: mockDate,
        paymentMethod: "CASH",
        paymentType: "FULL",
        services: [],
      }),
    ).resolves.toEqual({ type: "error", code: "INVALID_BOOKING_INPUT" });

    expect(mockedBusinessFindUnique).not.toHaveBeenCalled();
    expect(mockedCreateBookingInDb).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a revoked owner before reading the writable tenant or creating a booking", async () => {
    staffAccessMock.resolveTenantActorContext.mockResolvedValue({ success: false });
    const result = await createBooking({
      customerName: "John Doe",
      businessSlug: "demo-business",
      scheduledAt: mockDate,
      paymentMethod: "CASH",
      paymentType: "FULL",
      services: [{ id: 1, quantity: 1 }],
    });
    expect(result).toEqual({ type: "error", code: "BOOKING_FAILED" });
    expect(staffAccessMock.resolveTenantActorContext).toHaveBeenCalledWith("demo-business", "owner_1");
    expect(mockedBusinessFindUnique).not.toHaveBeenCalled();
    expect(mockedCreateBookingInDb).not.toHaveBeenCalled();
  });

  it("should create a CASH booking successfully", async () => {
    const mockBusiness = {
      id: "biz_1",
      slug: "demo-business",
      name: "Demo Business",
      commission_calculation_basis: "ORIGINAL_PRICE" as const,
    };

    mockedBuildBookingPricingSnapshot.mockResolvedValue({
      appliedOffers: [], packageSnapshots: [], quoteFingerprint: "a".repeat(64), voucherOutcome: "NONE",
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
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/app/demo-business");
  });

  it("automatically bypasses capacity for an owner-created walk-in", async () => {
    mockedBuildBookingPricingSnapshot.mockResolvedValue({
      appliedOffers: [], packageSnapshots: [], quoteFingerprint: "a".repeat(64), voucherOutcome: "NONE",
      business: {
        id: "biz_1",
        slug: "demo-business",
        name: "Demo Business",
        commission_calculation_basis: "ORIGINAL_PRICE" as const,
      },
      services: [{
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
      }],
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
    mockedCreateBookingInDb.mockResolvedValue({ id: 124 } as never);

    await createBooking({
      customerName: "Walk-in Customer",
      businessSlug: "demo-business",
      scheduledAt: mockDate,
      paymentMethod: "CASH",
      paymentType: "FULL",
      services: [{ id: 1, quantity: 1 }],
      isWalkIn: true,
    });

    expect(mockedValidateBookingOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ allowWalkInCapacityBypass: true }),
    );
    expect(mockedCreateBookingInDb).toHaveBeenCalledWith(
      expect.objectContaining({ allowWalkInCapacityBypass: true }),
    );
  });

  it("derives the claiming employee from verified tenant context", async () => {
    mockedGetServerSession.mockResolvedValue({
      user: {
        id: "employee_user_1",
        role: "EMPLOYEE",
        businessSlug: "demo-business",
      },
    } as never);
    staffAccessMock.resolveTenantActorContext.mockResolvedValue({
      success: true,
      actorType: "EMPLOYEE",
      employeeId: 42,
    });
    mockedBuildBookingPricingSnapshot.mockResolvedValue({
      appliedOffers: [],
      packageSnapshots: [],
      quoteFingerprint: "a".repeat(64),
      voucherOutcome: "NONE",
      business: {
        id: "biz_1",
        slug: "demo-business",
        name: "Demo Business",
        commission_calculation_basis: "ORIGINAL_PRICE" as const,
      },
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
    mockedCreateBookingInDb.mockResolvedValue({ id: 125 } as never);

    await createBooking({
      customerName: "Employee Customer",
      businessSlug: "demo-business",
      scheduledAt: mockDate,
      currentEmployeeId: 999,
      paymentMethod: "CASH",
      paymentType: "FULL",
      services: [
        { id: 1, quantity: 1, claimedByCurrentEmployee: true },
      ],
    });

    expect(mockedCreateBookingInDb).toHaveBeenCalledWith(
      expect.objectContaining({ currentEmployeeId: 42 }),
    );
  });

  it("should return warning when preferred staff is downgraded to any available", async () => {
    const mockBusiness = {
      id: "biz_1",
      slug: "demo-business",
      name: "Demo Business",
      commission_calculation_basis: "ORIGINAL_PRICE" as const,
    };

    mockedBuildBookingPricingSnapshot.mockResolvedValue({
      appliedOffers: [], packageSnapshots: [], quoteFingerprint: "a".repeat(64), voucherOutcome: "NONE",
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
    mockedGetServerSession.mockResolvedValueOnce(null);
    mockedBusinessFindUnique.mockResolvedValueOnce(null);

    await expect(
      createBooking({
        customerName: "John",
        businessSlug: "invalid-slug",
        scheduledAt: mockDate,
        paymentMethod: "CASH",
        paymentType: "FULL",
        services: [{ id: 1, quantity: 1 }],
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

  it("requires signed ownership proof, not just a public verification ID", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    await expect(createBooking({
      customerName: "Customer", businessSlug: "demo-business", scheduledAt: mockDate,
      paymentMethod: "ONLINE", paymentType: "DOWNPAYMENT", phone: "09171234567",
      otpVerificationId: 7, services: [{ id: 1, quantity: 1 }],
    })).resolves.toEqual({ type: "error", code: "OTP_REQUIRED" });
    expect(mockedCreateBookingInDb).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("passes public signed proof through the workflow to transactional persistence", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    mockedBuildBookingPricingSnapshot.mockResolvedValue({
      services: [], estimatedEnd: mockDate, voucher: null, voucherDiscount: 0,
    } as never);
    mockedCreateBookingInDb.mockResolvedValue({ id: 123 } as never);
    await expect(createBooking({
      customerName: "Customer", businessSlug: "demo-business", scheduledAt: mockDate,
      paymentMethod: "ONLINE", paymentType: "DOWNPAYMENT", phone: "09171234567",
      otpVerificationId: 7, otpVerificationToken: "opaque-signed-proof",
      services: [{ id: 1, quantity: 1 }],
    })).resolves.toMatchObject({ type: "internal", url: expect.stringContaining("/booking/success?bookingId=123&token=") });
    expect(mockedCreateBookingInDb).toHaveBeenCalledWith(expect.objectContaining({
      isPublicBooking: true, otpVerificationId: 7, otpVerificationToken: "opaque-signed-proof",
    }));
  });
});
