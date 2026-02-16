import { describe, expect, it } from "vitest";
import { createBookingSchema } from "./bookings";

const basePayload = {
  services: [{ id: 1, name: "Haircut", price: 500, quantity: 1 }],
  scheduledAt: new Date("2026-02-15T12:00:00.000Z"),
  paymentMethod: "QRPH" as const,
  paymentType: "FULL" as const,
  email: "customer@example.com",
};

describe("createBookingSchema customerName", () => {
  it("rejects whitespace-only customer names", () => {
    const result = createBookingSchema.safeParse({
      ...basePayload,
      customerName: "   ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => issue.message);
      expect(issues).toContain(
        "Please select an existing customer or enter a new customer name",
      );
    }
  });

  it("rejects too-short customer names after trim", () => {
    const result = createBookingSchema.safeParse({
      ...basePayload,
      customerName: " a ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => issue.message);
      expect(issues).toContain("Customer name must be at least 2 characters");
    }
  });

  it("accepts valid names with surrounding whitespace", () => {
    const result = createBookingSchema.safeParse({
      ...basePayload,
      customerName: "  jane doe  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customerName).toBe("jane doe");
    }
  });
});
