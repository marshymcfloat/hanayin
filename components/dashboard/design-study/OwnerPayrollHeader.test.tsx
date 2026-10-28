import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OwnerPayrollHeader } from "@/components/dashboard/design-study/OwnerPayrollHeader";

it("returns from government settings through the supplied callback without navigation", () => {
  const onBack = vi.fn();
  render(<OwnerPayrollHeader onBack={onBack} />);
  expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back to simple payroll" }));
  expect(onBack).toHaveBeenCalledOnce();
  expect(screen.getByRole("heading", { level: 1, name: "Payroll" })).toBeInTheDocument();
});
