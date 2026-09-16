import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  logCreate: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    outboxMessage: { findUnique: mocks.findUnique, update: mocks.update },
    platformActionLog: { create: mocks.logCreate },
  },
}));

import { retryOutboxMessage, skipOutboxMessage } from "./outbox-admin";

describe("platform outbox administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlatformAdmin.mockResolvedValue({ success: true });
    mocks.logCreate.mockResolvedValue({ id: "log-1" });
  });

  it("resets a failed message and records the administrative transition", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "message-1",
      processed: true,
      attempts: 3,
      last_error: "provider failed",
      event_type: "BOOKING_CONFIRMED",
      business_id: "business-1",
    });
    mocks.update.mockResolvedValue({
      id: "message-1",
      event_type: "BOOKING_CONFIRMED",
      business_id: "business-1",
    });

    const result = await retryOutboxMessage("message-1");

    expect(result.success).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "message-1" },
      data: {
        processed: false,
        processed_at: null,
        attempts: 0,
        last_error: null,
      },
    });
    expect(mocks.logCreate).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/outbox");
  });

  it("does not skip a message that completed successfully", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "message-1",
      processed: true,
      attempts: 1,
      last_error: null,
      event_type: "BOOKING_CONFIRMED",
      business_id: "business-1",
    });

    const result = await skipOutboxMessage({ messageId: "message-1" });

    expect(result).toEqual({
      success: false,
      error: "Message is already processed successfully.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.logCreate).not.toHaveBeenCalled();
  });
});
