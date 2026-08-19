import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, deliverMock } = vi.hoisted(() => ({
  prismaMock: {
    outboxMessage: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
  deliverMock: vi.fn(),
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/outbox-delivery", () => ({
  deliverOutboxEvent: deliverMock,
  isNonRetryableOutboxError: () => false,
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { deliverOutboxMessageNow } from "./outbox-immediate";

const event = {
  id: "event-1",
  event_type: "BOOKING_CONFIRMED",
  aggregate_type: "Booking",
  aggregate_id: "125",
  business_id: "business-1",
  payload: { bookingId: 125, status: "ACCEPTED" },
  processed: false,
  processed_at: null,
  attempts: 0,
  last_error: null,
  created_at: new Date(),
};

describe("deliverOutboxMessageNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.outboxMessage.findUnique.mockResolvedValue(event);
    prismaMock.outboxMessage.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.outboxMessage.update.mockResolvedValue({});
    deliverMock.mockResolvedValue(undefined);
  });

  it("claims and delivers a pending event immediately", async () => {
    const result = await deliverOutboxMessageNow(event.id);

    expect(result).toMatchObject({ delivered: true });
    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "BOOKING_CONFIRMED",
        outboxMessageId: event.id,
      }),
    );
    expect(prismaMock.outboxMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processed: true, last_error: null }),
      }),
    );
  });

  it("leaves a failed delivery pending for cron retry", async () => {
    deliverMock.mockRejectedValue(new Error("Semaphore unavailable"));

    const result = await deliverOutboxMessageNow(event.id);

    expect(result).toMatchObject({ delivered: false });
    expect(prismaMock.outboxMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processed: false,
          last_error: "Semaphore unavailable",
        }),
      }),
    );
  });

  it("does not deliver when another worker wins the claim", async () => {
    prismaMock.outboxMessage.updateMany.mockResolvedValue({ count: 0 });

    const result = await deliverOutboxMessageNow(event.id);

    expect(result).toMatchObject({ delivered: false, skipped: true });
    expect(deliverMock).not.toHaveBeenCalled();
  });
});
