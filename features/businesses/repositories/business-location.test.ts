import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMock = vi.hoisted(() => vi.fn());
vi.mock("@/prisma/prisma", () => ({
  prisma: { business: { update: updateMock } },
}));

import { setBusinessLocation } from "./business-location";

describe("setBusinessLocation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("scopes the update to the verified business slug", async () => {
    updateMock.mockResolvedValue({ id: "business-1" });

    await setBusinessLocation({
      businessSlug: "tenant-a",
      latitude: 14.5,
      longitude: 121,
    });

    expect(updateMock).toHaveBeenCalledWith({
      where: { slug: "tenant-a" },
      data: { latitude: 14.5, longitude: 121 },
    });
  });
});
