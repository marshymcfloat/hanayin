import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ServiceClaimSelector from "./ServiceClaimSelector";

const services = [
  { id: 1, uniqueId: "1-0", name: "Manicure", price: 280, duration: 60, quantity: 1 },
  { id: 1, uniqueId: "1-1", name: "Manicure", price: 280, duration: 60, quantity: 1 },
];

describe("owner per-unit claims", () => {
  it("keeps claim decisions tied to distinct service units", () => {
    const onChange = vi.fn();
    const view = render(<ServiceClaimSelector presentation="owner" services={services} claimedUniqueIds={[]} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("checkbox", { name: /Manicure/i })[0]);
    expect(onChange).toHaveBeenCalledWith(["1-0"]);
    view.rerender(<ServiceClaimSelector presentation="owner" services={services} claimedUniqueIds={["1-0"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim all" }));
    expect(onChange).toHaveBeenCalledWith(["1-0", "1-1"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
