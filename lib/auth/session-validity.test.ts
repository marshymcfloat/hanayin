import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/prisma/prisma";
import { isSessionUserValid } from "./session-validity";

vi.mock("@/prisma/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

const lookup = vi.mocked(prisma.user.findUnique);
const token = { id: "deleted-user", role: "OWNER" as const, businessSlug: "salon" };

describe("session account validation", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("rejects deleted users and tokens without an ID", async () => {
    lookup.mockResolvedValue(null);
    expect(await isSessionUserValid(token)).toBe(false);
    expect(await isSessionUserValid({ ...token, id: "" })).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["OWNER", { business: { slug: "salon" } }, null, true],
    ["OWNER", null, null, false],
    ["OWNER", { business: { slug: "other" } }, null, false],
    ["EMPLOYEE", null, { business: { slug: "salon" } }, true],
    ["EMPLOYEE", null, null, false],
    ["PLATFORM_ADMIN", null, null, true],
  ] as const)("checks %s workspace membership (%#)", async (role, owner, employee, valid) => {
    lookup.mockResolvedValue({ role, owner, employee } as never);
    expect(await isSessionUserValid({ ...token, role })).toBe(valid);
  });

  it("rejects stale roles", async () => {
    lookup.mockResolvedValue({ role: "EMPLOYEE" } as never);
    expect(await isSessionUserValid(token)).toBe(false);
  });

  it("does not classify database outages as deleted accounts", async () => {
    lookup.mockRejectedValue(new Error("Database unavailable"));
    await expect(isSessionUserValid(token)).rejects.toThrow("Database unavailable");
  });
});
