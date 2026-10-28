import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { gsap } from "gsap";
import useHeaderMotion from "@/components/landing/hanaylo/useHeaderMotion";

const state = vi.hoisted(() => ({
  desktop: true,
  reduced: false,
  triggers: [] as Record<string, (trigger: { progress: number }) => void>[],
  cleanups: [] as (() => void)[],
  mediaCleanups: [] as (() => void)[],
  revert: vi.fn(),
}));
vi.mock("@gsap/react", () => ({ useGSAP: (callback: () => (() => void) | undefined) => {
  const cleanup = callback();
  if (cleanup) state.cleanups.push(cleanup);
} }));
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: { create: (config: Record<string, (trigger: { progress: number }) => void>) => {
  state.triggers.push(config);
  config.onRefresh?.({ progress: 0 });
  return { progress: 0 };
} } }));
vi.mock("gsap", () => ({ gsap: {
  registerPlugin: vi.fn(),
  fromTo: () => ({ progress: vi.fn() }),
  set: (element: HTMLElement, values: { width: number }) => { element.style.width = `${values.width}px`; },
  quickTo: vi.fn((element: HTMLElement) => Object.assign((width: number) => { element.style.width = `${width}px`; }, { tween: { pause: vi.fn() } })),
  matchMedia: () => ({
    add: (_conditions: unknown, callback: (context: unknown) => (() => void) | undefined) => {
      const cleanup = callback({ conditions: { desktop: state.desktop, reduced: state.reduced } });
      if (cleanup) state.mediaCleanups.push(cleanup);
    },
    revert: () => { state.mediaCleanups.splice(0).forEach(cleanup => cleanup()); state.revert(); },
  }),
} }));

beforeEach(() => {
  state.desktop = true;
  state.reduced = false;
  state.triggers.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("scrollY", 0);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => {
  cleanup();
  state.cleanups.splice(0).forEach(cleanup => cleanup());
  vi.unstubAllGlobals();
});

function setup(enabled = true) {
  const header = document.createElement("header");
  renderHook(() => useHeaderMotion({ current: header }, { current: document.createElement("span") }, { current: null }, false, enabled));
  return header;
}

describe("reference navbar width motion", () => {
  it("expands at the top, contracts on scroll, and reverses through one reusable tween", () => {
    const header = setup();
    const trigger = state.triggers[1];
    expect(header.style.width).toBe("1320px");
    trigger.onUpdate({ progress: 1 });
    expect(header.style.width).toBe("1120px");
    trigger.onUpdate({ progress: 0.5 });
    expect(header.style.width).toBe("1220px");
    trigger.onUpdate({ progress: 0 });
    expect(header.style.width).toBe("1320px");
    expect(gsap.quickTo).toHaveBeenCalledTimes(1);
  });

  it("recalculates widths on resize without extending outside the viewport", () => {
    const header = setup();
    vi.stubGlobal("innerWidth", 900);
    state.triggers[1].onRefresh({ progress: 1 });
    expect(header.style.width).toBe("804px");
    state.triggers[1].onRefresh({ progress: 0 });
    expect(header.style.width).toBe("836px");
  });

  it("sets the final state immediately for reduced motion", () => {
    state.reduced = true;
    const header = setup();
    const animate = vi.mocked(gsap.quickTo).mock.results[0].value;
    const pause = animate.tween.pause;
    vi.stubGlobal("scrollY", 80);
    state.triggers[1].onUpdate({ progress: 0.4 });
    expect(header.style.width).toBe("1120px");
    expect(pause).toHaveBeenCalled();
  });

  it("leaves mobile sizing and the original navbar unchanged", () => {
    state.desktop = false;
    expect(setup().style.width).toBe("");
    state.desktop = true;
    expect(setup(false).style.width).toBe("");
    expect(gsap.quickTo).not.toHaveBeenCalled();
  });

  it("removes the desktop width override when the breakpoint changes", () => {
    const header = setup();
    state.triggers[1].onUpdate({ progress: 1 });
    expect(header.style.width).toBe("1120px");
    state.mediaCleanups[0]();
    expect(header.style.width).toBe("");
  });
});
