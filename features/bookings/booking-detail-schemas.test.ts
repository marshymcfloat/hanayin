import { describe, expect, it } from "vitest";
import { bookingDetailIdSchema } from "./booking-detail-schemas";

describe("booking detail ID", () => {
  it.each([1, 2147483647])("accepts positive 32-bit endpoint %s", id => {
    expect(bookingDetailIdSchema.parse(id)).toBe(id);
  });
  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, 2147483648, "12", null, undefined])("rejects invalid ID %s without coercion", id => {
    expect(bookingDetailIdSchema.safeParse(id).success).toBe(false);
  });
});
