import { describe, it, expect } from "vitest";
import { createVoucherSchema, voucherCodeSchema, voucherIdSchema, verifyVoucherSchema, voucherInputError } from "./voucher-schemas";
const input = { code: " vo-code ", type: "FLAT", value: 0, minimum_amount: 0, expires_at: new Date("2030-01-01") };
describe("voucher input boundaries", () => {
  it("normalizes code and strips untrusted tenant/active fields", () => {
    expect(createVoucherSchema.parse({ ...input, business_id: "foreign", is_active: false })).toEqual({ ...input, code: "VO-CODE" });
  });
  for (const [name, patch] of Object.entries({ negative: { value: -1 }, infinite: { value: Infinity }, nan: { value: NaN }, tooLarge: { value: 1e12 + 1 }, negativeMinimum: { minimum_amount: -1 }, percentageOver100: { type: "PERCENTAGE", value: 101 }, missingDate: { expires_at: undefined }, invalidDate: { expires_at: new Date("invalid") }, ancientDate: { expires_at: new Date("0000-01-01") }, lateDate: { expires_at: new Date("+010000-01-01") }, longCode: { code: "A".repeat(201) }, numericCode: { code: 99 }, badType: { type: "OTHER" } })) {
    it(`rejects ${name}`, () => expect(createVoucherSchema.safeParse({ ...input, ...patch }).success).toBe(false));
  }
  for (const value of [0, 100]) it(`accepts percentage ${value}`, () => expect(createVoucherSchema.safeParse({ ...input, type: "PERCENTAGE", value }).success).toBe(true));
  for (const id of [0, -1, 1.5, NaN, Infinity, 2147483648, "1", null]) it(`rejects invalid id ${String(id)}`, () => expect(voucherIdSchema.safeParse(id).success).toBe(false));
  it("accepts positive32 limits", () => { expect(voucherIdSchema.parse(1)).toBe(1); expect(voucherIdSchema.parse(2147483647)).toBe(2147483647); });
  it("preserves supported empty-code error", () => {
    const result = voucherCodeSchema.safeParse("  ");
    expect(result.success).toBe(false); if (!result.success) expect(voucherInputError(result.error.issues)).toBe("Voucher code can't be empty");
  });
  for (const currentTotal of [-1, NaN, Infinity, 1e12 + 1, "1"]) it(`rejects bad public total ${String(currentTotal)}`, () => expect(verifyVoucherSchema.safeParse({ code: "A", businessSlug: "demo", currentTotal }).success).toBe(false));
  it("rejects unsafe public slug", () => expect(verifyVoucherSchema.safeParse({ code: "A", businessSlug: "../demo", currentTotal: 0 }).success).toBe(false));
});
