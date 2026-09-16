import { describe, expect, it } from "vitest";
import { createSharedWorkflowFactory } from "./shared-workflows";

describe("shared workflow factories", () => {
  it("returns the same values for the same namespace and clock", () => {
    const options = {
      namespace: "booking-flow",
      now: new Date("2031-04-05T06:00:00.000Z"),
    };

    const first = createSharedWorkflowFactory(options).sharedWorkflowSeed();
    const second = createSharedWorkflowFactory(options).sharedWorkflowSeed();

    expect(first).toEqual(second);
    expect(first.booking.businessId).toBe(first.business.id);
    expect(first.booking.customerId).toBe(first.customer.id);
    expect(first.booking.grandTotal).toBe(first.service.price);
  });

  it("does not share mutable dates between records or factory calls", () => {
    const factory = createSharedWorkflowFactory();
    const first = factory.business();
    const second = factory.business();

    first.createdAt.setUTCFullYear(2040);

    expect(second.createdAt.toISOString()).toBe("2030-01-15T09:00:00.000Z");
  });

  it("applies explicit overrides without changing relational defaults", () => {
    const factory = createSharedWorkflowFactory({ namespace: "custom" });
    const booking = factory.booking({ status: "COMPLETED", amountPaid: 799 });

    expect(booking).toMatchObject({
      businessId: "custom-business",
      customerId: "custom-customer",
      status: "COMPLETED",
      amountPaid: 799,
    });
  });
});
