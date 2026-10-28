import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GiftCardClaimForm from "@/components/bookings/GiftCardClaimForm";

const actions = vi.hoisted(() => ({ preview: vi.fn(), claim: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: actions.success, error: actions.error } }));
vi.mock("@/features/gift-cards/actions/gift-cards", () => ({ previewGiftCardClaimAction: actions.preview, claimGiftCardBookingAction: actions.claim, createGiftCardAction: vi.fn(), updateGiftCardAction: vi.fn(), deleteGiftCardAction: vi.fn() }));
vi.mock("@/features/bookings/actions/availability", () => ({ getAvailableSlots: vi.fn().mockResolvedValue([]) }));
vi.mock("@/components/bookings/DatePicker", () => ({ default: () => <div>Date picker</div> }));
vi.mock("@/components/bookings/TimeSlotPicker", () => ({ default: () => <div>Time slots</div> }));
vi.mock("@/components/bookings/design-study/SelectionMotion", () => ({ useSelectionMotion: () => () => {} }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  actions.preview.mockResolvedValue({ success: true, data: { code: "LIVEGIFT", customerName: "Recipient", customerEmail: "recipient@example.com", expiresAt: "2026-12-31T15:59:59Z", lineItems: [{ serviceId: 1, serviceName: "Haircut", category: "Hair", duration: 30, packageId: null, packageName: null }], slotServices: [{ id: 1, quantity: 1 }], totalDuration: 30 } });
});
afterEach(() => vi.unstubAllGlobals());

describe("redesign gift-card claim confirmation", () => {
  it("waits for server commit, prevents duplicate clicks, and retains rejected values for retry", async () => {
    let finish!: (value: unknown) => void;
    actions.claim.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const onGiftCardClaimed = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><GiftCardClaimForm businessSlug="studio" mode="staff" onSuccess={onGiftCardClaimed} /></QueryClientProvider>);
    const code = await screen.findByLabelText("Gift card code");
    fireEvent.change(code, { target: { value: "LIVEGIFT" } });
    fireEvent.change(screen.getByLabelText("Email used for gift card"), { target: { value: "recipient@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify gift card" }));
    fireEvent.click(await screen.findByRole("button", { name: "Walk-in" }));
    const claim = screen.getByRole("button", { name: "Claim gift card as walk-in" });
    fireEvent.click(claim);
    await waitFor(() => expect(claim).toBeDisabled());
    fireEvent.click(claim);
    expect(actions.claim).toHaveBeenCalledTimes(1);
    expect(actions.claim).toHaveBeenCalledWith({ businessSlug: "studio", code: "LIVEGIFT", email: "recipient@example.com", scheduledAt: expect.any(Date), isWalkIn: true });
    expect(onGiftCardClaimed).not.toHaveBeenCalled();
    expect(actions.success).not.toHaveBeenCalledWith("Gift card claimed and booking created.");
    await act(async () => finish({ success: false, error: "Gift already claimed elsewhere" }));
    await waitFor(() => expect(actions.error).toHaveBeenCalledWith("Gift already claimed elsewhere"));
    expect(code).toHaveValue("LIVEGIFT");
    expect(screen.getByLabelText("Email used for gift card")).toHaveValue("recipient@example.com");
    expect(onGiftCardClaimed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Claim gift card as walk-in" }));
    await waitFor(() => expect(actions.claim).toHaveBeenCalledTimes(2));
    await act(async () => finish({ success: true, data: { bookingId: 42, successToken: "test-only" } }));
    await waitFor(() => expect(onGiftCardClaimed).toHaveBeenCalledTimes(1));
    expect(actions.success).toHaveBeenCalledWith("Gift card claimed and booking created.");
    expect(screen.getByLabelText("Gift card code")).toHaveValue("");
  });
});
