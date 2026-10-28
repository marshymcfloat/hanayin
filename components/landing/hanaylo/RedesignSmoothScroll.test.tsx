import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RedesignSmoothScroll from "@/components/landing/hanaylo/RedesignSmoothScroll";
import styles from "@/components/landing/hanaylo/hanaylo.module.css";

const { instances } = vi.hoisted(() => ({
  instances: [] as Array<{ destroy: ReturnType<typeof vi.fn> }>,
}));

vi.mock("lenis", () => ({
  default: class {
    on = vi.fn();
    stop = vi.fn();
    destroy = vi.fn();
    constructor() { instances.push(this); }
  },
}));

vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: { update: vi.fn() } }));

let motionPreference: MediaQueryList;

function setReducedMotion(matches: boolean) {
  Object.defineProperty(motionPreference, "matches", { value: matches, configurable: true });
  act(() => { motionPreference.dispatchEvent(new Event("change")); });
}

beforeEach(() => {
  instances.length = 0;
  motionPreference = new EventTarget() as MediaQueryList;
  Object.defineProperty(motionPreference, "matches", { value: false, configurable: true });
  vi.stubGlobal("matchMedia", vi.fn(() => motionPreference));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("redesign smooth scrolling", () => {
  it("removes the scroll controller and its styles when leaving the page", () => {
    const { unmount } = render(<RedesignSmoothScroll />);
    expect(document.documentElement).toHaveClass(styles.smoothScrollRoot);
    expect(instances).toHaveLength(1);

    unmount();
    expect(instances[0].destroy).toHaveBeenCalledOnce();
    expect(document.documentElement).not.toHaveClass(styles.smoothScrollRoot);
    setReducedMotion(false);
    expect(instances).toHaveLength(1);
  });

  it("uses native scrolling for reduced motion and responds to live preference changes", () => {
    setReducedMotion(true);
    render(<RedesignSmoothScroll />);
    expect(instances).toHaveLength(0);
    expect(document.documentElement).not.toHaveClass(styles.smoothScrollRoot);

    setReducedMotion(false);
    expect(instances).toHaveLength(1);
    expect(document.documentElement).toHaveClass(styles.smoothScrollRoot);

    setReducedMotion(true);
    expect(instances[0].destroy).toHaveBeenCalledOnce();
    expect(document.documentElement).not.toHaveClass(styles.smoothScrollRoot);
  });

  it("keeps only one live controller during React strict-mode effect replay", () => {
    const { unmount } = render(<StrictMode><RedesignSmoothScroll /></StrictMode>);
    expect(instances.filter((instance) => instance.destroy.mock.calls.length === 0)).toHaveLength(1);
    unmount();
    expect(instances.every((instance) => instance.destroy.mock.calls.length === 1)).toBe(true);
  });
});
