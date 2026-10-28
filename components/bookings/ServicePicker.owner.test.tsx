import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { Service } from "@/prisma/generated/prisma/client";

vi.mock("react-hook-form", () => ({ useWatch: () => [] }));
vi.mock("@/features/bookings/actions/availability", () => ({ checkCategoryAvailability: vi.fn() }));

import ServicePicker from "./ServicePicker";

const service = { id: 1, name: "Manicure", category: "Nails", price: 280, duration: 60 } as Service;

function renderPicker(disabled: boolean, setValue = vi.fn(), redesign = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ServicePicker
        presentation="owner"
        redesign={redesign}
        services={[service]}
        categories={["Nails"]}
        businessSlug="beautyfeel"
        form={{ control: {}, setValue }}
        disabled={disabled}
      />
    </QueryClientProvider>,
  );
  return setValue;
}

describe("owner service picker", () => {
  it("uses the redesigned catalog with real selections, search, and package filters", () => {
    const setValue = renderPicker(false, vi.fn(), true);
    fireEvent.click(screen.getByRole("option", { name: /Manicure/i }));
    expect(setValue).toHaveBeenCalledWith("services", [expect.objectContaining({ id: 1, quantity: 1, price: 280 })], { shouldDirty: true, shouldValidate: true });
    fireEvent.change(screen.getByRole("textbox", { name: "Search services" }), { target: { value: "missing" } });
    expect(screen.getByText("No matching services.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Packages/i }));
    expect(screen.getByText("No matching packages.")).toBeInTheDocument();
  });
  it("keeps the inline catalog read-only while disabled", () => {
    const setValue = renderPicker(true);
    expect(screen.getByRole("region", { name: "Choose services or packages" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Packages/i })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Search services" })).toBeDisabled();
    const option = screen.getByRole("option", { name: /Manicure/i });
    expect(option).toBeDisabled();
    fireEvent.click(option);
    expect(setValue).not.toHaveBeenCalled();
  });

  it("selects an available service through the shared form state", () => {
    const setValue = renderPicker(false);
    fireEvent.click(screen.getByRole("option", { name: /Manicure/i }));
    expect(setValue).toHaveBeenCalledWith("services", [expect.objectContaining({ id: 1, quantity: 1, price: 280 })], { shouldDirty: true, shouldValidate: true });
  });
});
