import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), refresh: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/bookings/actions/booking-modify", () => ({ cancelBookingAction: mocks.cancel }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { CancelBookingDialog } from "@/components/dashboard/owner/booking-actions/CancelBookingDialog";

const props = { bookingId: 20, customerLabel: "Harness Customer" };
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
  await screen.findByRole("dialog", { name: "Cancel this booking?" });
}
function reason(value: string) {
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value } });
}

describe("CancelBookingDialog control compatibility", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.cancel.mockResolvedValue({ success: true }); });

  it("preserves the default trigger and trims the required reason", async () => {
    render(<CancelBookingDialog {...props} />); await open();
    expect(screen.getByRole("button", { name: "Confirm cancel" })).toBeDisabled();
    reason("   "); expect(screen.getByRole("button", { name: "Confirm cancel" })).toBeDisabled();
    reason("x".repeat(501)); expect(screen.getByRole("button", { name: "Confirm cancel" })).toBeDisabled();
    reason("  Requested  "); fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.cancel).toHaveBeenCalledWith({ bookingId: 20, reason: "Requested" });
    expect(mocks.refresh).toHaveBeenCalledOnce(); expect(mocks.success).toHaveBeenCalledWith("Booking cancelled");
  });
  it("notifies a preview caller without refreshing the route", async () => {
    const onChanged = vi.fn();
    render(<CancelBookingDialog {...props} onChanged={onChanged} />); await open(); reason("Requested");
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("disables repeated submission while the canonical action is pending", async () => {
    let resolve!: (value: { success: true }) => void;
    mocks.cancel.mockReturnValue(new Promise<{ success: true }>(done => { resolve = done; }));
    render(<CancelBookingDialog {...props} />); await open(); reason("Requested");
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));
    expect(screen.getByRole("button", { name: "Cancelling..." })).toBeDisabled();
    expect(screen.getByLabelText("Reason")).toBeDisabled(); expect(screen.getByRole("button", { name: "Keep booking" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelling..." })); expect(mocks.cancel).toHaveBeenCalledOnce();
    resolve({ success: true }); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("preserves close/reopen reason reset in uncontrolled mode", async () => {
    render(<CancelBookingDialog {...props} />); await open(); reason("Old reason");
    fireEvent.click(screen.getByRole("button", { name: "Keep booking" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await open(); expect(screen.getByLabelText("Reason")).toHaveValue(""); expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it("supports controlled opening and reports closing without adding another trigger", async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<CancelBookingDialog {...props} open={false} onOpenChange={onOpenChange} />);
    expect(screen.queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
    rerender(<CancelBookingDialog {...props} open onOpenChange={onOpenChange} />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep booking" })); expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<CancelBookingDialog {...props} open={false} onOpenChange={onOpenChange} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it("retains the dialog and restores submission after an action throws", async () => {
    mocks.cancel.mockRejectedValue(new Error("Fixture cancellation unavailable"));
    render(<CancelBookingDialog {...props} />); await open(); reason("Requested");
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm cancel" })).not.toBeDisabled();
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });
});
