import { describe, expect, it } from "vitest";
import { sanitizeOwnerPermissions } from "./owner-permission-policy";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";

describe("owner permission normalization", () => {
  it.each([null, undefined, {}, "SETTINGS_MANAGE"])("returns no capabilities for non-array input %j", input => {
    expect(sanitizeOwnerPermissions(input)).toEqual([]);
  });
  it("accepts only enum values, removes duplicates and redundant sales-only reporting", () => {
    expect(sanitizeOwnerPermissions([null, 1, {}, "UNKNOWN", "REPORTS_VIEW_SALES_ONLY", "REPORTS_VIEW_FULL", "SETTINGS_MANAGE", "SETTINGS_MANAGE"])).toEqual([OwnerPermission.REPORTS_VIEW_FULL, OwnerPermission.SETTINGS_MANAGE]);
  });
  it("does not upgrade sales-only capabilities or implicitly grant settings access", () => {
    expect(sanitizeOwnerPermissions(["REPORTS_VIEW_SALES_ONLY"])).toEqual([OwnerPermission.REPORTS_VIEW_SALES_ONLY]);
  });
  it("retains every enum capability independently", () => {
    for (const permission of Object.values(OwnerPermission)) expect(sanitizeOwnerPermissions([permission])).toEqual([permission]);
  });
});
