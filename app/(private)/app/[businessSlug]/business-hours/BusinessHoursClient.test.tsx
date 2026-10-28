import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessHoursClient } from "./BusinessHoursClient";
import { DEFAULT_BOOKING_POLICY } from "@/lib/types/booking-policy";

const mocks = vi.hoisted(() => ({ hours: vi.fn(), policy: vi.fn(), success: vi.fn(), error: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/businesses/actions/business-hours", () => ({ updateBusinessHours: mocks.hours }));
vi.mock("@/features/bookings/actions/booking-policy", () => ({ updateBookingPolicy: mocks.policy }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.hours.mockResolvedValue({ success: true });
  mocks.policy.mockResolvedValue({ success: true });
});
afterEach(cleanup);

const fixtureHours = Array.from({ length: 7 }, (_, day) => ({
  day_of_week: day, category: "GENERAL", open_time: "09:00", close_time: "18:00", is_closed: true,
}));

function save() {
  render(<BusinessHoursClient initialHours={fixtureHours} categories={[]} initialPolicy={DEFAULT_BOOKING_POLICY} businessSlug="fixture-slug" />);
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
}

describe("settings save feedback", () => {
  it("announces success only after both saves succeed", async () => {
    save();
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Business hours and booking policy saved"));
    expect(mocks.hours).toHaveBeenCalledWith("fixture-slug", fixtureHours);
    expect(mocks.policy).toHaveBeenCalledWith("fixture-slug", DEFAULT_BOOKING_POLICY);
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(["hours", "policy"] as const)("reports partial success and the returned %s failure", async target => {
    mocks[target].mockResolvedValue({ success: false, error: "Forbidden" });
    save();
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Some changes were saved. Forbidden"));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("reports both denials without a success toast or refresh", async () => {
    mocks.hours.mockResolvedValue({ success: false, error: "Hours denied." });
    mocks.policy.mockResolvedValue({ success: false, error: "Policy denied." });
    save();
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Hours denied. Policy denied."));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("waits for the other request after a rejection before reporting partial save", async () => {
    let finish!: (value: { success: true }) => void;
    mocks.hours.mockRejectedValue(new Error("Request failed."));
    mocks.policy.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    save();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    await Promise.resolve();
    expect(mocks.error).not.toHaveBeenCalled();
    finish({ success: true });
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Some changes were saved. Request failed."));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save Changes" })).not.toBeDisabled();
  });

  it("uses fallback feedback for non-Error transport failures", async () => {
    mocks.hours.mockRejectedValue(null);
    mocks.policy.mockRejectedValue(null);
    save();
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Failed to save changes Failed to save changes"));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
