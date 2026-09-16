// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentMethod } from "@/prisma/generated/prisma/enums";

const requireAuthMock = vi.hoisted(() => vi.fn());
const resolveActorMock = vi.hoisted(() => vi.fn());
const hasPermissionMock = vi.hoisted(() => vi.fn());
const recordMock = vi.hoisted(() => vi.fn());
const voidMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/guards", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/auth/staff-access", () => ({
  resolveTenantActorContext: resolveActorMock,
  hasStaffPermission: hasPermissionMock,
}));
vi.mock("@/lib/services/booking-payments", () => ({
  recordBookingPayment: recordMock,
  voidBookingPayment: voidMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { recordBookingPaymentAction, voidBookingPaymentAction } from "./booking-payments";

const input = {
  bookingId: 10,
  amount: 100,
  paymentMethod: PaymentMethod.CASH,
  idempotencyKey: "2cb525d4-4127-4d46-b30e-7f375f4fe387",
};

describe("booking payment actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ success: true, businessSlug: "salon", session: { user: { id: "staff-1", role: "EMPLOYEE" } } });
    resolveActorMock.mockResolvedValue({ success: true, actorType: "EMPLOYEE", employeeId: 7 });
    hasPermissionMock.mockReturnValue(true);
    recordMock.mockResolvedValue({ amountPaid: 100, remainingBalance: 900, paymentStatus: "PARTIALLY_PAID" });
  });

  it("blocks employees without collection permission", async () => {
    hasPermissionMock.mockReturnValue(false);
    await expect(recordBookingPaymentAction(input)).resolves.toEqual({ success: false, error: "Forbidden" });
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("requires a reference for GCash entries", async () => {
    const result = await recordBookingPaymentAction({ ...input, paymentMethod: PaymentMethod.GCASH });
    expect(result).toEqual({ success: false, error: "GCash reference is required." });
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("allows explicitly authorized staff to record a partial payment", async () => {
    const result = await recordBookingPaymentAction(input);
    expect(result).toMatchObject({ success: true, paymentStatus: "PARTIALLY_PAID" });
    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 7, businessSlug: "salon" }));
  });

  it("keeps payment voiding owner-only", async () => {
    const result = await voidBookingPaymentAction({ paymentId: 1, reason: "Duplicate" });
    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(voidMock).not.toHaveBeenCalled();
  });
});
