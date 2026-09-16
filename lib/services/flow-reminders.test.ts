import { beforeEach, describe, expect, it, vi } from "vitest";

const resendSendMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
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
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: resendSendMock,
    },
  })),
}));

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
    resendSendMock.mockResolvedValue({ error: null });
    getBusinessEntitlementsBySlugMock.mockResolvedValue({
      website: true,
      growth: false,
      social: false,
      ai: false,
    });
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
