import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OverviewSummary from "@/components/dashboard/design-study/OverviewSummary";
import { dashboardProps } from "@/components/dashboard/design-study/owner-redesign.test-fixtures";

const mocks = vi.hoisted(() => ({ reduced: false, animate: vi.fn(), revert: vi.fn(), add: vi.fn() }));
vi.mock("@gsap/react", async () => {
  const { useLayoutEffect, useRef } = await import("react");
  return { useGSAP: (effect: () => (() => void)) => { const initial = useRef(effect); useLayoutEffect(() => initial.current(), []); } };
});
vi.mock("gsap", () => ({ gsap: { registerPlugin: vi.fn(), fromTo: mocks.animate, matchMedia: () => ({ add: (query: string, effect: () => void) => { mocks.add(query); if (!mocks.reduced) effect(); }, revert: mocks.revert }) } }));
vi.mock("@/components/bookings/design-study/SelectionMotion", () => ({ AnimatedValue: ({ value }: { value: number }) => <span>{value}</span> }));
beforeEach(() => { vi.clearAllMocks(); mocks.reduced = false; });
describe("overview motion", () => {
  it("reveals panels once, retains updated data and cleans up on unmount", () => {
    const data = dashboardProps().analytics;
    const view = render(<OverviewSummary data={data} />);
    expect(mocks.animate).toHaveBeenCalledTimes(1);
    expect(mocks.add).toHaveBeenCalledWith("(prefers-reduced-motion: no-preference)");
    view.rerender(<OverviewSummary data={{ ...data, summary: { ...data.summary, revenue: 900 } }} />);
    expect(mocks.animate).toHaveBeenCalledTimes(1);
    view.unmount(); expect(mocks.revert).toHaveBeenCalledOnce();
  });
  it("keeps content visible without entrance motion for reduced motion", () => {
    mocks.reduced = true;
    const view = render(<OverviewSummary data={dashboardProps().analytics} />);
    expect(mocks.animate).not.toHaveBeenCalled();
    expect(view.getByRole("heading", { name: "Total revenue" })).toBeVisible();
    view.unmount(); expect(mocks.revert).toHaveBeenCalledOnce();
  });
  it("keeps the compact KPI row factual and free of decorative comparison bars", () => {
    const view = render(<OverviewSummary data={dashboardProps().analytics} />);
    expect(view.getAllByRole("article")).toHaveLength(4);
    expect(view.container.querySelector("[data-summary-meter]")).toBeNull();
    expect(view.getByText("vs. ₱200 prior month to date")).toBeInTheDocument();
    expect(view.getByText("2 prior month to date")).toBeInTheDocument();
    expect(view.queryByText("Every visit adds up.")).not.toBeInTheDocument();
  });
});
