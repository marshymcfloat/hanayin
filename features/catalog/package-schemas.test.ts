import { describe, expect, it } from "vitest";
import { createPackageSchema, packageDetailsSchema, packageIdSchema } from "./package-schemas";

const input = { name: "Starter", category: "Bundles", price: 100, items: [] };
describe("package schemas", () => {
  it("strips caller-provided identity at every object boundary", () => {
    expect(packageDetailsSchema.parse({ ...input, business_id: "evil", items: [{ serviceId: 1, customPrice: 1, package_id: 2 }] })).toEqual({ ...input, items: [{ serviceId: 1, customPrice: 1 }] });
  });
  it.each([0, -1, 1.5, NaN, Infinity, 2147483648, "1", null])("rejects invalid IDs %s", value => {
    expect(packageIdSchema.safeParse(value).success).toBe(false);
  });
  it("accepts positive 32-bit endpoints and zero monetary/duration values", () => {
    expect(packageIdSchema.parse(2147483647)).toBe(2147483647);
    expect(packageDetailsSchema.safeParse({ ...input, price: 0, duration: 0, items: [{ serviceId: 1, customPrice: 0 }] }).success).toBe(true);
  });
  it.each([NaN, Infinity, -Infinity, -1, 2147483648, "100", null])("rejects invalid monetary values %s", value => {
    expect(packageDetailsSchema.safeParse({ ...input, price: value }).success).toBe(false);
    expect(packageDetailsSchema.safeParse({ ...input, items: [{ serviceId: 1, customPrice: value }] }).success).toBe(false);
  });
  it.each([1.5, -1, Infinity, 2147483648, "60", null])("rejects invalid durations %s", duration => {
    expect(packageDetailsSchema.safeParse({ ...input, duration }).success).toBe(false);
  });
  it("bounds fields and items at accepted limits", () => {
    expect(packageDetailsSchema.safeParse({ name: "n".repeat(200), category: "c".repeat(200), description: "d".repeat(4000), price: 1, items: Array.from({ length: 100 }, (_, index) => ({ serviceId: index + 1, customPrice: 0 })) }).success).toBe(true);
  });
  it.each([{ name: "" }, { name: "n".repeat(201) }, { category: "" }, { category: "c".repeat(201) }, { description: "d".repeat(4001) }, { items: null }, { items: "bad" }])("rejects malformed field %s", change => {
    expect(packageDetailsSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it("rejects duplicate service IDs instead of reaching the unique constraint", () => {
    expect(packageDetailsSchema.safeParse({ ...input, items: [{ serviceId: 1, customPrice: 0 }, { serviceId: 1, customPrice: 5 }] }).success).toBe(false);
  });
  it.each(["", "tenant/a", "a".repeat(201), null])("rejects invalid create slugs %s", businessSlug => {
    expect(createPackageSchema.safeParse({ ...input, businessSlug }).success).toBe(false);
  });
});
