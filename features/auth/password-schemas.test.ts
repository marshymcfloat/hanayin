import { describe, expect, it } from "vitest";
import { passwordChangeSchema } from "./password-schemas";

describe("password-change boundary schema", () => {
  it.each(["a".repeat(72), "é".repeat(36), "🙂".repeat(18)])("accepts exactly 72 UTF-8 bytes", newPassword => {
    expect(passwordChangeSchema.safeParse({ currentPassword: "legacy".repeat(30), newPassword }).success).toBe(true);
  });

  it("preserves exact whitespace and ignores unrelated client identity fields", () => {
    expect(passwordChangeSchema.parse({ currentPassword: " old fixture ", newPassword: " new fixture ", userId: "foreign" }))
      .toEqual({ currentPassword: " old fixture ", newPassword: " new fixture " });
  });

  it("bounds current-password input without applying the new-password byte limit to legacy comparisons", () => {
    expect(passwordChangeSchema.safeParse({ currentPassword: "a".repeat(4096), newPassword: "new-fixture" }).success).toBe(true);
    expect(passwordChangeSchema.safeParse({ currentPassword: "a".repeat(4097), newPassword: "new-fixture" }).success).toBe(false);
  });
});
