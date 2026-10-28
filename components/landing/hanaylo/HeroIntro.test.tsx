import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gsap } from "gsap";
import { renderToString } from "react-dom/server";
import Link from "next/link";
import HeroIntro from "@/components/landing/hanaylo/HeroIntro";

let reducedMotion = false;

beforeEach(() => {
  reducedMotion = false;
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    get matches() { return query === "(scripting: enabled)" || !reducedMotion; },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Fixture() {
  return <HeroIntro className="hero">
    <header><Link href="/redesign" data-intro-nav>HANAYIN</Link></header>
    <h1 id="hero-heading" data-hero-copy>Run your business</h1>
    <div data-hero-copy><Link href="/apply">Get started</Link></div>
    <div data-hero-dashboard />
    <div data-hero-dryer />
    <div data-hero-polish />
    <div data-hero-tools />
    <div data-hero-serum />
  </HeroIntro>;
}

describe("hero intro", () => {
  it("emits the pending entrance state in server HTML before hydration", () => {
    const html = renderToString(<Fixture />);
    expect(html).toContain('data-intro-state="pending"');
    expect(html).toContain('data-intro-nav="true"');
    expect(html).toContain("Run your business");
  });

  it("finishes the reveal as soon as keyboard focus enters the hero", () => {
    render(<Fixture />);
    const heading = screen.getByText("Run your business");
    expect(heading.style.opacity).toBe("0");
    fireEvent.focusIn(screen.getByText("Get started"));
    expect(heading.style.opacity).toBe("");
    expect(heading.style.transform).toBe("");
    expect(heading).toBeVisible();
  });

  it("leaves all content visible without animation for reduced motion", () => {
    reducedMotion = true;
    render(<Fixture />);
    const heading = screen.getByRole("heading");
    expect(heading.style.opacity).toBe("");
    expect(gsap.getTweensOf(heading)).toHaveLength(0);
    expect(heading.closest("[data-intro-state]")).toHaveAttribute("data-intro-state", "complete");
    reducedMotion = false;
    act(() => { gsap.matchMediaRefresh(); });
    expect(gsap.getTweensOf(heading)).toHaveLength(0);
  });

  it("reveals the navbar and hero together when navigation receives focus", () => {
    render(<Fixture />);
    const brand = screen.getByText("HANAYIN");
    expect(brand.style.opacity).toBe("0");
    fireEvent.focusIn(brand);
    expect(brand.style.opacity).toBe("");
    expect(screen.getByText("Run your business").style.opacity).toBe("");
    expect(brand.closest("[data-intro-state]")).toHaveAttribute("data-intro-state", "complete");
  });

  it("skips the entrance in browsers without the CSS scripting media feature", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    render(<Fixture />);
    expect(gsap.getTweensOf(screen.getByRole("heading"))).toHaveLength(0);
    expect(screen.getByRole("heading").closest("[data-intro-state]")).toHaveAttribute("data-intro-state", "complete");
  });

  it("does not hide content again if the CSS fallback already revealed it", () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");
    let reads = 0;
    Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => reads++ === 0 ? [
      { animationName: "mobilo_introFallback", playState: "finished" },
    ] : [] });
    try {
      render(<StrictMode><Fixture /></StrictMode>);
      expect(gsap.getTweensOf(screen.getByRole("heading"))).toHaveLength(0);
      expect(screen.getByRole("heading").closest("[data-intro-state]")).toHaveAttribute("data-intro-state", "complete");
    } finally {
      if (original) Object.defineProperty(Element.prototype, "getAnimations", original);
      else Reflect.deleteProperty(Element.prototype, "getAnimations");
    }
  });

  it("reverts a running intro when motion preferences change without replaying it", () => {
    render(<Fixture />);
    const heading = screen.getByText("Run your business");
    reducedMotion = true;
    act(() => { gsap.matchMediaRefresh(); });
    expect(heading.style.opacity).toBe("");
    expect(gsap.getTweensOf(heading)).toHaveLength(0);
    reducedMotion = false;
    act(() => { gsap.matchMediaRefresh(); });
    expect(gsap.getTweensOf(heading)).toHaveLength(0);
  });

  it("cleans up animations and restores styles through strict-mode replay and unmount", () => {
    const { unmount } = render(<StrictMode><Fixture /></StrictMode>);
    const heading = screen.getByText("Run your business");
    expect(gsap.getTweensOf(heading)).toHaveLength(1);
    unmount();
    expect(gsap.getTweensOf(heading)).toHaveLength(0);
    expect(heading.style.opacity).toBe("");
    expect(heading.style.transform).toBe("");
  });
});
