import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  business: vi.fn(), services: vi.fn(), hours: vi.fn(), service: vi.fn(), slots: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/prisma/prisma", () => ({ prisma: {
  business: { findFirst: mocks.business }, service: { findMany: mocks.services, findFirst: mocks.service },
  businessHours: { findMany: mocks.hours }, $transaction: mocks.transaction,
} }));
vi.mock("@/features/bookings/services/booking-availability", () => ({ computeSlots: mocks.slots }));
import { getAssistantAvailability, getAssistantPublicFacts, isAssistantAvailabilityDate } from "@/features/social/conversation-assistant/facts";

const tenant = { businessId: "lab-business", businessSlug: "lab-studio" };
const now = new Date("2026-10-04T04:00:00.000Z");
const tx = { business: { findFirst: mocks.business }, service: { findFirst: mocks.service } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.business.mockResolvedValue({ id: tenant.businessId, name: "Lab Studio", timezone: "Asia/Manila", private_notes: "never expose" });
  mocks.services.mockResolvedValue([{ id: 7, name: "Manicure", category: "Nails", price: 280, duration: null, estimated_cost: 100, description: "private instructions" }]);
  mocks.hours.mockResolvedValue([{ day_of_week: 0, category: "GENERAL", open_time: "09:00", close_time: "18:00", is_closed: false, internal_note: "private" }]);
  mocks.service.mockResolvedValue({ id: 7 });
  mocks.slots.mockResolvedValue([
    { startTime: new Date("2026-10-04T05:00:00Z"), endTime: new Date("2026-10-04T05:30:00Z"), available: true, availableEmployeeCount: 4, employeeNames: ["private"] },
    { startTime: new Date("2026-10-04T06:00:00Z"), endTime: new Date("2026-10-04T06:30:00Z"), available: false },
  ]);
  mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
});

describe("assistant public facts", () => {
  it("uses tenant predicates and allowlist projections, never costs or private records", async () => {
    const facts = await getAssistantPublicFacts(tenant, now);
    expect(facts.services).toEqual([{ id: 7, name: "Manicure", category: "Nails", price: 280, durationMinutes: null }]);
    expect(facts.hours).toEqual([{ dayOfWeek: 0, category: "GENERAL", openTime: "09:00", closeTime: "18:00", isClosed: false }]);
    expect(facts.generatedAt).toBe(now.toISOString());
    expect(mocks.business).toHaveBeenCalledWith({ where: { id: "lab-business", slug: "lab-studio" }, select: { name: true, timezone: true } });
    expect(mocks.services).toHaveBeenCalledWith(expect.objectContaining({ where: { business_id: "lab-business" }, select: { id: true, name: true, category: true, price: true, duration: true }, take: 101 }));
    expect(mocks.hours).toHaveBeenCalledWith(expect.objectContaining({ where: { business_id: "lab-business" }, take: 101 }));
    expect(JSON.stringify(facts)).not.toMatch(/estimated_cost|private|description|payroll|employee/);
  });

  it.each([null, 0, -15])("keeps unset/nonpositive duration %s unknown instead of using a scheduling default", async (duration) => {
    mocks.services.mockResolvedValue([{ id: 7, name: "Manicure", category: "Nails", price: 280, duration }]);
    expect((await getAssistantPublicFacts(tenant, now)).services[0].durationMinutes).toBeNull();
  });

  it("retains an explicitly listed positive catalog duration", async () => {
    mocks.services.mockResolvedValue([{ id: 7, name: "Manicure", category: "Nails", price: 280, duration: 45 }]);
    expect((await getAssistantPublicFacts(tenant, now)).services[0].durationMinutes).toBe(45);
  });

  it("rejects a missing/mismatched business or unsupported timezone", async () => {
    mocks.business.mockResolvedValueOnce(null);
    await expect(getAssistantPublicFacts(tenant, now)).rejects.toThrow("cannot use");
    mocks.business.mockResolvedValueOnce({ name: "Other", timezone: "Europe/London" });
    await expect(getAssistantPublicFacts(tenant, now)).rejects.toThrow("cannot use");
  });

  it("fails closed rather than silently presenting an incomplete catalog/hours set", async () => {
    mocks.services.mockResolvedValueOnce(Array.from({ length: 101 }, (_, id) => ({ id: id + 1 })));
    await expect(getAssistantPublicFacts(tenant, now)).rejects.toThrow("cannot use");
    mocks.hours.mockResolvedValueOnce(Array.from({ length: 101 }, () => ({})));
    await expect(getAssistantPublicFacts(tenant, now)).rejects.toThrow("cannot use");
  });
});

describe("assistant availability", () => {
  it("uses one verified service in a read-only snapshot and returns times only", async () => {
    const availability = await getAssistantAvailability(tenant, 7, "2026-10-04", now);
    expect(mocks.service).toHaveBeenCalledWith({ where: { id: 7, business_id: "lab-business" }, select: { id: true } });
    expect(mocks.business).toHaveBeenCalledWith({ where: { id: "lab-business", slug: "lab-studio" }, select: { id: true, timezone: true } });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 10000 });
    expect(mocks.slots).toHaveBeenCalledWith({ businessSlug: "lab-studio", date: new Date("2026-10-04T12:00:00+08:00"), services: [{ id: 7, quantity: 1 }], db: tx });
    expect(availability.slots).toEqual([{ startTime: "2026-10-04T05:00:00.000Z", endTime: "2026-10-04T05:30:00.000Z" }]);
    expect(JSON.stringify(availability)).not.toMatch(/availableEmployeeCount|employeeNames|private/);
  });

  it("rejects foreign or deleted service IDs before the public engine can silently discard them", async () => {
    mocks.service.mockResolvedValueOnce(null);
    await expect(getAssistantAvailability(tenant, 999, "2026-10-04", now)).rejects.toThrow("cannot use");
    expect(mocks.service).toHaveBeenCalledWith({ where: { id: 999, business_id: "lab-business" }, select: { id: true } });
    expect(mocks.slots).not.toHaveBeenCalled();
  });

  it("rejects a foreign/missing business and makes no engine lookup", async () => {
    mocks.business.mockResolvedValue(null);
    await expect(getAssistantAvailability(tenant, 7, "2026-10-04", now)).rejects.toThrow("cannot use");
    expect(mocks.slots).not.toHaveBeenCalled();
  });

  it.each(["2026-02-31", "2026-10-03", "2026-10-18", "not-a-date"])("rejects invalid/past/out-of-range date %s before database work", async (date) => {
    await expect(getAssistantAvailability(tenant, 7, date, now)).rejects.toThrow("cannot use");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("includes the current PH day and thirteen following days only", () => {
    expect(isAssistantAvailabilityDate("2026-10-04", now)).toBe(true);
    expect(isAssistantAvailabilityDate("2026-10-17", now)).toBe(true);
    expect(isAssistantAvailabilityDate("2026-10-18", now)).toBe(false);
    expect(isAssistantAvailabilityDate("2026-10-05", new Date("2026-10-04T18:00:00Z"))).toBe(true);
    expect(isAssistantAvailabilityDate("2026-10-04", new Date("2026-10-04T18:00:00Z"))).toBe(false);
  });
});
