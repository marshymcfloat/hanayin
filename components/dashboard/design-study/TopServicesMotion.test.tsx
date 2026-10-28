import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gsap } from "gsap";
import TopServicesMotion from "@/components/dashboard/design-study/TopServicesMotion";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("top services motion", () => {
  it("reveals once on visibility and disconnects on unmount", () => {
    let notify: IntersectionObserverCallback;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const removeEventListener = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener }));
    const animate = vi.spyOn(gsap, "fromTo");
    const view = render(<TopServicesMotion><i data-top-service-bar /><i data-top-service-bar /><i data-top-service-bar /></TopServicesMotion>);
    expect(observe).toHaveBeenCalledOnce();
    expect(animate).not.toHaveBeenCalled();
    act(() => notify!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.calls[0][0]).toHaveLength(3);
    act(() => notify!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(animate).toHaveBeenCalledOnce();
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(removeEventListener).toHaveBeenCalled();
  });

  it("keeps bars at their final widths for reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const animate = vi.spyOn(gsap, "fromTo");
    const view = render(<TopServicesMotion><i data-top-service-bar style={{ width: "75%" }} /></TopServicesMotion>);
    expect(animate).not.toHaveBeenCalled();
    expect(view.container.querySelector("i")).toHaveStyle({ width: "75%" });
    view.unmount();
  });
});
