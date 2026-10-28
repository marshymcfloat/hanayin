import { describe, expect, it } from "vitest";
import { availableSlotsSchema, dayCapacitySchema, alternativeSlotsSchema, availableProvidersSchema, categoryAvailabilitySchema, parsePublicAvailability } from "@/features/bookings/public-availability-schemas";

const date = new Date("2030-01-15T01:00:00Z");
const slots = { businessSlug: "demo", date, services: [{ id: 1 }] };

describe("public availability input bounds", () => {
  it("preserves Dates and omitted quantities, strips untrusted fields", () => {
    expect(parsePublicAvailability(availableSlotsSchema, { ...slots, businessId: "foreign", ignoreMinLead: true })).toEqual(slots);
    expect(availableSlotsSchema.parse({ ...slots, services: [] }).services).toEqual([]);
  });
  it.each(["", " ", "bad/slug", "x".repeat(201), null, 1])("rejects malformed slug %s", businessSlug => {
    expect(availableSlotsSchema.safeParse({ ...slots, businessSlug }).success).toBe(false);
  });
  it.each([new Date(NaN), "2030-01-15", null, 1, new Date("0001-01-01"), new Date("9999-12-31")])("rejects unsupported Date %s", date => {
    expect(availableSlotsSchema.safeParse({ ...slots, date }).success).toBe(false);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 2_147_483_648, "1"])("rejects invalid service id %s", id => {
    expect(availableSlotsSchema.safeParse({ ...slots, services: [{ id }] }).success).toBe(false);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 101, "1"])("rejects invalid quantity %s", quantity => {
    expect(availableSlotsSchema.safeParse({ ...slots, services: [{ id: 1, quantity }] }).success).toBe(false);
  });
  it("bounds collection length while preserving the maximum", () => {
    expect(availableSlotsSchema.safeParse({ ...slots, services: Array.from({ length: 100 }, () => ({ id: 1, quantity: 100 })) }).success).toBe(true);
    expect(availableSlotsSchema.safeParse({ ...slots, services: Array.from({ length: 101 }, () => ({ id: 1 })) }).success).toBe(false);
  });
  it.each([0, 4, 5.5, NaN, Infinity, 1441, "30"])("rejects invalid slot interval %s", slotIntervalMinutes => {
    expect(availableSlotsSchema.safeParse({ ...slots, slotIntervalMinutes }).success).toBe(false);
  });
  it("accepts ordered/equal range endpoints and rejects reversed endpoints", () => {
    const range = { businessSlug: "demo", services: [], fromDate: date, toDate: date };
    expect(dayCapacitySchema.safeParse(range).success).toBe(true);
    expect(dayCapacitySchema.safeParse({ ...range, toDate: new Date(date.getTime() - 1) }).success).toBe(false);
  });
  it.each([0, -1, 1.5, 51, NaN, Infinity])("bounds alternative limit %s", limit => {
    expect(alternativeSlotsSchema.safeParse({ businessSlug: "demo", services: [], scheduledAt: date, limit }).success).toBe(false);
  });
  it("defaults alternative count and category names", () => {
    expect(alternativeSlotsSchema.parse({ businessSlug: "demo", services: [], scheduledAt: date }).limit).toBe(6);
    expect(categoryAvailabilitySchema.parse({ businessSlug: "demo" }).category).toBe("GENERAL");
  });
  it("bounds positive provider windows to 31 days", () => {
    const provider = { businessSlug: "demo", startTime: date, endTime: new Date(date.getTime() + 1) };
    expect(availableProvidersSchema.safeParse(provider).success).toBe(true);
    expect(availableProvidersSchema.safeParse({ ...provider, endTime: date }).success).toBe(false);
    expect(availableProvidersSchema.safeParse({ ...provider, endTime: new Date(date.getTime() - 1) }).success).toBe(false);
    expect(availableProvidersSchema.safeParse({ ...provider, endTime: new Date(date.getTime() + 32 * 86_400_000) }).success).toBe(false);
  });
  it.each(["", "x".repeat(201), null, 1])("rejects malformed categories %s", category => {
    expect(categoryAvailabilitySchema.safeParse({ businessSlug: "demo", category }).success).toBe(false);
  });
  it("bounds provider category arrays", () => {
    expect(availableProvidersSchema.safeParse({ businessSlug: "demo", startTime: date, endTime: new Date(date.getTime() + 1), categories: Array(101).fill("SPA") }).success).toBe(false);
  });
  it("returns only a static validation error", () => {
    expect(() => parsePublicAvailability(availableSlotsSchema, null)).toThrow("Invalid input");
  });
});
