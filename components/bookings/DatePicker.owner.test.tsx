import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DatePicker from "./DatePicker";

describe("owner booking date picker", () => {
  it("closes its calendar portal when the retained owner form becomes inactive", async () => {
    const onChange = vi.fn();
    const view = render(<DatePicker presentation="owner" active onChange={onChange} minDate={new Date(2026, 9, 3)} maxDate={new Date(2026, 9, 16)} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick a date" }));
    expect(await screen.findByRole("grid")).toBeInTheDocument();
    expect(document.querySelector("[data-owner-booking-calendar]")).toBeInTheDocument();
    view.rerender(<DatePicker presentation="owner" active={false} onChange={onChange} minDate={new Date(2026, 9, 3)} maxDate={new Date(2026, 9, 16)} />);
    await waitFor(() => expect(document.querySelector("[data-owner-booking-calendar]")).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });
});
