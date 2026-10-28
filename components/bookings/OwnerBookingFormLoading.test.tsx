import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OwnerBookingFormLoading } from "@/components/bookings/OwnerBookingFormLoading";

describe("owner booking JavaScript fallback", () => {
  it("shows static progress, summary and action chrome with only the catalog skeleton", () => {
    render(<OwnerBookingFormLoading />);
    expect(screen.getByRole("list", { name: "Booking progress" })).toBeInTheDocument();
    for (const label of ["Services", "Schedule", "Customer", "Review"]) {
      expect(screen.getByRole("button", { name: new RegExp(label + "$") })).toBeDisabled();
    }
    expect(screen.getByRole("heading", { name: "Choose services" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Booking summary" })).toBeInTheDocument();
    expect(screen.getByText("Schedule not selected")).toBeInTheDocument();
    expect(screen.getByText("Add customer details")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading service catalog" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Continue" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
