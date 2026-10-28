import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ actorType: "OWNER" }));
vi.mock("@/lib/auth/viewer-context", () => ({ useViewer: () => viewer }));

import { OwnerRouteLoading } from "./OwnerRouteLoading";

beforeEach(() => { viewer.actorType = "OWNER"; });

describe("owner route fallback", () => {
  it("uses the dashboard query skeleton without visible loading copy", () => {
    render(<OwnerRouteLoading section="dashboard" />);
    expect(screen.getByRole("main", { name: "Loading owner dashboard preview" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Loading dashboard…")).not.toBeInTheDocument();
  });

  it("matches the content and catalog query skeletons", () => {
    const view = render(<OwnerRouteLoading section="payroll" />);
    expect(screen.getByRole("main", { name: "Loading owner dashboard preview" })).toBeInTheDocument();
    view.rerender(<OwnerRouteLoading section="billing" />);
    expect(screen.getByRole("main", { name: "Loading billing preview" })).toBeInTheDocument();
    view.rerender(<OwnerRouteLoading section="business hours" />);
    expect(screen.getByRole("main", { name: "Loading business hours preview" })).toBeInTheDocument();
  });

  it("uses a neutral fallback inside the staff shell", () => {
    viewer.actorType = "EMPLOYEE";
    render(<OwnerRouteLoading section="billing" />);
    const skeleton = screen.getByRole("main", { name: "Loading billing" });
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).not.toHaveClass("md:pl-[128px]");
    expect(screen.queryByText("Loading billing…")).not.toBeInTheDocument();
  });

  it("keeps a route's existing staff loading UI", () => {
    viewer.actorType = "EMPLOYEE";
    const view = render(<OwnerRouteLoading section="attendance" staffFallback={<p>Staff attendance skeleton</p>} />);
    expect(screen.getByText("Staff attendance skeleton")).toBeInTheDocument();
    viewer.actorType = "OWNER";
    view.rerender(<OwnerRouteLoading section="attendance" staffFallback={<p>Staff attendance skeleton</p>} />);
    expect(screen.queryByText("Staff attendance skeleton")).not.toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Loading owner dashboard preview" })).toBeInTheDocument();
  });
});
