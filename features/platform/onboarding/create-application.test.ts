import { beforeEach, describe, expect, it, vi } from "vitest";

const findReferralCodeMock = vi.hoisted(() => vi.fn());
const createApplicationMock = vi.hoisted(() => vi.fn());
const tokenMock = vi.hoisted(() => vi.fn());
const acknowledgementMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/platform/onboarding/repository", () => ({
  findReferralCode: findReferralCodeMock,
  createOnboardingApplication: createApplicationMock,
}));
vi.mock("@/lib/security/onboarding-status-token", () => ({
  createOnboardingStatusToken: tokenMock,
}));
vi.mock("@/lib/services/onboarding-applications", () => ({
  sendOnboardingApplicationAcknowledgement: acknowledgementMock,
}));

import { BusinessStructure } from "@/prisma/generated/prisma/enums";
import { submitOnboardingApplication } from "./create-application";

describe("submitOnboardingApplication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tokenMock.mockReturnValue("status-token");
    acknowledgementMock.mockResolvedValue({ success: true });
    createApplicationMock.mockResolvedValue({
      id: "application-1",
      owner_email: "owner@example.com",
      owner_name: "Owner One",
      business_name: "Acme Salon",
    });
  });

  it("rejects inactive referral codes before creating an application", async () => {
    findReferralCodeMock.mockResolvedValue({ id: "ref-1", is_active: false });

    await expect(
      submitOnboardingApplication({
        businessName: "Acme Salon",
        ownerName: "Owner One",
        ownerEmail: "owner@example.com",
        referralCode: " partner-1 ",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Referral code is invalid or inactive.",
    });
    expect(findReferralCodeMock).toHaveBeenCalledWith("PARTNER-1");
    expect(createApplicationMock).not.toHaveBeenCalled();
  });

  it("normalizes fields and applies structure defaults before persistence", async () => {
    findReferralCodeMock.mockResolvedValue({ id: "ref-1", is_active: true });

    const result = await submitOnboardingApplication({
      businessName: "  Acme Salon  ",
      ownerName: "  Owner One  ",
      ownerEmail: " OWNER@EXAMPLE.COM ",
      ownerPhone: " 09171234567 ",
      notes: " interested ",
      referralCode: " partner-1 ",
      requestedStructure: BusinessStructure.CASHIER_LED,
    });

    expect(createApplicationMock).toHaveBeenCalledWith({
      businessName: "Acme Salon",
      ownerName: "Owner One",
      ownerEmail: "owner@example.com",
      ownerPhone: "09171234567",
      notes: "interested",
      requestedStructure: BusinessStructure.CASHIER_LED,
      requestedAllowEmployeeSelfBooking: false,
      requestedManagerCanServe: false,
      referralCodeInput: "PARTNER-1",
      referralCodeId: "ref-1",
    });
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        statusToken: "status-token",
        acknowledgementSent: true,
      }),
    );
  });
});
