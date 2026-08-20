import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, sendSmsMock } = vi.hoisted(() => ({
  prismaMock: {
    booking: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
  sendSmsMock: vi.fn(),
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/sms", () => ({
  sendSemaphorePrioritySms: sendSmsMock,
  truncateSms: (message: string, max = 160) =>
    message.length <= max ? message : `${message.slice(0, max - 1)}…`,
}));
vi.mock("@/lib/security/booking-success-token", () => ({
  BOOKING_MANAGE_TOKEN_TTL_SECONDS: 100,
  createBookingSuccessToken: () => "token",
}));
vi.mock("@/lib/site-url", () => ({
  toAbsoluteUrl: (path: string) => `https://example.com${path}`,
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { sendBookingConfirmation } from "./send-booking-details";

describe("sendBookingConfirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.booking.update.mockResolvedValue({});
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 125,
      scheduled_at: new Date("2026-08-19T10:00:00Z"),
      grand_total: 1779,
      amount_paid: 355.8,
      payment_status: "PARTIALLY_PAID",
      customer: {
        name: "Daniel Canoy",
        phone: "09951804645",
        email: null,
      },
      business: { name: "BeautyFeel", slug: "beautyfeel" },
      availed_services: [],
    });
  });

  it("sends the formatted confirmation through priority SMS", async () => {
    sendSmsMock.mockResolvedValue({ success: true, messageId: "sms-1" });

    const result = await sendBookingConfirmation(125);

    expect(result).toEqual({ success: true, smsStatus: "sent" });
    expect(sendSmsMock).toHaveBeenCalledWith(
      "09951804645",
      expect.stringContaining("Booking confirmed!\n\nHi Daniel,"),
    );
  });

  it("records Semaphore failure without asking the outbox to retry", async () => {
    sendSmsMock.mockResolvedValue({
      success: false,
      error: "API unavailable",
      failureKind: "UNKNOWN",
    });

    const result = await sendBookingConfirmation(125);

    expect(result).toEqual({ success: true, smsStatus: "failed" });
    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: 125 },
      data: { confirmation_sms_last_error: "UNKNOWN: API unavailable" },
    });
  });

  it("skips SMS when another worker already claimed the booking", async () => {
    prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });

    const result = await sendBookingConfirmation(125);

    expect(result).toEqual({ success: true, smsStatus: "already_attempted" });
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});
