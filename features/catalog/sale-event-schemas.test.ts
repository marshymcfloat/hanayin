import { describe, expect, it } from "vitest";
import { createSaleEventSchema, updateSaleEventSchema, deleteSaleEventSchema, saleEventIdSchema } from "./sale-event-schemas";

const input = { businessSlug: "tenant-a", title: "Promo", startDate: new Date("2026-03-01"), endDate: new Date("2026-03-05"), discountType: "PERCENTAGE", discountValue: 10, serviceIds: [1], packageIds: [] };
describe("sale event boundary schemas", () => {
  it("deduplicates IDs and platforms and strips all untrusted identity and update-only extras", () => {
    const value = createSaleEventSchema.parse({ ...input, serviceIds: [1, 1], packageIds: [2, 2], targetPlatforms: ["FACEBOOK_PAGE", "FACEBOOK_PAGE"], business_id: "foreign", created_by_user_id: "other", title: " Promo " });
    expect(value).toMatchObject({ title: "Promo", serviceIds: [1], packageIds: [2], targetPlatforms: ["FACEBOOK_PAGE"] });
    expect(value).not.toHaveProperty("business_id");
    expect(value).not.toHaveProperty("created_by_user_id");
    expect(updateSaleEventSchema.parse({ ...input, id: 8, slotLimit: 1, createSocialDraft: true })).toHaveProperty("slotLimit", 1);
  });
  it.each([0, 100])("accepts inclusive percentage edge %s and equal dates", discountValue => {
    expect(createSaleEventSchema.safeParse({ ...input, discountValue, endDate: input.startDate }).success).toBe(true);
  });
  it("accepts fixed discounts above 100 and explicit unlimited slots", () => {
    expect(createSaleEventSchema.parse({ ...input, discountType: "FLAT", discountValue: 1000, slotLimit: null, socialMediaUrl: "" })).toMatchObject({ discountValue: 1000, slotLimit: null, socialMediaUrl: "" });
  });
  const invalid = [
    { title: " " }, { title: "x".repeat(201) }, { description: "x".repeat(10001) },
    { discountValue: -1 }, { discountValue: Infinity }, { discountValue: NaN }, { discountValue: 101 }, { discountValue: 1e12 + 1, discountType: "FLAT" },
    { discountType: "INVALID" }, { serviceIds: [0] }, { serviceIds: [-1] }, { serviceIds: [1.5] }, { serviceIds: [2147483648] }, { serviceIds: ["1"] },
    { packageIds: [0] }, { serviceIds: [] }, { serviceIds: Array(101).fill(1) }, { packageIds: Array(101).fill(2) },
    { startDate: new Date("invalid") }, { endDate: new Date("2026-01-01") }, { startDate: new Date("0000-01-01") }, { endDate: new Date("+010000-01-01T00:00:00Z") },
    { startDate: "2026-03-01" }, { slotLimit: 0 }, { slotLimit: -1 }, { slotLimit: 1.5 }, { slotLimit: 2147483648 },
    { createSocialDraft: "true" }, { targetPlatforms: ["UNKNOWN"] }, { targetPlatforms: Array(11).fill("FACEBOOK_PAGE") },
    { socialMediaUrl: "http://example.com/image.jpg" }, { socialMediaUrl: "javascript:alert(1)" }, { socialMediaUrl: "https://example.com/" + "x".repeat(2048) },
    { socialCaptionOverride: "x".repeat(10001) }, { socialImageDirection: "x".repeat(2001) }, { socialImageProfile: "INVALID" }, { businessSlug: "../private" },
  ];
  it.each(invalid.map((patch, index) => ({ patch, index })))("rejects malformed bounded input $index", ({ patch }) => {
    expect(createSaleEventSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it.each([NaN, Infinity, 0, -1, 1.2, 2147483648, "1"])("rejects invalid update/delete ID %s", id => {
    expect(saleEventIdSchema.safeParse(id).success).toBe(false);
    expect(updateSaleEventSchema.safeParse({ ...input, id }).success).toBe(false);
    expect(deleteSaleEventSchema.safeParse({ id, businessSlug: "tenant-a" }).success).toBe(false);
  });
  it("accepts package-only selection and HTTPS media", () => {
    expect(createSaleEventSchema.safeParse({ ...input, serviceIds: [], packageIds: [8], slotLimit: 2147483647, socialMediaUrl: "https://example.com/image.jpg" }).success).toBe(true);
  });
});
