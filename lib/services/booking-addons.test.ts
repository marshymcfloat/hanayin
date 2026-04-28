import { describe, expect, it, vi } from "vitest";
import {
  resolveAddOnMutationMode,
  type AddOnMutationMode,
} from "./booking-addons";

function createActorContext() {
  return {
    success: true as const,
    businessId: "biz_1",
    businessSlug: "demo-business",
    userId: "user_1",
    actorType: "EMPLOYEE" as const,
    role: "EMPLOYEE" as const,
    employeeId: 101,
    businessPolicy: {
      structure: "OWNER_EMPLOYEE_SELF_SERVICE" as const,
      allowEmployeeSelfBooking: true,
      managerCanServe: true,
    },
    profile: "STAFF" as const,
    permissions: ["BOOKING_CREATE" as const],
    ownerId: null,
  };
}

function createDbWithBooking(booking: unknown) {
  return {
    booking: {
      findFirst: vi.fn().mockResolvedValue(booking),
    },
  } as unknown as Parameters<typeof resolveAddOnMutationMode>[2];
}

async function getMode(booking: unknown): Promise<AddOnMutationMode> {
  const result = await resolveAddOnMutationMode(
    1,
    createActorContext(),
    createDbWithBooking(booking),
  );

  return result.mode;
}

describe("resolveAddOnMutationMode", () => {
  it("returns APPEND when booking is untouched", async () => {
    const mode = await getMode({
      id: 1,
      status: "ACCEPTED",
      amount_paid: 0,
      payment_status: "UNPAID",
      availed_services: [{ status: "PENDING" }],
      payments: [],
    });

    expect(mode).toBe("APPEND");
  });

  it("returns FOLLOW_UP when booking already has payment", async () => {
    const mode = await getMode({
      id: 1,
      status: "ACCEPTED",
      amount_paid: 100,
      payment_status: "PARTIALLY_PAID",
      availed_services: [{ status: "PENDING" }],
      payments: [],
    });

    expect(mode).toBe("FOLLOW_UP");
  });

  it("returns FOLLOW_UP when any service already started", async () => {
    const mode = await getMode({
      id: 1,
      status: "ACCEPTED",
      amount_paid: 0,
      payment_status: "UNPAID",
      availed_services: [{ status: "CLAIMED" }],
      payments: [],
    });

    expect(mode).toBe("FOLLOW_UP");
  });

  it("returns APPEND when booking has payments array but no recorded payment amount", async () => {
    const mode = await getMode({
      id: 1,
      status: "ACCEPTED",
      amount_paid: 0,
      payment_status: "UNPAID",
      availed_services: [{ status: "PENDING" }],
      payments: [{ id: 999 }],
    });

    expect(mode).toBe("APPEND");
  });
});