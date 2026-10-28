import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardRefreshButton from "@/components/dashboard/design-study/DashboardRefreshButton";

describe("DashboardRefreshButton", () => {
  it("exposes one label and disables repeated refreshes while loading", () => {
    const onRefresh = vi.fn();
    const view = render(<DashboardRefreshButton pending={false} onRefresh={onRefresh} />);
    const button = screen.getByRole("button", { name: "Refresh data" });
    expect(button).toHaveAttribute("aria-busy", "false");
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledOnce();
    view.rerender(<DashboardRefreshButton pending={false} refreshing onRefresh={onRefresh} />);
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledOnce();
    view.rerender(<DashboardRefreshButton pending onRefresh={onRefresh} />);
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeDisabled();
  });
});
