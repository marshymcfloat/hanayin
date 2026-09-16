// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.hoisted(() => vi.fn());
const requireStaffPermissionMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
  },
  service: {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
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

import { createServiceAction, updateServiceAction } from "./services";

describe("service server actions tenant boundaries", () => {
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
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_a" });
  });

  it("rejects flow suggestions that do not belong to the authenticated tenant", async () => {
    prismaMock.service.count.mockResolvedValue(0);

    const result = await createServiceAction({
      name: "Color",
      price: 1000,
      category: "Hair",
      flows: [
        {
          suggested_service_id: 99,
          delay_duration: 7,
          delay_unit: "DAYS",
          type: "SUGGESTED",
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: "One or more suggested services are invalid for this business.",
      }),
    );
    expect(prismaMock.service.create).not.toHaveBeenCalled();
  });

  it("rejects updates for services outside tenant scope", async () => {
    prismaMock.service.count.mockResolvedValue(0);
    prismaMock.service.findFirst.mockResolvedValue(null);

    const result = await updateServiceAction(123, {
      name: "Updated",
      category: "Hair",
      price: 1200,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: "Service not found or unauthorized",
      }),
    );
  });
});
