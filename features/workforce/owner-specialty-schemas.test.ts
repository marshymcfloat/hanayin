import { expect, it } from "vitest";
import { ownerSpecialtiesSchema } from "@/features/workforce/owner-specialty-schemas";

it.each([0, -1, 1.5, NaN, Infinity, 2147483648, "1"])("rejects unsupported owner ID %s", ownerId => {
  expect(ownerSpecialtiesSchema.safeParse({ ownerId, specialties: [] }).success).toBe(false);
});
it.each([null, "SPA", [""], [null], [1], ["x".repeat(201)], Array(101).fill("SPA")].map(specialties => ({ specialties })))("rejects unsupported specialties $specialties", ({ specialties }) => {
  expect(ownerSpecialtiesSchema.safeParse({ ownerId: 1, specialties }).success).toBe(false);
});
it("retains raw category values, duplicates and empty arrays", () => {
  expect(ownerSpecialtiesSchema.parse({ ownerId: 1, specialties: [" SPA ", "SPA", "SPA"], businessId: "foreign" })).toEqual({ ownerId: 1, specialties: [" SPA ", "SPA", "SPA"] });
  expect(ownerSpecialtiesSchema.parse({ ownerId: 1, specialties: [] }).specialties).toEqual([]);
  expect(ownerSpecialtiesSchema.safeParse({ ownerId: 2147483647, specialties: Array(100).fill("x".repeat(200)) }).success).toBe(true);
});
