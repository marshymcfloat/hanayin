import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, sendSmsMock, now } = vi.hoisted(() => ({
  prismaMock: {
    booking: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  },
  sendSmsMock: vi.fn(),
  now: new Date("2026-08-19T08:00:00.000Z"),
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/date-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/date-utils")>()),
  getCurrentDateTimePH: () => now,
}));
vi.mock("@/lib/services/sms", () => ({
  sendSemaphorePrioritySms: sendSmsMock,
  truncateSms: (message: string, max = 160) =>
    message.length <= max ? message : `${message.slice(0, max - 1)}…`,
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendBookingReminders } from "./reminders";

describe("sendBookingReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.booking.update.mockResolvedValue({});
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    sendSmsMock.mockResolvedValue({ success: true, messageId: "278100999" });
  });

  it("queries accepted bookings due within the next 30 minutes", async () => {
    await sendBookingReminders();

    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACCEPTED",
          reminder_sent: false,
          scheduled_at: {
            gt: now,
            lte: new Date("2026-08-19T08:30:00.000Z"),
          },
        }),
      }),
    );
  });

  it("does not exclude bookings created less than 30 minutes ago", async () => {
    await sendBookingReminders();

    const query = prismaMock.booking.findMany.mock.calls[0][0];
    expect(query.where).not.toHaveProperty("created_at");
  });

  it("sends the formatted SMS and marks the reminder sent", async () => {
    prismaMock.booking.findMany.mockResolvedValue([
      {
        id: 124,
        created_at: new Date("2026-08-19T07:00:00.000Z"),
        reminder_attempts: 0,
        scheduled_at: new Date("2026-08-19T08:30:00.000Z"),
        customer: { name: "Daniel Canoy", phone: "09951804645" },
        business: { name: "BeautyFeel" },
        availed_services: [],
      },
    ]);

    await sendBookingReminders();

    expect(sendSmsMock).toHaveBeenCalledWith(
      "09951804645",
      expect.stringContaining("Appointment reminder\n\nHi Daniel,"),
    );
    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: 124 },
      data: {
        reminder_sent: true,
        reminder_sent_at: now,
        reminder_message_id: "278100999",
        reminder_last_error: null,
      },
    });
  });

  it("records failed attempts so they remain diagnosable and retryable", async () => {
    prismaMock.booking.findMany.mockResolvedValue([
      {
        id: 125,
        created_at: new Date("2026-08-19T07:00:00.000Z"),
        reminder_attempts: 0,
        scheduled_at: new Date("2026-08-19T08:20:00.000Z"),
        customer: { name: "Daniel", phone: "09951804645" },
        business: { name: "BeautyFeel" },
        availed_services: [],
      },
    ]);
    sendSmsMock.mockResolvedValue({
      success: false,
      error: "Provider unavailable",
    });

    await sendBookingReminders();

    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: 125 },
      data: {
        reminder_last_error: "Provider unavailable",
      },
    });
  });

  it("skips bookings created less than one hour before the appointment", async () => {
    prismaMock.booking.findMany.mockResolvedValue([
      {
        id: 126,
        created_at: new Date("2026-08-19T07:30:01.000Z"),
        reminder_attempts: 0,
        scheduled_at: new Date("2026-08-19T08:30:00.000Z"),
        customer: { name: "Daniel", phone: "09951804645" },
        business: { name: "BeautyFeel" },
        availed_services: [],
      },
    ]);

    const result = await sendBookingReminders();

    expect(result).toMatchObject({ eligible: 0, skippedLeadTime: 1, sent: 0 });
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("allows only one concurrent worker to send a reminder", async () => {
    prismaMock.booking.findMany.mockResolvedValue([
      {
        id: 127,
        created_at: new Date("2026-08-19T07:00:00.000Z"),
        reminder_attempts: 0,
        scheduled_at: new Date("2026-08-19T08:20:00.000Z"),
        customer: { name: "Daniel", phone: "09951804645" },
        business: { name: "BeautyFeel" },
        availed_services: [],
      },
    ]);
    prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });

    const result = await sendBookingReminders();

    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});
