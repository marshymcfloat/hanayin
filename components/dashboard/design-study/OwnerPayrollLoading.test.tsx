import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { OwnerPayrollLoading } from "./OwnerPayrollLoading";

it("reserves payroll progress, totals, and employee rows without private data or active actions", () => {
  const { container } = render(<OwnerPayrollLoading />);
  expect(screen.getByRole("status", { name: "Loading payroll" })).toHaveAttribute("aria-busy", "true");
  expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  expect(container.querySelectorAll('[data-payroll-skeleton="step"]')).toHaveLength(3);
  expect(container.querySelectorAll('[data-payroll-skeleton="employee"]')).toHaveLength(5);
  expect(container.querySelector('[data-payroll-skeleton="summary"]')!.compareDocumentPosition(container.querySelector('[data-payroll-skeleton="step"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
