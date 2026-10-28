import { describe, expect, it } from "vitest";
import { calculatePayslipCompensation, roundCurrency } from "./payslip-policy";

const present = { id: 1, date: new Date("2026-09-10"), status: "PRESENT", is_paid_leave: false };

describe("payslip compensation", () => {
  it("counts present and paid leave but not absent or unpaid leave", () => {
    const rows = [present,
      { ...present, id: 2, date: new Date("2026-09-11"), status: "LEAVE", is_paid_leave: true },
      { ...present, id: 3, date: new Date("2026-09-12"), status: "LEAVE" },
      { ...present, id: 4, date: new Date("2026-09-13"), status: "ABSENT" }];
    expect(calculatePayslipCompensation(rows, [], 100, 10)).toMatchObject({ daysPresent: 1, paidLeaveDays: 1, basicSalary: 200 });
  });

  it("compensates each attendance date once", () => {
    expect(calculatePayslipCompensation([present, { ...present, id: 2 }], [], 100, 10)).toMatchObject({ daysPresent: 1, grossSalary: 100, uniqueAttendance: [present] });
  });

  it("uses legacy price fallback but preserves explicit zero commission base", () => {
    expect(calculatePayslipCompensation([], [{ commission_base: 0, price: 999 }, { commission_base: null, price: 100 }], 100, 10).commissionTotal).toBe(10);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("normalizes invalid deduction %s", (deduction) => {
    expect(calculatePayslipCompensation([present], [], 100, 10, deduction)).toMatchObject({ deduction: 0, netSalary: 100 });
  });

  it("caps deduction at gross compensation", () => {
    expect(calculatePayslipCompensation([present], [], 100, 10, 999)).toMatchObject({ deduction: 100, netSalary: 0 });
  });

  it("rounds released amounts to currency precision", () => {
    expect(roundCurrency(calculatePayslipCompensation([], [{ commission_base: 12.34, price: 100 }], 0, 10).netSalary)).toBe(1.23);
  });
});
