import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resendSendMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));
const getBusinessEntitlementsBySlugMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  serviceFlow: {
    findMany: vi.fn(),
  },
  availedService: {
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

vi.mock("@react-email/render", () => ({ render: vi.fn(async () => "<p>Fixture reminder</p>") }));
vi.mock("@/lib/services/sms", () => ({ sendSemaphoreSms: vi.fn(), truncateSms: (text: string) => text }));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/features/billing/plan-entitlements", () => ({
  getBusinessEntitlementsBySlug: getBusinessEntitlementsBySlugMock,
}));

import { sendFlowReminders } from "./flow-reminders";

describe("sendFlowReminders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.setSystemTime(new Date("2026-09-16T01:00:00Z"));
    vi.stubEnv("RESEND_API_KEY", "fixture-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fixture.example.test");
    resendSendMock.mockResolvedValue({ error: null });
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: true,
      growth: false,
      social: false,
      ai: false,
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it.each([false, true])("preserves reminder delivery outcome with provider failure=%s", async fails => {
    prismaMock.serviceFlow.findMany.mockResolvedValue([{ id: "flow", business_id: "biz", delay_duration: 1, delay_unit: "DAYS", type: "REQUIRED", trigger_service_id: 1, trigger_service: { name: "Fixture initial" }, suggested_service: { name: "Fixture follow-up" } }]);
    prismaMock.availedService.findMany.mockResolvedValue([{ completed_at: new Date("2026-09-15T01:00:00Z"), booking: { customer_id: "fixture-customer", business_id: "biz", customer: { name: "Fixture Customer", email: "fixture@example.test", phone: null }, business: { name: "Fixture business", slug: "fixture" } } }]);
    prismaMock.outboxMessage.findMany.mockResolvedValue([]);
    resendSendMock.mockResolvedValue({ error: fails ? { message: "Fixture provider rejection" } : null });
    const result = await sendFlowReminders();
    expect(resendSendMock).toHaveBeenCalledWith({ from: "ServiceFlow <reminders@serviceflow.store>", to: ["fixture@example.test"], subject: "Action Required: Next step for your Fixture initial", html: "<p>Fixture reminder</p>" });
    expect(result).toMatchObject({ emails_sent: fails ? 0 : 1, duplicate_skips: 0 });
    if (fails) expect(prismaMock.outboxMessage.create).not.toHaveBeenCalled();
    else expect(prismaMock.outboxMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ business_id: "biz", event_type: "FLOW_REMINDER_SENT", processed: true, payload: expect.objectContaining({ customerId: "fixture-customer", smsSent: false, emailSent: true }) }) });
  });

  it("skips sending when same flow/customer was already reminded today", async () => {
    prismaMock.serviceFlow.findMany.mockResolvedValue([
      {
        id: "flow_1",
        business_id: "biz_1",
        delay_duration: 1,
        delay_unit: "DAYS",
        type: "REQUIRED",
        trigger_service_id: 100,
        trigger_service: { name: "Facial" },
        suggested_service: { name: "Hydration Boost" },
      },
    ]);

    prismaMock.availedService.findMany.mockResolvedValue([
      {
        completed_at: new Date("2026-02-01T08:00:00.000Z"),
        booking: {
          customer_id: "cust_1",
          customer: {
            name: "Ana",
            email: "ana@example.com",
          },
          business: {
            name: "Beauty Spot",
            slug: "beauty-spot",
          },
          business_id: "biz_1",
        },
      },
    ]);

    prismaMock.outboxMessage.findMany.mockResolvedValue([
      {
        payload: {
          customerId: "cust_1",
        },
      },
    ]);

    const result = await sendFlowReminders();

    expect(resendSendMock).not.toHaveBeenCalled();
    expect(prismaMock.outboxMessage.create).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        emails_sent: 0,
        duplicate_skips: 1,
      }),
    );
  });
});
