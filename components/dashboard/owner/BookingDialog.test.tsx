import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/bookings/BookingForm", () => ({
  default: ({ onSuccess }: { onSuccess: () => void }) => <button type="button" onClick={onSuccess}>Complete booking form</button>,
}));

import { BookingDialog } from "./BookingDialog";

describe("BookingDialog", () => {
  it("calls the preview callback only after the booking form confirms success", () => {
    const onCreated = vi.fn();
    render(<BookingDialog businessSlug="beautyfeel" services={[]} packages={[]} categories={[]} onCreated={onCreated} trigger={<button type="button">New booking</button>} />);
    expect(onCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Close booking form" }));
    expect(onCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete booking form" }));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});
