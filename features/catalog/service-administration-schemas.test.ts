import { describe, expect, it } from "vitest";
import { createServiceInputSchema, updateServiceInputSchema } from "./service-administration-schemas";

const valid = { name: "Cut", category: "Hair", price: 100 };
const flow = { suggested_service_id: 1, delay_duration: 0, delay_unit: "DAYS", type: "SUGGESTED" };

describe("service administration input boundaries", () => {
  it("strips untrusted identities and unknown patch fields", () => {
    expect(createServiceInputSchema.parse({ ...valid, business_id: "foreign", id: 99, flows: [{ ...flow, business_id: "foreign" }] })).toEqual({ ...valid, flows: [flow] });
    expect(updateServiceInputSchema.parse({ businessId: "foreign" })).toEqual({});
  });
  it("preserves omitted, empty and partial patch values", () => {
    expect(updateServiceInputSchema.parse({ duration: 0, price: 0, description: "", flows: [] })).toEqual({ duration: 0, price: 0, description: "", flows: [] });
    expect(updateServiceInputSchema.parse({})).toEqual({});
  });
  it.each([
    { name: "" }, { name: "x".repeat(201) }, { name: 1 }, { category: "" }, { category: "x".repeat(201) },
    { description: "x".repeat(10001) }, { description: null }, { price: -1 }, { price: NaN }, { price: Infinity }, { price: 1e12 + 1 }, { price: "100" },
    { estimated_cost: -1 }, { estimated_cost: Infinity }, { duration: -1 }, { duration: 1.5 }, { duration: 2147483648 }, { duration: null },
    { flows: null }, { flows: {} }, { flows: Array.from({ length: 101 }, () => flow) },
    { flows: [{ ...flow, suggested_service_id: 0 }] }, { flows: [{ ...flow, suggested_service_id: 2147483648 }] },
    { flows: [{ ...flow, delay_duration: -1 }] }, { flows: [{ ...flow, delay_duration: 1.5 }] }, { flows: [{ ...flow, delay_duration: Infinity }] },
    { flows: [{ ...flow, delay_unit: "YEARS" }] }, { flows: [{ ...flow, type: "CUSTOM" }] },
  ])("rejects malformed or excessive input %#", (patch) => {
    expect(createServiceInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    expect(updateServiceInputSchema.safeParse(patch).success).toBe(false);
  });
  it("accepts bounded finite amounts, maximum 32-bit timing and flow limit", () => {
    expect(createServiceInputSchema.safeParse({ name: "x".repeat(200), category: "x".repeat(200), description: "x".repeat(10000), price: 1e12, estimated_cost: 0, duration: 2147483647, flows: Array.from({ length: 100 }, () => ({ ...flow, suggested_service_id: 2147483647, delay_duration: 2147483647 })) }).success).toBe(true);
  });
  it.each(["DAYS", "WEEKS", "MONTHS"])("accepts supported timing %s", (delay_unit) => {
    expect(createServiceInputSchema.safeParse({ ...valid, flows: [{ ...flow, delay_unit, type: "REQUIRED" }] }).success).toBe(true);
  });
});
