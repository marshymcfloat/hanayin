import { beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn());
const submitMock = vi.hoisted(() => vi.fn());
const persistenceAvailableMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/features/platform/onboarding/create-application", () => ({
  submitOnboardingApplication: submitMock,
}));
vi.mock("@/features/platform/onboarding/repository", () => ({
  isOnboardingApplicationPersistenceAvailable: persistenceAvailableMock,
}));

import { createOnboardingApplicationAction } from "./applications";

const validInput = {
  businessName: "Acme Salon",
  ownerName: "Owner One",
  ownerEmail: "Owner@Example.com",
};

describe("createOnboardingApplicationAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    persistenceAvailableMock.mockReturnValue(true);
    headersMock.mockResolvedValue(
      new Headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" }),
    );
    rateLimitMock.mockResolvedValue({ success: true });
    submitMock.mockResolvedValue({ success: true, data: { id: "application-1" } });
  });

  it("returns the stable unavailable response before accepting input", async () => {
    persistenceAvailableMock.mockReturnValue(false);

    await expect(
      createOnboardingApplicationAction({} as never),
    ).resolves.toEqual({
      success: false,
      error: "Onboarding applications are unavailable. Please restart the server.",
    });
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("rejects invalid public input before rate limiting or persistence", async () => {
    await expect(
      createOnboardingApplicationAction({ ...validInput, ownerEmail: "invalid" }),
    ).rejects.toThrow();

    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("rate limits the public action by client IP and normalized email", async () => {
    rateLimitMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    await expect(createOnboardingApplicationAction(validInput)).resolves.toEqual({
      success: false,
      error: "Too many applications. Please try again later.",
    });
    expect(rateLimitMock).toHaveBeenNthCalledWith(
      1,
      "apply:ip:203.0.113.8",
      expect.objectContaining({ maxRequests: 10 }),
    );
    expect(rateLimitMock).toHaveBeenNthCalledWith(
      2,
      "apply:email:owner@example.com",
      expect.objectContaining({ maxRequests: 3 }),
    );
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("submits validated public applications without requiring authentication", async () => {
    await createOnboardingApplicationAction(validInput);

    expect(submitMock).toHaveBeenCalledWith(validInput);
  });
});
