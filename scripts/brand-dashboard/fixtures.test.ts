import { describe, expect, it } from "vitest";
import { captureProps } from "./fixtures";

describe("hero dashboard sample data", () => {
  it("keeps the monthly totals consistent with the chart and staff contributions", () => {
    const data = captureProps.analytics!;
    const month = data.periods.Month;
    expect(month.revenue.reduce((sum, value) => sum + value, 0)).toBe(data.summary.revenue);
    expect(month.bookings.reduce((sum, value) => sum + value, 0)).toBe(data.summary.bookings);
    expect(month.staff.reduce((sum, member) => sum + member.revenue, 0)).toBe(data.summary.revenue);
    expect(month.staff.reduce((sum, member) => sum + member.count, 0)).toBe(data.summary.visits);
    expect(data.summary.revenue / data.summary.visits).toBe(data.summary.average);
  });

  it("cannot persist bookings, expenses, or service changes", async () => {
    expect(await captureProps.onQueueAction(1, "claim")).toMatchObject({ success: false });
    expect(await captureProps.onExpense({ amount: 100, category: "SUPPLIES", date: new Date("2026-10-09") })).toMatchObject({ success: false });
    expect(captureProps.business?.slug).toMatch(/^fictional-/);
  });
});
