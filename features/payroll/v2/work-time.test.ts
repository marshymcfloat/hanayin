import { describe, expect, it } from "vitest";
import { workMinutes } from "./work-time";
import { validatePaymentSchedule } from "./period";
describe("work intervals and payroll schedules", () => {
  it("handles overnight Philippine night work and excludes reviewed breaks", () => {
    expect(workMinutes([{ startedAt: new Date("2026-09-01T22:00:00+08:00"), endedAt: new Date("2026-09-02T08:00:00+08:00"), breaks: [{ start: "2026-09-02T02:00:00+08:00", end: "2026-09-02T03:00:00+08:00" }] }], 480)).toMatchObject({ total: 540, ordinary: 480, overtime: 60, nightOrdinary: 420, nightOvertime: 0, days: [{ date: "2026-09-01", ordinary: 120, overtime: 0, nightOrdinary: 120, nightOvertime: 0 }, { date: "2026-09-02", ordinary: 360, overtime: 60, nightOrdinary: 300, nightOvertime: 0 }] });
  });
  it("rejects overlapping intervals and breaks outside a session", () => {
    const interval = { startedAt: new Date("2026-09-01T00:00:00Z"), endedAt: new Date("2026-09-01T02:00:00Z"), breaks: [] };
    expect(() => workMinutes([interval, interval], 480)).toThrow("Overlapping");
    expect(() => workMinutes([{ ...interval, breaks: [{ start: "2026-08-31T00:00:00Z", end: "2026-09-01T01:00:00Z" }] }], 480)).toThrow("breaks");
  });
  it("retains elapsed time when clocks start and end between minute boundaries", () => {
    const result = workMinutes([{ startedAt: new Date("2026-09-01T09:00:30+08:00"), endedAt: new Date("2026-09-01T10:00:30+08:00"), breaks: [] }], 480);
    expect(result.ordinaryMs).toBe(3600000); expect(result.total).toBe(60);
  });
  it("allows weekly and twice monthly schedules but rejects excessive payment gaps", () => {
    expect(() => validatePaymentSchedule("SEMIMONTHLY", [15, 30])).not.toThrow();
    expect(() => validatePaymentSchedule("WEEKLY", [])).not.toThrow();
    expect(() => validatePaymentSchedule("CUSTOM", [1, 30])).toThrow("16 days");
    expect(() => validatePaymentSchedule("CUSTOM", [15])).toThrow();
  });
});

