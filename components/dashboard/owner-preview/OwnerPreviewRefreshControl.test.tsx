import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";

describe("OwnerPreviewRefreshControl", () => {
  it("has a mobile touch target while retaining compact desktop sizing", () => {
    const onRefresh = vi.fn();
    render(<OwnerPreviewRefreshControl label="dashboard performance" isFetching={false} updatedAt={0} onRefresh={onRefresh} />);

    const button = screen.getByRole("button", { name: "Refresh dashboard performance" });
    expect(button).toHaveClass("min-h-11", "sm:min-h-9");
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("announces progress and prevents duplicate refreshes", () => {
    const onRefresh = vi.fn();
    render(<OwnerPreviewRefreshControl label="live queue" isFetching updatedAt={0} onRefresh={onRefresh} />);

    const button = screen.getByRole("button", { name: "Refresh live queue" });
    expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Updating data");
    fireEvent.click(button);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("keeps icon-only controls accessible without a visible text label", () => {
    const onRefresh = vi.fn();
    render(<OwnerPreviewRefreshControl label="financial chart" isFetching={false} updatedAt={1} onRefresh={onRefresh} iconOnly />);

    const button = screen.getByRole("button", { name: "Refresh financial chart" });
    expect(button).toHaveClass("min-h-11", "min-w-11");
    expect(button).toHaveAttribute("title", expect.stringContaining("Updated"));
    expect(screen.queryByText("Refresh")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("sr-only");
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
