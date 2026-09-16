import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  businessFindUnique: vi.fn(),
  createOnboardingLoginToken: vi.fn(),
  logPlatformAction: vi.fn(),
  requirePlatformAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock("@/lib/security/onboarding-login-token", () => ({
  createOnboardingLoginToken: mocks.createOnboardingLoginToken,
}));
vi.mock("@/prisma/prisma", () => ({
  prisma: { business: { findUnique: mocks.businessFindUnique } },
}));
vi.mock("./platform-action-log", () => ({
  logPlatformAction: mocks.logPlatformAction,
}));

import { impersonateBusinessOwner } from "./impersonation-admin";

describe("platform owner impersonation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://serviceflow.test");
    vi.stubEnv("NEXTAUTH_URL", "");
    mocks.requirePlatformAdmin.mockResolvedValue({
      success: true,
      session: { user: { id: "admin_1" } },
    });
    mocks.createOnboardingLoginToken.mockReturnValue("token + value");
  });

  it("denies access before owner lookup", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({
      success: false,
      error: "Forbidden",
    });

    await expect(impersonateBusinessOwner("business_1")).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    expect(mocks.businessFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    [null, "Business not found"],
    [
      { id: "business_1", slug: "north-star", name: "North Star", owners: [] },
      "Business has no owner record",
    ],
  ])("fails safely for missing business or owner records", async (record, error) => {
    mocks.businessFindUnique.mockResolvedValue(record);

    await expect(impersonateBusinessOwner("business_1")).resolves.toEqual({
      success: false,
      error,
    });
    expect(mocks.createOnboardingLoginToken).not.toHaveBeenCalled();
    expect(mocks.logPlatformAction).not.toHaveBeenCalled();
  });

  it("selects the primary owner and creates a short-lived audited token", async () => {
    mocks.businessFindUnique.mockResolvedValue({
      id: "business_1",
      slug: "north star/branch",
      name: "North Star",
      owners: [{ user_id: "owner_1" }],
    });

    const result = await impersonateBusinessOwner("business_1");

    expect(result).toEqual({
      success: true,
      data: {
        magicLink:
          "https://serviceflow.test/login/magic?token=token%20%2B%20value&slug=north%20star%2Fbranch",
        expiresInSeconds: 900,
        businessName: "North Star",
      },
    });
    expect(mocks.businessFindUnique).toHaveBeenCalledWith({
      where: { id: "business_1" },
      select: {
        id: true,
        slug: true,
        name: true,
        owners: {
          orderBy: [{ is_primary: "desc" }, { id: "asc" }],
          take: 1,
          select: { user_id: true },
        },
      },
    });
    expect(mocks.createOnboardingLoginToken).toHaveBeenCalledWith({
      userId: "owner_1",
      applicationId: "impersonate:admin_1:business_1",
      ttlSeconds: 900,
    });
    expect(mocks.logPlatformAction).toHaveBeenCalledWith({
      action: "BUSINESS_OWNER_IMPERSONATED",
      targetType: "Business",
      targetId: "business_1",
      businessId: "business_1",
      metadata: { ownerUserId: "owner_1", ttlSeconds: 900 },
    });
  });
});
