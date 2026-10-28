import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resendSendMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
}));
const prismaMock = vi.hoisted(() => ({
  business: {
    findMany: vi.fn(),
  },
  customer: {
    findMany: vi.fn(),
  },
  outboxMessage: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send: resendSendMock } };
  }),
}));

vi.mock("@react-email/render", () => ({ render: vi.fn(async () => "<p>Fixture re-engagement</p>") }));
vi.mock("@/lib/services/sms", () => ({ sendSemaphoreSms: vi.fn(), truncateSms: (text: string) => text }));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

import { sendReEngagementEmails } from "./re-engagement";

describe("sendReEngagementEmails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.setSystemTime(new Date("2026-09-16T01:00:00Z"));
    vi.stubEnv("RESEND_API_KEY", "fixture-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fixture.example.test");
    resendSendMock.mockResolvedValue({ error: null });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it.each([false, true])("preserves re-engagement delivery outcome with provider failure=%s", async fails => {
    prismaMock.business.findMany.mockResolvedValue([{ id: "biz", name: "Fixture business", slug: "fixture" }]);
    prismaMock.customer.findMany.mockResolvedValue([{ id: "fixture-customer", name: "Fixture Customer", email: "fixture@example.test", phone: null, bookings: [{ id: 1, created_at: new Date("2026-06-01T01:00:00Z") }] }]);
    prismaMock.outboxMessage.findMany.mockResolvedValue([]);
    resendSendMock.mockResolvedValue({ error: fails ? { message: "Fixture provider rejection" } : null });
    const result = await sendReEngagementEmails();
    expect(resendSendMock).toHaveBeenCalledWith({ from: "ServiceFlow <reminders@serviceflow.store>", to: ["fixture@example.test"], subject: "We Miss You at Fixture business!", html: "<p>Fixture re-engagement</p>" });
    expect(result).toMatchObject({ totalProcessed: 1, sent: fails ? 0 : 1, failed: fails ? 1 : 0, duplicateSkips: 0 });
    if (fails) expect(prismaMock.outboxMessage.create).not.toHaveBeenCalled();
    else expect(prismaMock.outboxMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ business_id: "biz", event_type: "RE_ENGAGEMENT_REMINDER_SENT", processed: true, payload: expect.objectContaining({ customerId: "fixture-customer", smsSent: false, emailSent: true }) }) });
  });

  it("skips duplicates when a re-engagement email was already sent after the latest completed booking", async () => {
    prismaMock.business.findMany.mockResolvedValue([
      {
        id: "biz_1",
        name: "Beauty Spot",
        slug: "beauty-spot",
      },
    ]);

    prismaMock.customer.findMany.mockResolvedValue([
      {
        id: "cust_1",
        name: "Ana",
        email: "ana@example.com",
        bookings: [
          {
            id: 101,
            created_at: new Date("2025-10-01T00:00:00.000Z"),
          },
        ],
      },
    ]);

    prismaMock.outboxMessage.findMany.mockResolvedValue([
      {
        aggregate_id: "cust_1",
        created_at: new Date("2025-12-01T00:00:00.000Z"),
      },
    ]);

    const result = await sendReEngagementEmails();

    expect(resendSendMock).not.toHaveBeenCalled();
    expect(prismaMock.outboxMessage.create).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        sent: 0,
        failed: 0,
        duplicateSkips: 1,
      }),
    );
  });
});
