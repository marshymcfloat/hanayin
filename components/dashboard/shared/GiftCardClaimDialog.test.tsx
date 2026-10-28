import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/bookings/GiftCardClaimForm", () => ({
  default: ({ onSuccess }: { onSuccess: () => void }) => <button type="button" onClick={onSuccess}>Complete gift claim</button>,
}));

import { GiftCardClaimDialog } from "./GiftCardClaimDialog";

describe("GiftCardClaimDialog", () => {
  it("uses targeted refresh when the preview supplies a successful-claim callback", () => {
    const onClaimed = vi.fn();
    render(<GiftCardClaimDialog businessSlug="beautyfeel" onClaimed={onClaimed} trigger={<button type="button">Claim gift card booking</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim gift card booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Close gift card claim" }));
    expect(onClaimed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Claim gift card booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete gift claim" }));
    expect(onClaimed).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
