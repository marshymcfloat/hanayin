import { describe, expect, it, vi } from "vitest";
import { MAX_ALTERNATIVE_SEARCH_DAYS, searchAlternativeSlots } from "@/features/bookings/services/alternative-slot-search";

const scheduledAt = new Date("2030-01-15T01:00:00Z");
const slot = (minutes: number) => ({ startTime: new Date(scheduledAt.getTime() + minutes * 60_000) });

describe("bounded alternative search", () => {
  it.each([0, 500])("caps no-capacity work from offset %s independently of horizon", async startDiff => {
    let active = 0;
    let peak = 0;
    const computeDay = vi.fn(async (_offset: number) => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return []; });
    expect(await searchAlternativeSlots({ scheduledAt, startDiff, bookingHorizonDays: 100_000, limit: 6, computeDay })).toEqual([]);
    expect(computeDay).toHaveBeenCalledTimes(MAX_ALTERNATIVE_SEARCH_DAYS);
    expect(computeDay.mock.calls.map(args => args[0])).toEqual(Array.from({ length: 90 }, (_, i) => startDiff + i));
    expect(peak).toBe(1);
  });
  it("returns only strictly later first-day slots in unchanged order and stops early", async () => {
    const slots = [slot(-30), slot(0), slot(30), slot(60), slot(90)];
    const computeDay = vi.fn().mockResolvedValue(slots);
    expect(await searchAlternativeSlots({ scheduledAt, startDiff: 2, bookingHorizonDays: 1000, limit: 2, computeDay })).toEqual(slots.slice(2, 4));
    expect(computeDay).toHaveBeenCalledExactlyOnceWith(2);
  });
  it("collects across days and trims to the requested count", async () => {
    const computeDay = vi.fn().mockResolvedValueOnce([slot(0), slot(30)]).mockResolvedValueOnce([slot(1440), slot(1470)]);
    expect(await searchAlternativeSlots({ scheduledAt, startDiff: 0, bookingHorizonDays: 14, limit: 2, computeDay })).toEqual([slot(30), slot(1440)]);
    expect(computeDay).toHaveBeenCalledTimes(2);
  });
  it("returns partial advisory results at budget exhaustion without scanning day 91", async () => {
    const computeDay = vi.fn(async (offset: number) => offset === 89 ? [slot(89 * 1440)] : []);
    expect(await searchAlternativeSlots({ scheduledAt, startDiff: 0, bookingHorizonDays: 100_000, limit: 6, computeDay })).toEqual([slot(89 * 1440)]);
    expect(computeDay).toHaveBeenCalledTimes(90);
  });
  it("honors a shorter stored horizon", async () => {
    const computeDay = vi.fn().mockResolvedValue([]);
    expect(await searchAlternativeSlots({ scheduledAt, startDiff: 12, bookingHorizonDays: 14, limit: 6, computeDay })).toEqual([]);
    expect(computeDay.mock.calls).toEqual([[12], [13]]);
  });
  it.each([14, 15])("does no day work at/beyond horizon offset %s", async startDiff => {
    const computeDay = vi.fn();
    expect(await searchAlternativeSlots({ scheduledAt, startDiff, bookingHorizonDays: 14, limit: 6, computeDay })).toEqual([]);
    expect(computeDay).not.toHaveBeenCalled();
  });
  it("propagates computation failure without continuing", async () => {
    const error = new Error("fixture failure");
    const computeDay = vi.fn().mockRejectedValue(error);
    await expect(searchAlternativeSlots({ scheduledAt, startDiff: 0, bookingHorizonDays: 14, limit: 6, computeDay })).rejects.toBe(error);
    expect(computeDay).toHaveBeenCalledTimes(1);
  });
});
