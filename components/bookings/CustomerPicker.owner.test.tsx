import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import CustomerPicker, { type CustomerPickerValue } from "./CustomerPicker";

vi.mock("@/features/customers/actions/customer", () => ({ searchCustomer: vi.fn().mockResolvedValue({ success: true, data: [] }) }));

function Harness({ initialValue = null }: { initialValue?: CustomerPickerValue | null }) {
  const [value, setValue] = useState<CustomerPickerValue | null>(initialValue);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <CustomerPicker businessSlug="beautyfeel" presentation="owner" value={value} onChange={setValue} />
      <output data-testid="customer-payload">{JSON.stringify(value)}</output>
    </QueryClientProvider>
  );
}

describe("owner customer picker", () => {
  it("does not clear an active Existing search", () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("textbox", { name: "Find a customer" }), { target: { value: "Ellaine" } });
    fireEvent.click(screen.getByRole("button", { name: "Existing" }));
    expect(screen.getByRole("textbox", { name: "Find a customer" })).toHaveValue("Ellaine");
  });

  it("keeps a linked customer when the active Existing tab is clicked", () => {
    const customer = { id: "customer-1", name: "Ellaine", phone: null, email: null };
    render(<Harness initialValue={{ mode: "existing", customer }} />);
    fireEvent.click(screen.getByRole("button", { name: "Existing" }));
    expect(JSON.parse(screen.getByTestId("customer-payload").textContent ?? "null")).toEqual({ mode: "existing", customer });
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByTestId("customer-payload")).toHaveTextContent("null");
  });

  it("keeps visible new-customer fields and payload aligned across mode changes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Full name/i }), { target: { value: "Ellaine" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Phone number/i }), { target: { value: "09123456789" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Email/i }), { target: { value: "ellaine@example.test" } });

    const expected = { mode: "new", name: "Ellaine", phone: "09123456789", email: "ellaine@example.test" };
    expect(JSON.parse(screen.getByTestId("customer-payload").textContent ?? "null")).toEqual(expected);

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByRole("textbox", { name: /Phone number/i })).toHaveValue(expected.phone);
    expect(JSON.parse(screen.getByTestId("customer-payload").textContent ?? "null")).toEqual(expected);

    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByRole("textbox", { name: /Full name/i })).toHaveValue(expected.name);
    expect(screen.getByRole("textbox", { name: /Phone number/i })).toHaveValue(expected.phone);
    expect(screen.getByRole("textbox", { name: /Email/i })).toHaveValue(expected.email);
    expect(JSON.parse(screen.getByTestId("customer-payload").textContent ?? "null")).toEqual(expected);
  });
});
