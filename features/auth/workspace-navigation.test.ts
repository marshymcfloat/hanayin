import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/prisma/prisma", () => ({
  prisma: { user: { findUnique } },
}));

import { getWorkspaceSlugForUser } from "./workspace-navigation";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getWorkspaceSlugForUser", () => {
  it("prefers employee membership and returns only the slug", async () => {
    findUnique.mockResolvedValue({
      employee: { business: { slug: "employee-workspace" } },
      owner: { business: { slug: "owner-workspace" } },
    });

    await expect(getWorkspaceSlugForUser("user-1")).resolves.toBe(
      "employee-workspace",
    );
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
  });

  it("returns null when the user has no tenant membership", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getWorkspaceSlugForUser("missing")).resolves.toBeNull();
  });
});
