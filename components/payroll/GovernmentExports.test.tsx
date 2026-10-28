import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ download: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/features/payroll/actions/exports", () => ({ exportGovernmentPayrollAction: mocks.download, exportPayrollStatutoryAction: mocks.download }));
import { GovernmentExports } from "./GovernmentExports";

beforeEach(() => vi.clearAllMocks());

it("toasts a rejected export without reporting success", async () => {
  mocks.download.mockResolvedValue({ success: false, error: "Verified rules are required" });
  render(<GovernmentExports />);
  fireEvent.click(screen.getByRole("button", { name: "Download verified agency format" }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Verified rules are required"));
  expect(mocks.success).not.toHaveBeenCalled();
});

it("toasts an uncertain export and makes retry available", async () => {
  mocks.download.mockRejectedValue(new Error("offline"));
  render(<GovernmentExports />);
  const button = screen.getByRole("button", { name: "Download review register" });
  fireEvent.click(button);
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Export could not be downloaded. Try again."));
  expect(button).toBeEnabled();
  expect(mocks.success).not.toHaveBeenCalled();
});
