import { beforeEach, describe, expect, it, vi } from "vitest";
import { compare, getRounds, hashSync } from "bcryptjs";
import { changeAuthenticatedUserPassword } from "./password-change";

const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { user: { findUnique: mocks.find, updateMany: mocks.update } } }));
const currentPassword = "old-fixture";
const currentHash = hashSync(currentPassword, "$2b$04$abcdefghijklmnopqrstuu");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue({ id: "verified-user", hashed_password: currentHash });
  mocks.update.mockResolvedValue({ count: 1 });
});

describe("authenticated password service with real bcrypt", () => {
  it("writes a cost-12 hash that verifies the new password, not the old password", async () => {
    expect(await changeAuthenticatedUserPassword("verified-user", { currentPassword, newPassword: "new-fixture" })).toEqual({ success: true });
    const mutation = mocks.update.mock.calls[0][0];
    expect(mutation.where).toEqual({ id: "verified-user", hashed_password: currentHash });
    expect(getRounds(mutation.data.hashed_password)).toBe(12);
    expect(await compare("new-fixture", mutation.data.hashed_password)).toBe(true);
    expect(await compare(currentPassword, mutation.data.hashed_password)).toBe(false);
    expect(mutation.data).toMatchObject({ must_change_password: false, temp_password_expires_at: null });
  });

  it("denies an incorrect old password before the conditional write", async () => {
    expect(await changeAuthenticatedUserPassword("verified-user", { currentPassword: "wrong-fixture", newPassword: "new-fixture" })).toEqual({ success: false, error: "Current password is incorrect." });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns the existing missing-user error without writing", async () => {
    mocks.find.mockResolvedValue(null);
    expect(await changeAuthenticatedUserPassword("missing-user", { currentPassword, newPassword: "new-fixture" })).toEqual({ success: false, error: "User not found." });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a lost credential-version claim", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    expect(await changeAuthenticatedUserPassword("verified-user", { currentPassword, newPassword: "new-fixture" })).toMatchObject({ success: false });
    expect(mocks.update.mock.calls[0][0].where).toEqual({ id: "verified-user", hashed_password: currentHash });
  });
});
