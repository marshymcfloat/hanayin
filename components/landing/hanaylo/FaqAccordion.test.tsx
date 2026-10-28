import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gsap } from "gsap";
import FaqAccordion from "@/components/landing/hanaylo/FaqAccordion";

const motion = vi.hoisted(() => ({ kill: vi.fn(), active: vi.fn(() => true) }));
vi.mock("gsap", () => ({ gsap: { registerPlugin: vi.fn(), set: vi.fn(), to: vi.fn(() => ({ kill: motion.kill, isActive: motion.active })) } }));
vi.mock("@gsap/react", async () => {
  const { useLayoutEffect } = await import("react");
  return { useGSAP: (callback: (context: object, safe: (fn: () => void) => () => void) => (() => void)) => useLayoutEffect(() => callback({}, fn => fn), [callback]) };
});

const questions = [{ question: "Who is this for?", answer: "Service teams." }, { question: "How do I start?", answer: "Apply with your business details." }];
let reduced = false;
const disconnect = vi.fn();
let resizeCallbacks: ResizeObserverCallback[] = [];
beforeEach(() => {
  reduced = false;
  resizeCallbacks = [];
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ get matches() { return reduced; }, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {} disconnect = disconnect;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function completeHeightTween() {
  const calls = vi.mocked(gsap.to).mock.calls;
  const vars = calls.filter(([, vars]) => "height" in vars).at(-1)![1];
  (vars.onComplete as () => void)();
}

describe("FAQ disclosure motion", () => {
  it("keeps native disclosures and exposes the requested state before animation completes", () => {
    render(<FaqAccordion questions={questions} />);
    const summary = screen.getByText("How do I start?").closest("summary")!;
    const details = summary.closest("details")!;
    const panel = document.getElementById(summary.getAttribute("aria-controls")!)!;
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(details.open).toBe(true);
    expect(panel).toHaveAttribute("aria-hidden", "false");
    completeHeightTween();
    expect(panel.style.height).toBe("");
    fireEvent.click(summary);
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel.inert).toBe(true);
    expect(details.open).toBe(true);
    completeHeightTween();
    expect(details.open).toBe(false);
  });

  it("cancels the prior height tween when rapidly reversing direction", () => {
    render(<FaqAccordion questions={questions} />);
    const summary = screen.getByText("Who is this for?").closest("summary")!;
    fireEvent.click(summary);
    fireEvent.click(summary);
    expect(motion.kill).toHaveBeenCalled();
    expect(summary).toHaveAttribute("aria-expanded", "true");
    completeHeightTween();
    expect(summary.closest("details")).toHaveAttribute("open");
  });

  it("ignores disclosure visibility notifications but retargets actual content resizes", () => {
    render(<FaqAccordion questions={questions} />);
    const summary = screen.getByText("How do I start?").closest("summary")!;
    const content = summary.closest("details")!.querySelector("[data-faq-panel]")!.firstElementChild!;
    const measure = vi.spyOn(content, "getBoundingClientRect");
    measure.mockReturnValue({ height: 80 } as DOMRect);
    fireEvent.click(summary);
    const notify = (height: number) => resizeCallbacks[1]([
      { borderBoxSize: [{ blockSize: height }] } as unknown as ResizeObserverEntry,
    ], {} as ResizeObserver);
    vi.mocked(gsap.to).mockClear();
    notify(80);
    notify(80.1);
    expect(gsap.to).not.toHaveBeenCalled();
    measure.mockReturnValue({ height: 120 } as DOMRect);
    notify(120);
    expect(gsap.to).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ height: 120 }));
    completeHeightTween();
    vi.mocked(gsap.to).mockClear();
    notify(150);
    expect(gsap.to).not.toHaveBeenCalled();
    measure.mockRestore();
  });

  it("switches immediately with reduced motion and cleans up on unmount", () => {
    reduced = true;
    const { unmount } = render(<FaqAccordion questions={questions} />);
    const summary = screen.getByText("Who is this for?").closest("summary")!;
    fireEvent.click(summary);
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(gsap.to).not.toHaveBeenCalled();
    fireEvent.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
