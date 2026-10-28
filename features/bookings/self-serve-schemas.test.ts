import { describe, expect, it } from "vitest";
import {
  bookingCustomerCancelSchema,
  bookingCustomerRescheduleSchema,
  bookingManageSchema,
} from "@/features/bookings/self-serve-schemas";

const input = { token: "signed", bookingId: 12, businessSlug: "salon" };

describe("booking self-service boundary schemas", () => {
  it.each([
    { ...input, token: "" }, { ...input, bookingId: 0 },
    { ...input, bookingId: 1.5 }, { ...input, businessSlug: "" },
  ])("rejects malformed signed-booking identity", (invalid) => {
    expect(bookingManageSchema.safeParse(invalid).success).toBe(false);
  });

  it("preserves long cancellation reasons for the workflow's existing truncation rule", () => {
    const reason = "a".repeat(250);
    expect(bookingCustomerCancelSchema.parse({ ...input, reason })).toEqual({ ...input, reason });
    expect(bookingCustomerCancelSchema.safeParse({ ...input, reason: 123 }).success).toBe(false);
  });

  it("requires a valid Date without coercing arbitrary transport input", () => {
    expect(bookingCustomerRescheduleSchema.safeParse({ ...input, newScheduledAt: new Date("invalid") }).success).toBe(false);
    expect(bookingCustomerRescheduleSchema.safeParse({ ...input, newScheduledAt: "2030-01-01" }).success).toBe(false);
    expect(bookingCustomerRescheduleSchema.safeParse({ ...input, newScheduledAt: new Date("2030-01-01") }).success).toBe(true);
  });
});
