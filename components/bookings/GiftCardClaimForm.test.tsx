import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  mutations: [] as Array<{
    onSuccess: (result: unknown) => void;
    onError: () => void;
  }>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: typeof mocks.mutations[number]) => {
    mocks.mutations.push(options);
    return { mutate: vi.fn(), isPending: false };
  },
  useQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock("@/features/bookings/actions/availability", () => ({ getAvailableSlots: vi.fn() }));
vi.mock("@/features/gift-cards/actions/gift-cards", () => ({
  claimGiftCardBookingAction: vi.fn(),
  previewGiftCardClaimAction: vi.fn(),
}));

import GiftCardClaimForm from "./GiftCardClaimForm";

describe("gift-card claim navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutations.length = 0;
  });

  it("navigates with the booking ID and URL-encoded signed success token", () => {
    render(<GiftCardClaimForm businessSlug="demo" />);
    act(() => mocks.mutations[1].onSuccess({
      success: true,
      data: { bookingId: 42, successToken: "signed.token/+&" },
    }));

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(
      "/demo/booking/success?bookingId=42&token=signed.token%2F%2B%26",
    );
  });

  it("does not navigate when a claim is denied", () => {
    render(<GiftCardClaimForm businessSlug="demo" />);
    act(() => mocks.mutations[1].onSuccess({ success: false, error: "Claim denied" }));

    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("Claim denied");
  });

  it("keeps the business slug inside one local URL path segment", () => {
    render(<GiftCardClaimForm businessSlug="//foreign.example?x=1" />);
    act(() => mocks.mutations[1].onSuccess({
      success: true,
      data: { bookingId: 42, successToken: "signed.token" },
    }));

    expect(mocks.push).toHaveBeenCalledWith(
      "/%2F%2Fforeign.example%3Fx%3D1/booking/success?bookingId=42&token=signed.token",
    );
  });

  it("retains the staff callback without navigating to a public success page", () => {
    const onSuccess = vi.fn();
    render(<GiftCardClaimForm businessSlug="demo" mode="staff" onSuccess={onSuccess} />);
    act(() => mocks.mutations[1].onSuccess({
      success: true,
      data: { bookingId: 42, successToken: "signed.token" },
    }));

    expect(onSuccess).toHaveBeenCalledWith(42);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledWith("Gift card claimed and booking created.");
  });
});
