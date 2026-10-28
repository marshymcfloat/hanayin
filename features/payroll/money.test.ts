import { describe, expect, it } from "vitest";
import { amount, decimal, sum, outstanding } from "./money";

describe("payroll decimal money", () => {
  it("rounds half-up without binary floating-point loss", () => {
    expect(amount("1.005")).toBe("1.01"); expect(amount("-1.005")).toBe("-1.01");
    expect(amount(sum(["0.1", "0.2"]))).toBe("0.30");
  });
  it("preserves zero, high-precision rates and exact installment balances", () => {
    expect(amount(decimal("0").times("15").div(100))).toBe("0.00");
    expect(outstanding("999999999999.99", "999999999999.98")).toBe("0.01");
  });
  it("rejects non-finite input", () => { expect(() => decimal("NaN")).toThrow(); expect(() => decimal(Infinity)).toThrow(); });
});
