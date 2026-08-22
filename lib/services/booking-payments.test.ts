import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentMethod } from "@/prisma/generated/prisma/enums";

const tx = vi.hoisted(() => ({
  bookingPayment: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  booking: {
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/date-utils", () => ({ getCurrentDateTimePH: () => new Date("2026-08-22T09:00:00Z") }));

import { recordBookingPayment, voidBookingPayment } from "./booking-payments";

describe("booking payment ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.bookingPayment.findUnique.mockResolvedValue(null);
    tx.booking.findFirst.mockResolvedValue({ id: 10, business_id: "biz-1", grand_total: 1000 });
    tx.bookingPayment.aggregate.mockResolvedValue({ _sum: { amount_principal: 200 } });
    tx.bookingPayment.create.mockResolvedValue({ id: 55 });
    tx.booking.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});
  });

  it("records a partial payment and returns the recalculated balance", async () => {
    const result = await recordBookingPayment({
      businessSlug: "salon",
      actorUserId: "staff-1",
      employeeId: 7,
      input: {
        bookingId: 10,
        amount: 300,
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: "f4dbda22-cd8d-4ec2-8078-4ec56cb6cbed",
      },
    });
    expect(result).toMatchObject({ amountPaid: 500, remainingBalance: 500, paymentStatus: "PARTIALLY_PAID" });
    expect(tx.bookingPayment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount_principal: 300, payment_method: "CASH" }) }));
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("rejects overpayment without creating a ledger entry", async () => {
    await expect(recordBookingPayment({
      businessSlug: "salon",
      actorUserId: "staff-1",
      input: { bookingId: 10, amount: 801, paymentMethod: PaymentMethod.CASH, idempotencyKey: "c3bca441-8438-4e9e-9a39-5766736341bc" },
    })).rejects.toThrow("OVERPAYMENT");
    expect(tx.bookingPayment.create).not.toHaveBeenCalled();
  });

  it("voids a successful payment and recalculates booking totals", async () => {
    tx.bookingPayment.findFirst.mockResolvedValue({ id: 55, booking: { id: 10, business_id: "biz-1", grand_total: 1000 } });
    tx.bookingPayment.updateMany.mockResolvedValue({ count: 1 });
    tx.bookingPayment.aggregate.mockResolvedValue({ _sum: { amount_principal: 200 } });
    const result = await voidBookingPayment({ paymentId: 55, reason: "Duplicate entry", businessSlug: "salon", actorUserId: "owner-1" });
    expect(result).toEqual({ amountPaid: 200, paymentStatus: "PARTIALLY_PAID" });
    expect(tx.bookingPayment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELED", void_reason: "Duplicate entry" }) }));
  });
});
