import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { Service } from "@/prisma/generated/prisma/client";

vi.mock("@/features/bookings/actions/availability", () => ({ checkCategoryAvailability: vi.fn() }));

import ServicePicker from "./ServicePicker";

const manicure = { id: 1, name: "Manicure", category: "Nails", price: 280, duration: 60 } as Service;
const pedicure = { id: 2, name: "Pedicure", category: "Nails", price: 300, duration: 60 } as Service;
const packageItem = { id: 3, name: "Nail set", category: "Nails", price: 250, duration: 120, items: [{ service: manicure, custom_price: 100 }, { service: pedicure, custom_price: 150 }] } as NonNullable<ComponentProps<typeof ServicePicker>["packages"]>[number];

function Harness({ presentation = "owner", redesign = false, selectionSheet = false, disabled = false }: { presentation?: "owner" | "default"; redesign?: boolean; selectionSheet?: boolean; disabled?: boolean }) {
  const form = useForm<{ services: Service[] }>({ defaultValues: { services: [] } });
  const selected = useWatch({ control: form.control, name: "services" });
  return (
    <QueryClientProvider client={new QueryClient()}>
      <ServicePicker
        presentation={presentation}
        redesign={redesign}
        disabled={disabled}
        selectionSheet={selectionSheet ? { total: 0, canContinue: selected.length > 0, onContinue: vi.fn() } : undefined}
        services={[manicure, pedicure]}
        packages={[packageItem]}
        categories={["Nails"]}
        businessSlug="beautyfeel"
        form={form}
      />
      <output data-testid="selected-services">{JSON.stringify(selected)}</output>
    </QueryClientProvider>
  );
}

function selected() {
  return JSON.parse(screen.getByTestId("selected-services").textContent ?? "[]") as Array<Service & { packageId?: number }>;
}

describe("shared service selection", () => {
  it("uses the reference sheet with live package allocations and atomic quantities", () => {
    render(<Harness redesign selectionSheet />);
    expect(screen.getByRole("button", { name: "Continue to schedule" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Packages 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Nail set" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Nail set quantity" }));
    expect(selected()).toEqual([
      expect.objectContaining({ id: 1, packageId: 3, price: 100, quantity: 2 }),
      expect.objectContaining({ id: 2, packageId: 3, price: 150, quantity: 2 }),
    ]);
    expect(screen.getByRole("button", { name: "Continue to schedule" })).toBeEnabled();
    expect(screen.getByRole("list", { name: "Selected treatments" }).firstChild).toHaveAttribute("data-selection-row", "package:3");
    expect(screen.queryByText(/Sample prices|Selection preview only|Service selection preview/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Nail set from selection" }));
    expect(selected()).toEqual([]);
  });

  it("prevents changes while the live catalog is disabled", () => {
    render(<Harness redesign selectionSheet disabled />);
    expect(screen.getByRole("button", { name: "Add Manicure" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue to schedule" })).toBeDisabled();
  });

  it("keeps real package allocations in the redesigned catalog", () => {
    render(<Harness redesign />);
    fireEvent.click(screen.getByRole("button", { name: /Packages/i }));
    const option = screen.getByRole("option", { name: /Nail set/i });
    fireEvent.click(option);
    expect(selected().map(item => ({ id: item.id, packageId: item.packageId, price: item.price }))).toEqual([{ id: 1, packageId: 3, price: 100 }, { id: 2, packageId: 3, price: 150 }]);
    fireEvent.click(option);
    expect(selected()).toEqual([]);
  });
  it("adds and removes an owner service without altering the form payload", () => {
    render(<Harness />);
    const option = screen.getByRole("option", { name: /Manicure/i });
    fireEvent.click(option);
    expect(selected()).toEqual([expect.objectContaining({ id: 1, quantity: 1, price: 280 })]);
    expect(option).toHaveAttribute("aria-selected", "true");
    fireEvent.click(option);
    expect(selected()).toEqual([]);
  });

  it("adds and removes all package services together", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: /Packages/i }));
    const option = screen.getByRole("option", { name: /Nail set/i });
    fireEvent.click(option);
    expect(selected().map((item) => ({ id: item.id, packageId: item.packageId, price: item.price }))).toEqual([
      { id: 1, packageId: 3, price: 100 },
      { id: 2, packageId: 3, price: 150 },
    ]);
    fireEvent.click(option);
    expect(selected()).toEqual([]);
  });

  it("keeps the default popover presentation", () => {
    render(<Harness presentation="default" />);
    expect(screen.getByRole("combobox", { name: "Choose services or packages" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Choose services or packages" })).not.toBeInTheDocument();
  });
});
