import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentDateTimePHMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  businessSubscription: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  subscriptionPlan: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/date-utils", () => ({
  getCurrentDateTimePH: getCurrentDateTimePHMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

import {
  DEFAULT_SUBSCRIPTION_PLAN_CODE,
  ensureBusinessSubscription,
  ensureDefaultPlans,
  __resetEnsureDefaultPlansMemoForTests,
} from "./subscription-service";

describe("subscription plan catalog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __resetEnsureDefaultPlansMemoForTests();
    getCurrentDateTimePHMock.mockReturnValue(new Date("2026-02-15T00:00:00.000Z"));
  });

  it("upserts Starter/Plus/Pro monthly plans and deactivates legacy annual", async () => {
    const upsertMock = prismaMock.subscriptionPlan.upsert.mockResolvedValue(null);
    const updateManyMock = prismaMock.subscriptionPlan.updateMany.mockResolvedValue({
      count: 1,
    });
    prismaMock.$transaction.mockResolvedValue([null, null, null, { count: 1 }]);

    await ensureDefaultPlans();

    expect(upsertMock).toHaveBeenCalledTimes(3);
    expect(upsertMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { code: "STARTER_MONTHLY" },
        create: expect.objectContaining({
          code: "STARTER_MONTHLY",
          price_amount: 149_900,
          billing_interval: "MONTHLY",
          is_active: true,
        }),
      }),
    );
    expect(upsertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { code: "PLUS_MONTHLY" },
        create: expect.objectContaining({
          code: "PLUS_MONTHLY",
          price_amount: 249_900,
          billing_interval: "MONTHLY",
          is_active: true,
        }),
      }),
    );
    expect(upsertMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: { code: "PRO_MONTHLY" },
        create: expect.objectContaining({
          code: "PRO_MONTHLY",
          price_amount: 399_900,
          billing_interval: "MONTHLY",
          is_active: true,
        }),
      }),
    );

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { code: "PRO_ANNUAL" },
      data: { is_active: false },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("defaults new business subscriptions to STARTER_MONTHLY", async () => {
    prismaMock.businessSubscription.findUnique.mockResolvedValue(null);
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue({
      id: "plan_starter",
      billing_interval: "MONTHLY",
    });
    prismaMock.businessSubscription.create.mockResolvedValue({ id: "sub_1" });

    await ensureBusinessSubscription("biz_1");

    expect(prismaMock.subscriptionPlan.findUnique).toHaveBeenCalledWith({
      where: { code: DEFAULT_SUBSCRIPTION_PLAN_CODE },
    });
    expect(prismaMock.businessSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          business_id: "biz_1",
          plan_id: "plan_starter",
          status: "TRIALING",
        }),
      }),
    );
  });

  it("returns existing subscription without creating a new one", async () => {
    prismaMock.businessSubscription.findUnique.mockResolvedValue({ id: "sub_existing" });

    const result = await ensureBusinessSubscription("biz_2");

    expect(result).toEqual({ id: "sub_existing" });
    expect(prismaMock.subscriptionPlan.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.businessSubscription.create).not.toHaveBeenCalled();
  });
});
