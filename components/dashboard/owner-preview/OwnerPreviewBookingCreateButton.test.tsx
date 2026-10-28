import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ openBooking: vi.fn(), pending: false, recoveryAvailable: false }));
vi.mock("./OwnerBookingController", () => ({ useOwnerBookingController: () => controller }));

import { OwnerPreviewBookingCreateButton } from "./OwnerPreviewBookingCreateButton";

beforeEach(() => {
  controller.openBooking.mockReset();
  controller.pending = false;
  controller.recoveryAvailable = false;
});

describe("owner preview booking creation", () => {
  it("opens the shared owner booking panel with the page focus target", () => {
    render(<OwnerPreviewBookingCreateButton businessSlug="beautyfeel" services={[]} packages={[]} categories={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    expect(controller.openBooking).toHaveBeenCalledWith("owner-new-booking-page");
  });

  it("offers the failed draft and blocks another submission while pending", () => {
    const view = render(<OwnerPreviewBookingCreateButton businessSlug="beautyfeel" services={[]} packages={[]} categories={[]} />);
    controller.pending = true;
    view.rerender(<OwnerPreviewBookingCreateButton businessSlug="beautyfeel" services={[]} packages={[]} categories={[]} />);
    expect(screen.getByRole("button", { name: "Creating booking…" })).toBeDisabled();
    controller.pending = false;
    controller.recoveryAvailable = true;
    view.rerender(<OwnerPreviewBookingCreateButton businessSlug="beautyfeel" services={[]} packages={[]} categories={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume booking" }));
    expect(controller.openBooking).toHaveBeenCalledWith("owner-new-booking-page");
  });
});
