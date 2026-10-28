import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { compare, hashSync } from "bcryptjs";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { prisma } from "@/prisma/prisma";
import { changeAuthenticatedUserPassword } from "@/features/auth/services/password-change";

const controls = vi.hoisted(() => ({ beforeWrite: null as (() => Promise<void>) | null }));
vi.mock("server-only", () => ({}));
vi.mock("bcryptjs", async original => {
  const bcrypt = await original<typeof import("bcryptjs")>();
  return {
    ...bcrypt,
    hash: async (password: string, rounds: number) => {
      const hashed = await bcrypt.hash(password, rounds);
      await controls.beforeWrite?.();
      return hashed;
    },
  };
});
requireTestDatabase();

const factory = createSharedWorkflowFactory({ namespace: `integration-password-${randomUUID()}` });
const fixture = factory.user({ contactNumber: `test-password-${randomUUID()}` });
const currentPassword = "old-fixture";
const currentHash = hashSync(currentPassword, "$2b$04$abcdefghijklmnopqrstuu");
const expiry = new Date("2030-01-15T09:00:00Z");

describe("password credential-version claim in PostgreSQL", () => {
  beforeEach(async () => {
    controls.beforeWrite = null;
    await prisma.user.upsert({
      where: { id: fixture.id },
      create: { id: fixture.id, name: fixture.name, contact_number: fixture.contactNumber, hashed_password: currentHash, must_change_password: true, temp_password_expires_at: expiry },
      update: { hashed_password: currentHash, must_change_password: true, temp_password_expires_at: expiry },
    });
  });

  afterAll(async () => {
    controls.beforeWrite = null;
    try { await prisma.user.deleteMany({ where: { id: fixture.id } }); }
    finally { await prisma.$disconnect(); }
  });

  it("allows only one of two changes that both checked the same old hash", async () => {
    let arrived = 0;
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    controls.beforeWrite = async () => {
      arrived += 1;
      if (arrived === 2) release();
      await ready;
    };
    const passwords = ["new-fixture-one", "new-fixture-two"];
    const results = await Promise.all(passwords.map(newPassword =>
      changeAuthenticatedUserPassword(fixture.id, { currentPassword, newPassword }),
    ));
    controls.beforeWrite = null;
    expect(arrived).toBe(2);
    expect(results.filter(result => result.success)).toHaveLength(1);
    expect(results.filter(result => !result.success)).toEqual([
      { success: false, error: "Password changed. Please retry with your current password." },
    ]);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: fixture.id } });
    const winner = results.findIndex(result => result.success);
    expect(await compare(passwords[winner], stored.hashed_password)).toBe(true);
    expect(await compare(passwords[1 - winner], stored.hashed_password)).toBe(false);
    expect(stored.must_change_password).toBe(false);
    expect(stored.temp_password_expires_at).toBeNull();
  });

  it("leaves credentials and temporary flags untouched for an incorrect old password", async () => {
    expect(await changeAuthenticatedUserPassword(fixture.id, { currentPassword: "wrong-fixture", newPassword: "new-fixture" })).toEqual({ success: false, error: "Current password is incorrect." });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: fixture.id } });
    expect(stored.hashed_password).toBe(currentHash);
    expect(stored.must_change_password).toBe(true);
    expect(stored.temp_password_expires_at).toEqual(expiry);
  });
});
