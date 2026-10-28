import { describe, expect, it } from "vitest";
import { bookingAddOnSchema } from "./booking-addon-schemas";

const input = { bookingId: 1, services: [{ id: 2, quantity: 1 }] };
describe("booking add-on input", () => {
  it("coerces IDs and quantities and strips client identity", () => {
    expect(bookingAddOnSchema.parse({ businessId: "foreign", actorContext: {}, bookingId: "1", services: [{ id: "2", quantity: "3", business_id: "foreign" }], initiatorEmployeeId: "4" })).toEqual({ bookingId: 1, services: [{ id: 2, quantity: 3 }], initiatorEmployeeId: 4 });
  });
  it.each([0, -1, 1.1, 2_147_483_648, Infinity, NaN, "abc"])("rejects invalid booking/service/package/initiator ID %s", (id) => {
    expect(bookingAddOnSchema.safeParse({ ...input, bookingId: id }).success).toBe(false);
    expect(bookingAddOnSchema.safeParse({ ...input, services: [{ id, quantity: 1 }] }).success).toBe(false);
    expect(bookingAddOnSchema.safeParse({ ...input, services: [{ id: 2, quantity: 1, packageId: id }] }).success).toBe(false);
    expect(bookingAddOnSchema.safeParse({ ...input, initiatorEmployeeId: id }).success).toBe(false);
  });
  it.each([0, -1, 11, 1.1, Infinity, NaN])("rejects invalid quantity %s", (quantity) => {
    expect(bookingAddOnSchema.safeParse({ ...input, services: [{ id: 2, quantity }] }).success).toBe(false);
  });
  it("bounds service selection arrays to 1–100", () => {
    expect(bookingAddOnSchema.safeParse({ ...input, services: [] }).success).toBe(false);
    expect(bookingAddOnSchema.safeParse({ ...input, services: Array.from({ length: 100 }, () => ({ id: 2, quantity: 10 })) }).success).toBe(true);
    expect(bookingAddOnSchema.safeParse({ ...input, services: Array.from({ length: 101 }, () => ({ id: 2, quantity: 1 })) }).success).toBe(false);
  });
  it.each(["ANY_AVAILABLE", "PREFER_SELECTED", "REQUIRE_SELECTED"])("retains staff mode %s", (staffSelectionMode) => {
    expect(bookingAddOnSchema.parse({ ...input, staffSelectionMode }).staffSelectionMode).toBe(staffSelectionMode);
  });
  it("rejects unknown staff mode and nonboolean claims", () => {
    expect(bookingAddOnSchema.safeParse({ ...input, staffSelectionMode: "OWNER" }).success).toBe(false);
    expect(bookingAddOnSchema.safeParse({ ...input, services: [{ id: 2, quantity: 1, claimedByCurrentEmployee: "true" }] }).success).toBe(false);
  });
});
