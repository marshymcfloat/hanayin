import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OwnerRedesignWorkspaceLoading from "@/components/dashboard/design-study/OwnerRedesignWorkspaceLoading";

const location = vi.hoisted(() => ({ pathname: "/redesign/owner-dashboard/business/vouchers" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));
beforeEach(() => {
  location.pathname = "/redesign/owner-dashboard/business/vouchers";
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => vi.unstubAllGlobals());

describe("owner workspace verification fallback", () => {
  it("keeps Notifications heading and independent loading regions visible before verification", () => {
    location.pathname = "/redesign/owner-dashboard/customers/notifications";
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByRole("heading", { name: "Notifications", level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText("Loading notifications")).toHaveAttribute("aria-busy", "true");
    for (const name of ["Loading notification overview", "Loading delivery history", "Loading channel performance"]) expect(screen.getByLabelText(name)).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Customers sections" })).getByRole("link", { name: "Notifications" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
    expect(screen.queryByText("0 in history")).not.toBeInTheDocument();
  });
  it("keeps inbox navigation and independent loading visible before verification", () => {
    location.pathname = "/redesign/owner-dashboard/customers/inbox";
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByLabelText("Loading Customer Inbox")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Loading inbox controls")).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Customer inbox workspace" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Customers sections" })).getByRole("link", { name: "Customer inbox" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Inbox settings" })).not.toBeInTheDocument();
  });
  it("shows independent booking geometry before verification", () => {
    location.pathname = "/redesign/owner-dashboard/customers/bookings";
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByLabelText("Loading bookings")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Loading booking overview")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading booking register")).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Bookings workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
  });
  it("keeps customer navigation and loading geometry visible before verification", () => {
    location.pathname = "/redesign/owner-dashboard/customers";
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByLabelText("Loading customers")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("main", { name: "Customers workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add customer" })).not.toBeInTheDocument();
  });
  it("keeps Attendance loading and Team navigation visible before verification", () => {
    location.pathname = "/redesign/owner-dashboard/team/attendance";
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByLabelText("Loading attendance")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("main", { name: "Attendance workspace" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Team sections" })).getByRole("link", { name: "Attendance" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save status" })).not.toBeInTheDocument();
  });
  it("keeps Owners navigation and loading geometry visible without privileged controls", () => {
    location.pathname = "/redesign/owner-dashboard/team/owners";
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByLabelText("Loading owners")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("main", { name: "Owners workspace" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Team sections" })).getByRole("link", { name: "Owners" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Edit permissions" })).not.toBeInTheDocument();
  });
  it("keeps the employee navigation and geometry visible before owner verification", () => {
    location.pathname = "/redesign/owner-dashboard/team/employees";
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByLabelText("Loading employees")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("main", { name: "Employees workspace" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Team sections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add employee" })).not.toBeInTheDocument();
  });
  it.each(["business-hours", "billing", "reports", "social-posts"] as const)("uses a matching unverified shell for %s", (page) => {
    location.pathname = `/redesign/owner-dashboard/business/${page}`;
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByLabelText(`Loading ${page.replace("-", " ")}`)).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
    screen.getAllByRole("button", { name: "New booking" }).forEach(button => expect(button).toBeDisabled());
  });
  it("shows sale-event geometry with generic identity and disabled mutations", () => {
    location.pathname = "/redesign/owner-dashboard/business/sale-events";
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByLabelText("Loading sale events")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("main", { name: "Sale events workspace" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Business sections" })).getByRole("link", { name: "Sale Events" })).toHaveAttribute("aria-current", "page");
    screen.getAllByRole("button", { name: "New booking" }).forEach(button => expect(button).toBeDisabled());
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Create sale event" })).not.toBeInTheDocument();
  });
  it("shows gift-card geometry in the shell while identity and actions remain unverified", () => {
    location.pathname = "/redesign/owner-dashboard/business/gift-cards";
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByLabelText("Loading gift cards")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("main", { name: "Gift cards workspace" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Business sections" })).getByRole("link", { name: "Gift Cards" })).toHaveAttribute("aria-current", "page");
    screen.getAllByRole("button", { name: "New booking" }).forEach(button => expect(button).toBeDisabled());
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Issue gift card" })).not.toBeInTheDocument();
  });
  it("shows the voucher geometry and navigation with no private identity or enabled mutations", () => {
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByLabelText("Loading vouchers")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("main", { name: "Vouchers workspace" })).toBeInTheDocument();
    const nav = within(screen.getByRole("navigation", { name: "Business sections" }));
    expect(nav.getByRole("link", { name: "Vouchers" })).toHaveAttribute("aria-current", "page");
    screen.getAllByRole("button", { name: "New booking" }).forEach(button => expect(button).toBeDisabled());
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Create voucher" })).not.toBeInTheDocument();
  });

  it("preserves the Services fallback", () => {
    location.pathname = "/redesign/owner-dashboard/business/services";
    render(<OwnerRedesignWorkspaceLoading fontClassName="test-font" />);
    expect(screen.getByLabelText("Loading services")).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Services workspace" })).toBeInTheDocument();
  });
});
