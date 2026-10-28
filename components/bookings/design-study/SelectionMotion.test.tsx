import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gsap } from "gsap";
import { AnimatedValue } from "@/components/bookings/design-study/SelectionMotion";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("booking selection numbers", () => {
  it("animates plain counts with a custom formatter without duplicating text", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const animate = vi.spyOn(gsap, "to");
    const format = (amount: number) => `${Math.round(amount)} visits`;
    const view = render(<AnimatedValue value={37} count formatNumber={format} />);
    const visual = view.container.querySelector("[aria-hidden]")!;
    view.rerender(<AnimatedValue value={148} count formatNumber={format} />);
    expect(screen.getByText("148 visits")).toBeInTheDocument();
    expect(visual).toHaveAttribute("data-display", "37 visits");
    act(() => { animate.mock.results.at(-1)!.value.progress(1); });
    expect(visual).toHaveAttribute("data-display", "148 visits");
    expect(visual).toBeEmptyDOMElement();
  });

  it("removes stale visual text instead of displaying it beside the animated amount", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const view = render(<AnimatedValue value={0} currency />);
    const visual = view.container.querySelector("[aria-hidden]")!;
    visual.textContent = "₱0.00";
    view.rerender(<AnimatedValue value={580} currency />);
    expect(visual).toBeEmptyDOMElement();
    expect(visual).toHaveAttribute("data-display", "₱580.00");
    expect(screen.getByText("₱580.00")).toBeInTheDocument();
  });

  it("shows exact values immediately with reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const view = render(<AnimatedValue value={280} currency />);
    view.rerender(<AnimatedValue value={560} currency />);
    expect(screen.getByText("₱560.00")).toBeInTheDocument();
    expect(view.container.querySelector("[aria-hidden]")).toHaveAttribute("data-display", "₱560.00");
  });

  it("settles on the latest total after interrupted increases and decreases", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const view = render(<AnimatedValue value={0} currency />);
    view.rerender(<AnimatedValue value={580} currency />);
    view.rerender(<AnimatedValue value={860} currency />);
    view.rerender(<AnimatedValue value={280} currency />);
    expect(screen.getByText("₱280.00")).toBeInTheDocument();
    await waitFor(() => expect(view.container.querySelector("[aria-hidden]")).toHaveAttribute("data-display", "₱280.00"));
    view.rerender(<AnimatedValue value={0} currency />);
    view.unmount();
    expect(view.container).toBeEmptyDOMElement();
  });

  it("starts the next total from the settled amount without rewinding", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const animate = vi.spyOn(gsap, "to");
    const view = render(<AnimatedValue value={0} currency />);
    const visual = view.container.querySelector("[aria-hidden]")!;
    view.rerender(<AnimatedValue value={5000} currency />);
    act(() => { animate.mock.results.at(-1)!.value.progress(1); });
    expect(visual).toHaveAttribute("data-display", "₱5,000.00");
    view.rerender(<AnimatedValue value={8000} currency />);
    expect(visual).toHaveAttribute("data-display", "₱5,000.00");
    expect(animate.mock.calls.at(-1)![0]).toMatchObject({ value: 5000 });
    act(() => { animate.mock.results.at(-1)!.value.progress(1); });
    expect(visual).toHaveAttribute("data-display", "₱8,000.00");
  });

  it("retargets from the visible amount when increases or decreases interrupt a tween", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const animate = vi.spyOn(gsap, "to");
    const view = render(<AnimatedValue value={2000} currency />);
    const visual = view.container.querySelector("[aria-hidden]")!;
    view.rerender(<AnimatedValue value={5000} currency />);
    act(() => { animate.mock.results.at(-1)!.value.progress(.25); });
    const partialIncrease = visual.getAttribute("data-display");
    view.rerender(<AnimatedValue value={8000} currency />);
    expect(visual).toHaveAttribute("data-display", partialIncrease);
    act(() => { animate.mock.results.at(-1)!.value.progress(.25); });
    const beforeDecrease = visual.getAttribute("data-display");
    view.rerender(<AnimatedValue value={0} currency />);
    expect(visual).toHaveAttribute("data-display", beforeDecrease);
    act(() => { animate.mock.results.at(-1)!.value.progress(1); });
    expect(visual).toHaveAttribute("data-display", "₱0.00");
  });
});
