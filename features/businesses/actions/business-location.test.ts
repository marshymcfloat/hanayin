import { beforeEach, describe, expect, it, vi } from "vitest";

const requireTenantWriteAccessMock = vi.hoisted(() => vi.fn());
const setBusinessLocationMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/guards", () => ({
  requireTenantWriteAccess: requireTenantWriteAccessMock,
}));
vi.mock("@/features/businesses/repositories/business-location", () => ({
  setBusinessLocation: setBusinessLocationMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { updateBusinessLocation } from "./business-location";

describe("updateBusinessLocation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireTenantWriteAccessMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
    });
    setBusinessLocationMock.mockResolvedValue(undefined);
  });

  it("rejects invalid coordinates before authentication or persistence", async () => {
    await expect(
      updateBusinessLocation("tenant-a", 91, 121),
    ).rejects.toThrow();

    expect(requireTenantWriteAccessMock).not.toHaveBeenCalled();
    expect(setBusinessLocationMock).not.toHaveBeenCalled();
  });

  it("returns authorization denial without writing another tenant", async () => {
    requireTenantWriteAccessMock.mockResolvedValue({
      success: false,
      error: "Forbidden",
    });

    await expect(updateBusinessLocation("tenant-b", 14.5, 121)).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    expect(requireTenantWriteAccessMock).toHaveBeenCalledWith("tenant-b");
    expect(setBusinessLocationMock).not.toHaveBeenCalled();
  });

  it("writes only the authorized slug and invalidates its pages", async () => {
    await expect(
      updateBusinessLocation("tenant-a", 14.5, 121),
    ).resolves.toEqual({ success: true });

    expect(setBusinessLocationMock).toHaveBeenCalledWith({
      businessSlug: "tenant-a",
      latitude: 14.5,
      longitude: 121,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenant-a");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenant-a/business");
  });
});
