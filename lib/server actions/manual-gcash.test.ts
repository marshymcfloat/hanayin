import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => ({
  prismaMock: { $transaction: vi.fn() },
  txMock: {
    bookingPayment: { findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    booking: { update: vi.fn(), updateMany: vi.fn() },
    availedService: { updateMany: vi.fn() },
    voucher: { updateMany: vi.fn() },
  },
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/security/booking-success-token", () => ({ verifyBookingSuccessToken: vi.fn(() => true) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/staff-access", () => ({
  resolveTenantActorContext: vi.fn(),
}));
vi.mock("@/lib/services/booking-availability", () => ({
  validateBookingOrThrow: vi.fn(),
  BookingAvailabilityError: class BookingAvailabilityError extends Error {},
}));
vi.mock("@/lib/services/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/services/outbox", () => ({ publishEvent: vi.fn() }));

import { getServerSession } from "next-auth";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { validateBookingOrThrow } from "@/lib/services/booking-availability";
import { publishEvent } from "@/lib/services/outbox";
import { approveGcashPaymentAction, submitGcashPaymentAction } from "./manual-gcash";

describe("manual GCash payment submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock));
    txMock.bookingPayment.count.mockResolvedValue(0);
    txMock.bookingPayment.updateMany.mockResolvedValue({ count: 1 });
    txMock.booking.update.mockResolvedValue({});
    txMock.booking.updateMany.mockResolvedValue({ count: 1 });
    txMock.availedService.updateMany.mockResolvedValue({ count: 1 });
    txMock.voucher.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(validateBookingOrThrow).mockResolvedValue(undefined);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "owner_1" } } as never);
    vi.mocked(resolveTenantActorContext).mockResolvedValue({
      success: true,
      actorType: "OWNER",
      businessId: "biz",
      businessSlug: "salon",
      userId: "owner_1",
      ownerId: 1,
      employeeId: null,
      role: "OWNER",
      profile: null,
      permissions: [],
      businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true },
    } as never);
  });

  it("extends a valid hold once and stores optional matching details", async () => {
    txMock.bookingPayment.findFirst.mockResolvedValue({
      id: 9,
      status: "PENDING",
      submitted_at: null,
      expires_at: new Date(Date.now() + 60_000),
      booking: { id: 4, status: "HOLD", business_id: "biz", business: { slug: "salon" } },
    });
    const result = await submitGcashPaymentAction({ bookingId: 4, businessSlug: "salon", token: "valid", payerName: "  Ana  Dela Cruz ", reference: " ab 123 " });
    expect(result.success).toBe(true);
    expect(txMock.bookingPayment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payer_name: "Ana Dela Cruz", provider_reference: "AB 123" }) }));
    expect(txMock.booking.update).toHaveBeenCalledTimes(1);
  });

  it("is idempotent after payment was already submitted", async () => {
    txMock.bookingPayment.findFirst.mockResolvedValue({
      id: 9,
      submitted_at: new Date(),
      booking: { status: "HOLD", business: { slug: "salon" } },
    });
    const result = await submitGcashPaymentAction({ bookingId: 4, businessSlug: "salon", token: "valid" });
    expect(result).toMatchObject({ success: true, idempotent: true });
    expect(txMock.bookingPayment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an expired hold", async () => {
    txMock.bookingPayment.findFirst.mockResolvedValue({
      id: 9,
      submitted_at: null,
      expires_at: new Date(Date.now() - 1),
      booking: { status: "HOLD", business: { slug: "salon" } },
    });
    const result = await submitGcashPaymentAction({ bookingId: 4, businessSlug: "salon", token: "valid" });
    expect(result).toEqual({ success: false, error: "This payment window has expired." });
  });

  it("rejects verification by employees even with legacy permission grants", async () => {
    vi.mocked(resolveTenantActorContext).mockResolvedValue({
      success: true,
      actorType: "EMPLOYEE",
      permissions: ["PAYMENT_VERIFY"],
    } as never);

    const result = await approveGcashPaymentAction({
      paymentId: 9,
      businessSlug: "salon",
      attestation: { transactionFound: true, recipientMatched: true, amountMatched: true, detailsReviewed: true },
    });

    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("requires every owner verification attestation", async () => {
    const result = await approveGcashPaymentAction({
      paymentId: 9,
      businessSlug: "salon",
      attestation: { transactionFound: true, recipientMatched: true, amountMatched: false, detailsReviewed: true },
    });

    expect(result).toEqual({ success: false, error: "Complete every verification check before confirming." });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("atomically confirms a valid owner-verified deposit", async () => {
    txMock.bookingPayment.findFirst.mockResolvedValue({
      id: 9,
      booking_id: 4,
      status: "PENDING",
      amount_principal: 200,
      expires_at: new Date(Date.now() + 60_000),
      booking: {
        id: 4,
        status: "HOLD",
        business_id: "biz",
        grand_total: 1000,
        scheduled_at: new Date(Date.now() + 86_400_000),
        created_at: new Date(),
        estimated_end: new Date(Date.now() + 90_000_000),
        customer: { name: "Ana", email: null },
        business: { slug: "salon" },
        availed_services: [{ service_id: 2, served_by_id: null, service: { id: 2 } }],
      },
    });
    txMock.bookingPayment.updateMany.mockResolvedValue({ count: 1 });

    const result = await approveGcashPaymentAction({
      paymentId: 9,
      businessSlug: "salon",
      attestation: { transactionFound: true, recipientMatched: true, amountMatched: true, detailsReviewed: true },
    });

    expect(result).toEqual({ success: true });
    expect(validateBookingOrThrow).toHaveBeenCalled();
    expect(txMock.booking.updateMany).toHaveBeenCalledTimes(2);
    expect(publishEvent).toHaveBeenCalledTimes(1);
  });

  it("does not confirm when expiry wins the booking transition", async () => {
    txMock.bookingPayment.findFirst.mockResolvedValue({
      id: 9,
      booking_id: 4,
      amount_principal: 200,
      expires_at: new Date(Date.now() + 60_000),
      booking: {
        id: 4,
        business_id: "biz",
        grand_total: 1000,
        scheduled_at: new Date(Date.now() + 86_400_000),
        created_at: new Date(),
        customer: null,
        business: { slug: "salon" },
        availed_services: [{ service_id: 2, served_by_id: null, service: { id: 2 } }],
      },
    });
    txMock.booking.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await approveGcashPaymentAction({
      paymentId: 9,
      businessSlug: "salon",
      attestation: { transactionFound: true, recipientMatched: true, amountMatched: true, detailsReviewed: true },
    });

    expect(result).toEqual({ success: false, error: "Payment is no longer available for approval." });
    expect(publishEvent).not.toHaveBeenCalled();
  });
});
