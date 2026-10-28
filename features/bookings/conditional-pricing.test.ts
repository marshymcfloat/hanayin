import { describe, expect, it } from "vitest";
import { chooseConditionalPrice, type PricedUnit, type ConditionalOffer } from "@/features/bookings/conditional-pricing";
import { allocateCents } from "@/features/bookings/pricing-arithmetic";
import { conditionalSaleSchema, matchesServiceRule, packageChoicesSchema } from "@/features/catalog/offer-definitions";

const unit = (id: number, price: number, extra: Partial<PricedUnit> = {}): PricedUnit => ({ id, price: price / 100, category: id === 1 ? "Nails" : "Lashes", key: String(id), originalCents: price, finalCents: price, offerId: null, reason: null, ...extra });
const offer = (extra: Partial<ConditionalOffer> = {}): ConditionalOffer => ({ id: 4, title: "Together", discount_type: "PERCENTAGE", discount_value: 20, rule: { version: 1, target: "SECOND", groups: [{ kind: "CATEGORY", category: "Nails" }, { kind: "CATEGORY", category: "Lashes" }] }, ...extra });
describe("book together pricing", () => {
  it("requires both groups", () => expect(chooseConditionalPrice([unit(1, 30000)], [offer()], 0).conditionalId).toBeNull());
  it("discounts only the reward group", () => expect(chooseConditionalPrice([unit(1, 30000), unit(2, 50000)], [offer()], 0).units.map(line => line.finalCents)).toEqual([30000, 40000]));
  it("uses the best pair once, leaving extras unchanged", () => expect(chooseConditionalPrice([unit(1, 30000), unit(2, 50000), unit(3, 70000)], [offer()], 0).units.map(line => line.finalCents)).toEqual([30000, 50000, 56000]));
  it("does not count package services", () => expect(chooseConditionalPrice([unit(1, 30000, { packageId: 8 }), unit(2, 50000)], [offer()], 0).conditionalId).toBeNull());
  it("does not reuse one unit for two overlapping groups", () => expect(chooseConditionalPrice([unit(1, 30000)], [offer({ rule: { version: 1, target: "BOTH", groups: [{ kind: "SERVICES", serviceIds: [1] }, { kind: "SERVICES", serviceIds: [1] }] } })], 0).conditionalId).toBeNull());
  it("allows two distinct units of the same service", () => expect(chooseConditionalPrice([unit(1, 30000, { key: "a" }), unit(1, 30000, { key: "b" })], [offer({ rule: { version: 1, target: "BOTH", groups: [{ kind: "SERVICES", serviceIds: [1] }, { kind: "SERVICES", serviceIds: [1] }] } })], 0).total).toBe(48000));
  it("compares ordinary sales plus voucher without stacking", () => {
    const lines = [unit(1, 30000, { finalCents: 20000 }), unit(2, 50000)];
    expect(chooseConditionalPrice(lines, [offer()], 5000)).toMatchObject({ total: 65000, useVoucher: true, conditionalId: null });
  });
  it("preserves the voucher when the conditional result ties", () => expect(chooseConditionalPrice([unit(1, 30000), unit(2, 50000)], [offer()], 10000)).toMatchObject({ total: 70000, useVoucher: false, conditionalId: 4 }));
  it("does not stack ordinary discounts on qualifying units", () => expect(chooseConditionalPrice([unit(1, 30000, { finalCents: 10000 }), unit(2, 50000)], [offer()], 0).conditionalId).toBeNull());
  it("chooses the lowest conditional total and stable offer on ties", () => expect(chooseConditionalPrice([unit(1, 30000), unit(2, 50000)], [offer({ id: 8 }), offer({ id: 2 }), offer({ id: 6, discount_value: 10 })], 0).conditionalId).toBe(2));
  it("applies a flat amount once across the target", () => {
    const result = chooseConditionalPrice([unit(1, 10001), unit(2, 10002)], [offer({ discount_type: "FLAT", discount_value: 50.01, rule: { ...offer().rule, target: "BOTH" } })], 0);
    expect(result.total).toBe(15002); expect(result.units.reduce((sum, line) => sum + line.finalCents, 0)).toBe(result.total);
  });
  it("caps discounts at the target amount", () => expect(chooseConditionalPrice([unit(1, 30000), unit(2, 50000)], [offer({ discount_type: "FLAT", discount_value: 9999 })], 0).total).toBe(30000));
});
describe("choice rules and allocation", () => {
  it("uses inclusive regular-price bounds", () => { const rule = { kind: "CATEGORY" as const, category: "Lashes", minPrice: 300, maxPrice: 500 }; expect(matchesServiceRule(rule, { id: 1, category: "Lashes", price: 500 })).toBe(true); expect(matchesServiceRule(rule, { id: 1, category: "Lashes", price: 501 })).toBe(false); });
  it("rejects reversed price bounds", () => expect(conditionalSaleSchema.safeParse({ ...offer().rule, groups: [{ kind: "CATEGORY", category: "Lashes", minPrice: 500, maxPrice: 300 }, offer().rule.groups[0]] }).success).toBe(false));
  it("rejects duplicate choice IDs and empty selections", () => { const choice = { id: "x", label: "Lashes", rule: { kind: "SERVICES", serviceIds: [1] } }; expect(packageChoicesSchema.safeParse([choice, choice]).success).toBe(false); expect(packageChoicesSchema.safeParse([{ ...choice, rule: { kind: "SERVICES", serviceIds: [] } }]).success).toBe(false); });
  it("allocates remainder deterministically", () => expect(allocateCents(100, [1, 1, 1])).toEqual([34, 33, 33]));
  it("allocates zero-price choices evenly", () => expect(allocateCents(101, [0, 0])).toEqual([51, 50]));
  it("preserves exact totals at large valid prices", () => expect(allocateCents(214748364700, [214748364700, 100, 30]).reduce((a, b) => a + b, 0)).toBe(214748364700));
});
