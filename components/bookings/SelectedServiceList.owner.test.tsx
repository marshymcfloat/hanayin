import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SelectedServiceList from "./SelectedServiceList";

type Item = { id: number; name: string; price: number; quantity: number; packageId?: number; packageName?: string };

const initial: Item[] = [
  { id: 1, name: "Manicure", price: 100.25, quantity: 1, packageId: 3, packageName: "Nail set" },
  { id: 2, name: "Pedicure", price: 150.25, quantity: 1, packageId: 3, packageName: "Nail set" },
  { id: 4, name: "Brow tint", price: 12.75, quantity: 1 },
];

function Harness({ presentation = "owner" }: { presentation?: "owner" | "default" }) {
  const [items, setItems] = useState(initial);
  return <><SelectedServiceList presentation={presentation} services={items} form={{ setValue: (_name, next) => setItems(next as Item[]) }} /><output data-testid="items">{JSON.stringify(items)}</output></>;
}

function items() {
  return JSON.parse(screen.getByTestId("items").textContent ?? "[]") as Item[];
}

describe("owner selected treatments", () => {
  it("updates every included package service and formats fractional prices", () => {
    render(<Harness />);
    expect(screen.getByText("₱250.50")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Increase Nail set quantity" }));
    expect(items().filter((item) => item.packageId === 3).map((item) => item.quantity)).toEqual([2, 2]);
    expect(screen.getByText("₱501.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Nail set" }));
    expect(items()).toEqual([expect.objectContaining({ id: 4 })]);
  });

  it("updates standalone quantity and removes only that treatment", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Increase Brow tint quantity" }));
    expect(items().find((item) => item.id === 4)?.quantity).toBe(2);
    expect(screen.getByText("₱25.50")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Brow tint" }));
    expect(items().map((item) => item.id)).toEqual([1, 2]);
  });

  it("leaves the existing default list presentation available", () => {
    render(<Harness presentation="default" />);
    expect(screen.getByText("Nail set")).toBeInTheDocument();
    expect(screen.queryByLabelText("Selected treatments")).not.toBeInTheDocument();
  });
});
