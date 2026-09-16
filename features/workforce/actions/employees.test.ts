// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
  },
  employee: {
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { deleteEmployeeAction } from "./employees";

describe("employee server actions tenant boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: {
        user: {
          role: "OWNER",
        },
      },
    });
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_a" });
  });

  it("rejects deleting employees outside tenant scope", async () => {
    prismaMock.employee.findFirst.mockResolvedValue(null);

    const result = await deleteEmployeeAction(99);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: "Employee not found",
      }),
    );
    expect(prismaMock.employee.delete).not.toHaveBeenCalled();
  });
});
