import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupPublicProviders, lookupPublicCategoryAvailability, lookupPublicAlternativeSlots, lookupPublicAvailableSlots } from "@/features/bookings/services/public-availability";

const mocks = vi.hoisted(() => ({ business: vi.fn(), bySlug: vi.fn(), policy: vi.fn(), overlap: vi.fn(), hours: vi.fn(), compute: vi.fn(), alternatives: vi.fn(), metric: vi.fn() }));
vi.mock("@/lib/data/cached", () => ({ getCachedBusinessWithHoursAndEmployees: mocks.business, getCachedBusinessBySlug: mocks.bySlug }));
vi.mock("@/features/bookings/queries/public-availability", () => ({ getPublicAvailabilityPolicy: mocks.policy, listPublicOverlappingAssignments: mocks.overlap, listPublicBusinessHours: mocks.hours }));
vi.mock("@/features/bookings/services/booking-availability", () => ({ computeSlots: mocks.compute, listAlternativeSlots: mocks.alternatives }));
vi.mock("@/features/bookings/services/booking-metrics", () => ({ recordBookingMetric: mocks.metric }));

const today = new Date("2030-01-15T02:00:00Z");
const employee = (id = 1, specialties: string[] = []) => ({ id, profile: "STAFF", specialties, user: { name: "Fixture" } });
const provider = { businessSlug: "demo", startTime: today, endTime: new Date(today.getTime() + 60_000) };
function business(hours: Array<{ day_of_week: number; category: string; open_time: string; close_time: string; is_closed: boolean }> = []) {
  return { id: "resolved-business", employees: [employee()], owners: [], business_hours: hours };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(today);
  mocks.business.mockResolvedValue(business()); mocks.policy.mockResolvedValue({ bookingHorizonDays: 14, bookingV2Enabled: true }); mocks.overlap.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("public provider availability policies", () => {
  it("rejects missing public business", async () => {
    mocks.business.mockResolvedValue(null);
    await expect(lookupPublicProviders(provider)).rejects.toThrow("Business not found"); expect(mocks.overlap).not.toHaveBeenCalled();
  });
  it.each([-1, 14])("skips assignment reads outside horizon at offset %s", async offset => {
    expect(await lookupPublicProviders({ ...provider, startTime: new Date(today.getTime() + offset * 86_400_000) })).toEqual([]);
    expect(mocks.overlap).not.toHaveBeenCalled();
  });
  it("returns no future providers when booking V2 is disabled", async () => {
    mocks.policy.mockResolvedValue({ bookingHorizonDays: 14, bookingV2Enabled: false });
    expect(await lookupPublicProviders({ ...provider, startTime: new Date(today.getTime() + 86_400_000) })).toEqual([]); expect(mocks.overlap).not.toHaveBeenCalled();
  });
  it("returns no providers when no employees qualify", async () => {
    mocks.business.mockResolvedValue({ ...business(), employees: [employee(1, ["NAILS"])] });
    expect(await lookupPublicProviders({ ...provider, category: "SPA" })).toEqual([]);
  });
  it("returns an empty list when all qualified employees are busy", async () => {
    mocks.overlap.mockResolvedValue([{ availed_services: [{ status: "CLAIMED", served_by_id: 1 }] }]);
    expect(await lookupPublicProviders(provider)).toEqual([]);
  });
  it("uses the resolved public business identity and ignores unassigned lines", async () => {
    mocks.overlap.mockResolvedValue([{ availed_services: [{ status: "PENDING", served_by_id: null }] }]);
    expect(await lookupPublicProviders(provider)).toEqual([{ id: 1, name: "Fixture", specialties: [], available: true, type: "EMPLOYEE" }]);
    expect(mocks.overlap).toHaveBeenCalledWith("resolved-business", provider.startTime, provider.endTime);
  });
  it("preserves empty categories fallback and requires every requested specialty", async () => {
    mocks.business.mockResolvedValue({ ...business(), employees: [employee(1, ["GENERAL"])] });
    expect(await lookupPublicProviders({ ...provider, categories: [] })).toHaveLength(1);
    expect(await lookupPublicProviders({ ...provider, categories: ["GENERAL", "SPA"] })).toEqual([]);
  });
});

describe("public category-hour decisions", () => {
  it("rejects a missing business", async () => { mocks.business.mockResolvedValue(null); await expect(lookupPublicCategoryAvailability({ businessSlug: "demo" })).rejects.toThrow("Business not found"); });
  it("returns absent hours and zero owners while allowing wildcard staff", async () => {
    expect(await lookupPublicCategoryAvailability({ businessSlug: "demo" })).toEqual({ hasBusinessHours: false, businessHoursPassed: false, qualifiedEmployeeCount: 1, qualifiedOwnerCount: 0, qualifiedProviderCount: 1, businessHours: undefined });
  });
  it.each([
    { open: "09:00", close: "18:00", now: "02:00", closed: false, passed: false },
    { open: "09:00", close: "18:00", now: "12:00", closed: false, passed: true },
    { open: "09:00", close: "18:00", now: "02:00", closed: true, passed: false },
    { open: "00:00", close: "00:00", now: "02:00", closed: false, passed: false },
    { open: "22:00", close: "02:00", now: "17:00", closed: false, passed: false },
    { open: "22:00", close: "02:00", now: "15:00", closed: false, passed: false },
    { open: "22:00", close: "02:00", now: "02:00", closed: false, passed: true },
  ])("preserves hour windows $open–$close at UTC $now", async ({ open, close, now, closed, passed }) => {
    vi.setSystemTime(new Date(`2030-01-15T${now}:00Z`));
    mocks.business.mockResolvedValue(business([{ day_of_week: today.getDay(), category: "SPA", open_time: open, close_time: close, is_closed: closed }]));
    const result = await lookupPublicCategoryAvailability({ businessSlug: "demo", category: "spa", date: today });
    expect(result.hasBusinessHours).toBe(!closed); expect(result.businessHoursPassed).toBe(passed);
  });
  it("does not apply today's passed-hours flag to a future date", async () => {
    const tomorrow = new Date(today.getTime() + 86_400_000);
    mocks.business.mockResolvedValue(business([{ day_of_week: tomorrow.getDay(), category: "GENERAL", open_time: "01:00", close_time: "02:00", is_closed: false }]));
    expect((await lookupPublicCategoryAvailability({ businessSlug: "demo", date: tomorrow })).businessHoursPassed).toBe(false);
  });
});

it("preserves direct default alternative count", async () => {
  mocks.alternatives.mockResolvedValue([]);
  await expect(lookupPublicAlternativeSlots({ businessSlug: "demo", scheduledAt: today, services: [] })).resolves.toEqual([]);
  expect(mocks.alternatives).toHaveBeenCalledWith(expect.objectContaining({ limit: 6 }));
});
it("preserves original computation failure even if failure telemetry also fails", async () => {
  const error = new Error("computation failed"); mocks.compute.mockRejectedValue(error); mocks.bySlug.mockRejectedValue(new Error("telemetry failed"));
  await expect(lookupPublicAvailableSlots({ businessSlug: "demo", date: today, services: [] })).rejects.toBe(error);
});
