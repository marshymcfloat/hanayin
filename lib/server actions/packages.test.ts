import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.hoisted(() => vi.fn());
const requireStaffPermissionMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
  },
  service: {
    count: vi.fn(),
  },
  servicePackage: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/auth/staff-access", () => ({
  requireStaffPermission: requireStaffPermissionMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { createPackageAction, updatePackageAction } from "./packages";

describe("package server actions tenant boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
    });
    requireStaffPermissionMock.mockResolvedValue({
      success: true,
      context: {
        businessSlug: "tenant-a",
      },
    } as never);
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_a", slug: "tenant-a" });
  });

  it("rejects package items that do not belong to authenticated tenant", async () => {
    prismaMock.service.count.mockResolvedValue(0);

    const result = await createPackageAction({
      businessSlug: "tenant-a",
      category: "Bundles",
      description: "Starter package",
      duration: 60,
      items: [{ serviceId: 999, customPrice: 800 }],
      name: "Starter",
      price: 1500,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: "One or more package services are invalid for this business.",
      }),
    );
    expect(prismaMock.servicePackage.create).not.toHaveBeenCalled();
  });

  it("rejects update for package outside tenant scope", async () => {
    prismaMock.servicePackage.findUnique.mockResolvedValue({
      business: { id: "biz_b", slug: "tenant-b" },
    });

    const result = await updatePackageAction(123, {
      category: "Bundles",
      description: "Updated",
      duration: 45,
      items: [],
      name: "Updated",
      price: 999,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: "Package not found or unauthorized",
      }),
    );
  });

  it("returns permission error when catalog manage access is missing", async () => {
    requireStaffPermissionMock.mockResolvedValue({
      success: false,
      error: "Forbidden",
    });

    const result = await createPackageAction({
      businessSlug: "tenant-a",
      category: "Bundles",
      items: [],
      name: "Starter",
      price: 1500,
    });

    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(prismaMock.business.findUnique).not.toHaveBeenCalled();
  });
});
