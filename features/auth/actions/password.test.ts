import { beforeEach, describe, expect, it, vi } from "vitest";
import { changePasswordAction } from "./password";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), update: vi.fn(), compare: vi.fn(), hash: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/prisma/prisma", () => ({ prisma: { user: { findUnique: mocks.find, update: mocks.update, updateMany: mocks.update } } }));
vi.mock("bcryptjs", () => ({ compare: mocks.compare, hash: mocks.hash }));

const input = { currentPassword: "old-fixture", newPassword: "new-fixture" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, session: { user: { id: "verified-user" } } });
  mocks.find.mockResolvedValue({ id: "verified-user", hashed_password: "old-hash-fixture" });
  mocks.compare.mockResolvedValue(true);
  mocks.hash.mockResolvedValue("new-hash-fixture");
  mocks.update.mockResolvedValue({ count: 1 });
});

describe("authenticated password change", () => {
  it("denies unauthenticated callers before credential work", async () => {
    mocks.auth.mockResolvedValue({ success: false, error: "Unauthorized" });
    expect(await changePasswordAction(input)).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...input, currentPassword: "" }, "Password fields are required."],
    [{ ...input, newPassword: "" }, "Password fields are required."],
    [{ ...input, newPassword: "short" }, "Password must be at least 8 characters."],
  ])("preserves required/minimum validation", async (value, error) => {
    expect(await changePasswordAction(value as typeof input)).toEqual({ success: false, error });
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("preserves missing-user and incorrect-current-password errors", async () => {
    mocks.find.mockResolvedValueOnce(null);
    expect(await changePasswordAction(input)).toEqual({ success: false, error: "User not found." });
    mocks.compare.mockResolvedValueOnce(false);
    expect(await changePasswordAction(input)).toEqual({ success: false, error: "Current password is incorrect." });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("uses authenticated identity, cost 12 and clears temporary credential flags", async () => {
    expect(await changePasswordAction(input)).toEqual({ success: true });
    expect(mocks.find).toHaveBeenCalledWith({ where: { id: "verified-user" }, select: { id: true, hashed_password: true } });
    expect(mocks.compare).toHaveBeenCalledWith("old-fixture", "old-hash-fixture");
    expect(mocks.hash).toHaveBeenCalledWith("new-fixture", 12);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "verified-user", hashed_password: "old-hash-fixture" },
      data: { hashed_password: "new-hash-fixture", must_change_password: false, temp_password_expires_at: null },
    }));
  });

  it.each([null, undefined, [], "malformed", {}, { currentPassword: 1, newPassword: "new-fixture" }])("rejects malformed payloads without credential work", async value => {
    expect(await changePasswordAction(value)).toMatchObject({ success: false });
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["a".repeat(73), "é".repeat(37), "🙂".repeat(19)])("rejects new passwords beyond bcrypt's byte limit", async newPassword => {
    expect(await changePasswordAction({ ...input, newPassword })).toEqual({ success: false, error: "Password must not exceed 72 UTF-8 bytes." });
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it("ignores a caller-provided user identity and preserves password whitespace", async () => {
    expect(await changePasswordAction({ currentPassword: " old-fixture ", newPassword: " new-fixture ", userId: "foreign" })).toEqual({ success: true });
    expect(mocks.compare).toHaveBeenCalledWith(" old-fixture ", "old-hash-fixture");
    expect(mocks.hash).toHaveBeenCalledWith(" new-fixture ", 12);
    expect(mocks.update.mock.calls[0][0].where.id).toBe("verified-user");
  });

  it("fails a stale conditional credential update without returning hashes", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    expect(await changePasswordAction(input)).toEqual({ success: false, error: "Password changed. Please retry with your current password." });
  });

  it.each(["auth", "find", "compare", "hash", "update"] as const)("returns only a safe error when %s fails", async target => {
    mocks[target].mockRejectedValue(new Error("private database / credential fixture"));
    expect(await changePasswordAction(input)).toEqual({ success: false, error: "Failed to change password." });
    if (target === "auth" || target === "find" || target === "compare" || target === "hash") {
      expect(mocks.update).not.toHaveBeenCalled();
    }
  });
});
