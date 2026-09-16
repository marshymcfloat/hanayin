import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  businessDelete: vi.fn(),
  businessFindUnique: vi.fn(),
  createBusinessWithSubscription: vi.fn(),
  createOnboardingLoginToken: vi.fn(),
  generateBusinessInitials: vi.fn(),
  generateUniqueBusinessSlug: vi.fn(),
  getBusinessStructureTemplate: vi.fn(),
  logPlatformAction: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  normalizeBusinessStructure: vi.fn(),
  onboardingFindFirst: vi.fn(),
  onboardingFindUnique: vi.fn(),
  onboardingUpdate: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  seedDemoBusiness: vi.fn(),
  sendSemaphoreMagicLink: vi.fn(),
  supportsOnboardingApplicationModel: vi.fn(),
  userDelete: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/features/billing/subscription-service", () => ({
  DEFAULT_SUBSCRIPTION_PLAN_CODE: "STARTER_MONTHLY",
  SUBSCRIPTION_PLAN_CODES: ["STARTER_MONTHLY", "PLUS_MONTHLY", "PRO_MONTHLY"],
}));
vi.mock("@/features/demo-trial/seed-demo-business", () => ({
  seedDemoBusiness: mocks.seedDemoBusiness,
}));
vi.mock("./business-admin", () => ({
  createBusinessWithSubscription: mocks.createBusinessWithSubscription,
  generateBusinessInitials: mocks.generateBusinessInitials,
  generateUniqueBusinessSlug: mocks.generateUniqueBusinessSlug,
}));
vi.mock("@/lib/auth/guards", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock("@/lib/business-structure", () => ({
  getBusinessStructureTemplate: mocks.getBusinessStructureTemplate,
  normalizeBusinessStructure: mocks.normalizeBusinessStructure,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn },
}));
vi.mock("@/lib/security/onboarding-login-token", () => ({
  createOnboardingLoginToken: mocks.createOnboardingLoginToken,
  ONBOARDING_LOGIN_TOKEN_TTL_SECONDS_DEFAULT: 3600,
}));
vi.mock("@/lib/services/sms-otp", () => ({
  sendSemaphoreMagicLink: mocks.sendSemaphoreMagicLink,
}));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    business: {
      delete: mocks.businessDelete,
      findUnique: mocks.businessFindUnique,
    },
    onboardingApplication: {
      findFirst: mocks.onboardingFindFirst,
      findUnique: mocks.onboardingFindUnique,
      update: mocks.onboardingUpdate,
    },
    user: { delete: mocks.userDelete, update: mocks.userUpdate },
  },
  supportsOnboardingApplicationModel: mocks.supportsOnboardingApplicationModel,
}));
vi.mock("./platform-action-log", () => ({
  logPlatformAction: mocks.logPlatformAction,
}));

import {
  convertOnboardingApplicationToBusiness,
  resendMagicLink,
  updateOnboardingApplicationStatus,
} from "./onboarding-admin";

const application = {
  id: "application_1",
  business_name: "North Star Salon",
  owner_name: "Jamie Cruz",
  owner_phone: "+639170000001",
  requested_structure: "SOLO",
  requested_allow_employee_self_booking: null,
  requested_manager_can_serve: null,
  converted_business_id: null,
  status: "NEW",
  review_notes: null,
  referral_code: { code: "PARTNER", is_active: true },
};

const creation = {
  success: true as const,
  business: { id: "business_1", slug: "north-star-salon" },
  ownerUserId: "owner_1",
  ownerContactNumber: application.owner_phone,
  ownerPassword: "temporary-password",
};

describe("platform onboarding administration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T04:00:00.000Z"));
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://serviceflow.test");
    vi.stubEnv("NEXTAUTH_URL", "");
    mocks.requirePlatformAdmin.mockResolvedValue({
      success: true,
      session: { user: { id: "admin_1" } },
    });
    mocks.supportsOnboardingApplicationModel.mockReturnValue(true);
    mocks.generateUniqueBusinessSlug.mockResolvedValue("north-star-salon");
    mocks.generateBusinessInitials.mockReturnValue("NS");
    mocks.normalizeBusinessStructure.mockReturnValue("SOLO");
    mocks.getBusinessStructureTemplate.mockReturnValue({
      allowEmployeeSelfBooking: false,
      managerCanServe: true,
    });
    mocks.createBusinessWithSubscription.mockResolvedValue(creation);
    mocks.onboardingFindUnique.mockResolvedValue(application);
    mocks.onboardingUpdate.mockResolvedValue({
      ...application,
      status: "CONVERTED",
      converted_business_id: creation.business.id,
    });
    mocks.userUpdate.mockResolvedValue({ id: creation.ownerUserId });
    mocks.seedDemoBusiness.mockResolvedValue({ employees: 2, services: 3 });
    mocks.createOnboardingLoginToken.mockReturnValue("token + value");
    mocks.sendSemaphoreMagicLink.mockResolvedValue({ success: true });
  });

  it("returns a safe failure when the optional application model is unavailable", async () => {
    mocks.supportsOnboardingApplicationModel.mockReturnValue(false);

    await expect(
      updateOnboardingApplicationStatus({} as never),
    ).resolves.toEqual({
      success: false,
      error: "Onboarding applications are unavailable. Restart the server.",
    });
    expect(mocks.onboardingUpdate).not.toHaveBeenCalled();
  });

  it("stamps terminal review status and audits the transition", async () => {
    mocks.onboardingUpdate.mockResolvedValue({
      id: application.id,
      status: "APPROVED",
      review_notes: "Verified",
    });

    const result = await updateOnboardingApplicationStatus({
      applicationId: application.id,
      status: "APPROVED",
      reviewNotes: "Verified",
    });

    expect(result.success).toBe(true);
    expect(mocks.onboardingUpdate).toHaveBeenCalledWith({
      where: { id: application.id },
      data: {
        status: "APPROVED",
        review_notes: "Verified",
        reviewed_by_user_id: "admin_1",
        reviewed_at: new Date("2026-09-16T04:00:00.000Z"),
      },
    });
    expect(mocks.logPlatformAction).toHaveBeenCalledWith({
      action: "ONBOARDING_APPLICATION_STATUS_UPDATED",
      targetType: "OnboardingApplication",
      targetId: application.id,
      metadata: { status: "APPROVED", hasReviewNotes: true },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platform/applications");
  });

  it.each([
    [null, "Onboarding application not found"],
    [
      { ...application, converted_business_id: "business_old" },
      "Application already converted",
    ],
    [
      { ...application, status: "REJECTED" },
      "Application is REJECTED. Re-open it (mark NEW or CONTACTED) before converting.",
    ],
  ])("rejects missing or stale applications without creating a business", async (record, error) => {
    mocks.onboardingFindUnique.mockResolvedValue(record);

    await expect(
      convertOnboardingApplicationToBusiness({
        applicationId: application.id,
        ownerPassword: "temporary-password",
      }),
    ).resolves.toEqual({ success: false, error });
    expect(mocks.createBusinessWithSubscription).not.toHaveBeenCalled();
  });

  it("rejects an application without an owner contact number", async () => {
    mocks.onboardingFindUnique.mockResolvedValue({
      ...application,
      owner_phone: null,
    });

    const result = await convertOnboardingApplicationToBusiness({
      applicationId: application.id,
      ownerPassword: "temporary-password",
    });

    expect(result).toEqual({
      success: false,
      error:
        "Application is missing the owner contact number. Ask the applicant to provide one before converting.",
    });
    expect(mocks.createBusinessWithSubscription).not.toHaveBeenCalled();
  });

  it("compensates across workflows when linking the created business fails", async () => {
    mocks.onboardingUpdate.mockRejectedValue(new Error("stale application"));
    mocks.businessDelete.mockResolvedValue({ id: creation.business.id });
    mocks.userDelete.mockResolvedValue({ id: creation.ownerUserId });

    const result = await convertOnboardingApplicationToBusiness({
      applicationId: application.id,
      ownerPassword: "temporary-password",
      seedDemoData: false,
    });

    expect(result).toEqual({
      success: false,
      error:
        "Failed to link application to new business; conversion rolled back. Try again.",
    });
    expect(mocks.businessDelete).toHaveBeenCalledWith({
      where: { id: creation.business.id },
    });
    expect(mocks.userDelete).toHaveBeenCalledWith({
      where: { id: creation.ownerUserId },
    });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.logPlatformAction).not.toHaveBeenCalled();
  });

  it("returns the same safe failure and records both errors when compensation fails", async () => {
    mocks.onboardingUpdate.mockRejectedValue(new Error("link failed"));
    mocks.businessDelete.mockRejectedValue(new Error("rollback failed"));

    await expect(
      convertOnboardingApplicationToBusiness({
        applicationId: application.id,
        ownerPassword: "temporary-password",
      }),
    ).resolves.toEqual({
      success: false,
      error:
        "Failed to link application to new business; conversion rolled back. Try again.",
    });
    expect(mocks.loggerError).toHaveBeenCalledTimes(2);
    expect(mocks.userDelete).not.toHaveBeenCalled();
  });

  it("creates, audits, and sends an encoded onboarding token", async () => {
    const result = await convertOnboardingApplicationToBusiness({
      applicationId: application.id,
      ownerPassword: "temporary-password",
    });

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        magicLink:
          "https://serviceflow.test/login/magic?token=token%20%2B%20value&slug=north-star-salon",
        magicLinkExpiresInSeconds: 3600,
        smsDelivery: "sent",
      }),
    });
    expect(mocks.createBusinessWithSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        businessSlug: "north-star-salon",
        initials: "NS",
        referralCode: "PARTNER",
        structure: "SOLO",
        allowEmployeeSelfBooking: false,
        managerCanServe: true,
      }),
    );
    expect(mocks.createOnboardingLoginToken).toHaveBeenCalledWith({
      userId: creation.ownerUserId,
      applicationId: application.id,
    });
    expect(mocks.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ONBOARDING_APPLICATION_CONVERTED",
        targetId: application.id,
        businessId: creation.business.id,
      }),
    );
    expect(mocks.sendSemaphoreMagicLink).toHaveBeenCalledWith(
      application.owner_phone,
      "https://serviceflow.test/login/magic?token=token%20%2B%20value&slug=north-star-salon",
    );
  });

  it("uses the deterministic primary owner and safely skips SMS without a contact number", async () => {
    mocks.businessFindUnique.mockResolvedValue({
      id: creation.business.id,
      slug: creation.business.slug,
      owners: [
        { user_id: creation.ownerUserId, user: { contact_number: null, name: "Jamie" } },
      ],
    });
    mocks.onboardingFindFirst.mockResolvedValue({ id: application.id });

    const result = await resendMagicLink(creation.business.id);

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ smsDelivery: "skipped" }),
    });
    expect(mocks.businessFindUnique).toHaveBeenCalledWith({
      where: { id: creation.business.id },
      select: expect.objectContaining({
        owners: expect.objectContaining({
          orderBy: [{ is_primary: "desc" }, { id: "asc" }],
          take: 1,
        }),
      }),
    });
    expect(mocks.createOnboardingLoginToken).toHaveBeenCalledWith({
      userId: creation.ownerUserId,
      applicationId: application.id,
    });
    expect(mocks.sendSemaphoreMagicLink).not.toHaveBeenCalled();
    expect(mocks.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MAGIC_LINK_RESENT",
        metadata: { smsDelivery: "skipped" },
      }),
    );
  });

  it.each([
    [null, "Business not found"],
    [
      { id: creation.business.id, slug: creation.business.slug, owners: [] },
      "Business has no owner record",
    ],
  ])("fails safely when resend owner lookup is incomplete", async (record, error) => {
    mocks.businessFindUnique.mockResolvedValue(record);

    await expect(resendMagicLink(creation.business.id)).resolves.toEqual({
      success: false,
      error,
    });
    expect(mocks.createOnboardingLoginToken).not.toHaveBeenCalled();
    expect(mocks.logPlatformAction).not.toHaveBeenCalled();
  });
});
