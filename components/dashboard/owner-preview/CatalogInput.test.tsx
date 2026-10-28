import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CatalogInput } from "./CatalogInput";

describe("catalog input validation", () => {
  it("shows an inline error and focuses the first invalid input", () => {
    render(<form><label>Name<CatalogInput required /></label><label>Price<CatalogInput type="number" required /></label></form>);
    const name = screen.getByLabelText("Name");
    fireEvent.invalid(name);
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveFocus();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(name, { target: { value: "Massage" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
