import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  business: { findUnique: vi.fn() },
  bookingPayment: { findMany: vi.fn() },
}));
vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));

import { getOwnerGcashReviewQueue } from "./manual-gcash";

describe("owner GCash review queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.business.findUnique.mockResolvedValue({
      id: "verified-business",
      gcash_account_name: "Salon",
      gcash_mobile_number: "09170000000",
    });
    prismaMock.bookingPayment.findMany.mockResolvedValue([]);
  });

  it("scopes both queues to the verified business and serializes only review fields", async () => {
    prismaMock.bookingPayment.findMany
      .mockResolvedValueOnce([{
        id: 4,
        amount_principal: 200,
        payer_name: "Ana",
        provider_reference: "REF-1",
        submitted_at: new Date("2026-09-01T01:00:00.000Z"),
        expires_at: new Date("2026-09-01T05:00:00.000Z"),
        escalated_at: null,
        escalation_reason: null,
        booking: {
          id: 7,
          scheduled_at: new Date("2026-09-02T03:00:00.000Z"),
          customer_label: null,
          customer: { name: "Ana", phone: "09171111111" },
          availed_services: [{ service: { name: "Haircut" } }],
        },
      }])
      .mockResolvedValueOnce([{
        id: 5,
        amount_principal: 300,
        payer_name: "Ben",
        provider_reference: null,
        submitted_at: null,
        follow_up_required_at: new Date("2026-09-01T06:00:00.000Z"),
        escalation_reason: "Check receipt",
        booking: {
          id: 8,
          scheduled_at: null,
          customer_label: "Ben",
          customer: null,
        },
      }]);

    const queue = await getOwnerGcashReviewQueue({ businessId: "verified-business" });
    expect(prismaMock.business.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "verified-business" },
    }));
    expect(prismaMock.bookingPayment.findMany).toHaveBeenCalledTimes(2);
    for (const [call] of prismaMock.bookingPayment.findMany.mock.calls) {
      expect(call.where.booking.business_id).toBe("verified-business");
      expect(call.select).toBeDefined();
      expect(call.include).toBeUndefined();
    }
    expect(queue.verificationItems[0]).toMatchObject({
      id: 4,
      stage: "AWAITING_VERIFICATION",
      submittedAt: "2026-09-01T01:00:00.000Z",
      expiresAt: "2026-09-01T05:00:00.000Z",
      destination: { accountName: "Salon", mobileNumber: "09170000000" },
      booking: { scheduledAt: "2026-09-02T03:00:00.000Z", services: ["Haircut"] },
    });
    expect(queue.followUpItems[0]).toMatchObject({
      id: 5,
      submittedAt: null,
      followUpRequiredAt: "2026-09-01T06:00:00.000Z",
      booking: { scheduledAt: null, customerName: "Ben" },
    });
  });

  it("does not query payments when the verified business lacks a GCash destination", async () => {
    prismaMock.business.findUnique.mockResolvedValueOnce(null);
    await expect(getOwnerGcashReviewQueue({ businessId: "other" })).rejects.toThrow("GCASH_NOT_CONFIGURED");
    expect(prismaMock.bookingPayment.findMany).not.toHaveBeenCalled();
  });
});
