import { describe, it, expect } from "vitest";
import { evaluateVoucher } from "./voucher-policy";
const now = new Date("2030-01-01");
const voucher = { id: 1, code: "VO-A", type: "PERCENTAGE" as const, value: 20, minimum_amount: 50, expires_at: now, is_active: true, used_by_id: null };
describe("public voucher evaluation without redemption", () => {
  it("preserves equality for expiry and minimum spend", () => expect(evaluateVoucher(voucher, 50, now)).toEqual({ success: true, data: { id: 1, code: "VO-A", type: "PERCENTAGE", value: 20, discountAmount: 10, finalPrice: 40, minAmount: 50 } }));
  it("rejects inactive before expired/used", () => expect(evaluateVoucher({ ...voucher, is_active: false, used_by_id: 2 }, 50, new Date(now.getTime() + 1))).toEqual({ success: false, error: "Voucher is inactive" }));
  it("rejects expiry one millisecond later", () => expect(evaluateVoucher(voucher, 50, new Date(now.getTime() + 1))).toEqual({ success: false, error: "Voucher has expired" }));
  it("rejects used foreign-linked voucher without needing booking DTO", () => expect(evaluateVoucher({ ...voucher, used_by_id: 99 }, 50, now)).toEqual({ success: false, error: "Voucher has already been used" }));
  it("preserves minimum message", () => expect(evaluateVoucher(voucher, 49, now)).toEqual({ success: false, error: "Minimum spend of 50 required" }));
  it("clamps flat to total", () => expect(evaluateVoucher({ ...voucher, type: "FLAT", value: 100 }, 50, now).data).toMatchObject({ discountAmount: 50, finalPrice: 0 }));
  it("supports zero-valued voucher and zero total", () => expect(evaluateVoucher({ ...voucher, value: 0, minimum_amount: 0 }, 0, now).data).toMatchObject({ discountAmount: 0, finalPrice: 0 }));
});
