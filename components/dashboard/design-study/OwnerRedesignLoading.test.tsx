import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OwnerRedesignLoading from "@/components/dashboard/design-study/OwnerRedesignLoading";

beforeEach(() => vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))));
afterEach(() => vi.unstubAllGlobals());

describe("redesign dashboard loading shell", () => {
  it("prerenders navigation without waiting for authentication or tenant data", () => {
    const html = renderToStaticMarkup(<OwnerRedesignLoading fontClassName="dashboard-font" />);
    expect(html).toContain('aria-label="Dashboard sections"');
    expect(html).toContain("Your workspace");
    expect(html).toContain("dashboard-font");
    expect(html).not.toContain("pending services");
    expect(html).not.toContain("/app/");
  });
  it("matches each card and does not report unknown data as zero or empty", () => {
    const { container } = render(<OwnerRedesignLoading />);
    expect(container.querySelectorAll("[data-dashboard-loading]")).toHaveLength(8);
    const navigation = screen.getByRole("navigation", { name: "Dashboard sections" });
    expect(within(navigation).getByRole("link", { name: "Live queue" })).toHaveAttribute("href", "#queue");
    expect(screen.getByRole("region", { name: "Performance overview" })).toHaveAttribute("aria-busy", "true");
    screen.getAllByRole("button", { name: "New booking" }).forEach(button => expect(button).toBeDisabled());
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
    expect(container).not.toHaveTextContent(/₱0|No upcoming bookings|Queue is clear|No completed/);
  });
});
