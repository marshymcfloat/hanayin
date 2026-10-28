import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gsap } from "gsap";
import { animateShowcaseRow } from "@/components/landing/hanaylo/useShowcaseMotion";

vi.mock("gsap", () => ({ gsap: { registerPlugin: vi.fn(), ticker: { add: vi.fn(), remove: vi.fn() } } }));
vi.mock("@gsap/react", () => ({ useGSAP: vi.fn() }));

const cleanups: (() => void)[] = [];
const disconnect = vi.fn();
const intersections: ((visible: boolean) => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  intersections.length = 0;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect = disconnect; });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {
      intersections.push(visible => callback([{ isIntersecting: visible }]));
    }
    observe() { this.callback([{ isIntersecting: true }]); }
    disconnect() {}
  });
});
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(index = 0, paused = () => false) {
  const rail = document.createElement("div");
  rail.innerHTML = "<div><ul></ul><ul></ul></div>";
  document.body.append(rail);
  rail.setPointerCapture = vi.fn();
  rail.hasPointerCapture = vi.fn(() => true);
  rail.releasePointerCapture = vi.fn();
  vi.spyOn(rail.querySelector("ul")!, "getBoundingClientRect").mockReturnValue({ width: 1512 } as DOMRect);
  cleanups.push(animateShowcaseRow(rail, index, paused));
  const tick = vi.mocked(gsap.ticker.add).mock.lastCall![0];
  const advance = (frames = 1) => { for (let i = 0; i < frames; i++) tick(i / 60, 1000 / 60, i, 0); };
  const position = () => Number(rail.firstElementChild!.getAttribute("style")!.match(/translateX\(([-\d.]+)px/)![1]);
  const pointer = (type: string, x: number, time: number, pointerType = "mouse") => {
    const event = new Event(type);
    Object.defineProperties(event, { button: { value: 0 }, isPrimary: { value: true }, pointerId: { value: 1 }, clientX: { value: x }, timeStamp: { value: time }, pointerType: { value: pointerType } });
    rail.dispatchEvent(event);
  };
  return { rail, advance, position, pointer };
}

describe("service showcase interaction", () => {
  it("slows only the hovered row without stopping either row", () => {
    const first = setup();
    const second = setup(1);
    first.advance(60);
    second.advance(60);
    first.pointer("pointerenter", 0, 0);
    first.advance(120);
    const start = first.position();
    const otherStart = second.position();
    first.advance(60);
    second.advance(60);
    expect(Math.abs(first.position() - start)).toBeGreaterThan(3);
    expect(Math.abs(first.position() - start)).toBeLessThan(6);
    expect(second.position() - otherStart).toBeCloseTo(1512 / 75, 1);
    first.pointer("pointerleave", 0, 0);
    first.advance(120);
    const resumed = first.position();
    first.advance(60);
    expect(Math.abs(first.position() - resumed)).toBeGreaterThan(22);
  });

  it("drags either direction, coasts after release, and wraps without gaps", () => {
    const row = setup();
    row.pointer("pointerdown", 300, 0, "touch");
    row.pointer("pointermove", 100, 80, "touch");
    row.advance();
    expect(row.position()).toBe(-200);
    row.pointer("pointerup", 100, 90, "touch");
    row.advance();
    expect(row.position()).toBeLessThan(-220);
    row.pointer("pointerdown", 100, 100, "touch");
    row.pointer("pointermove", 4100, 200, "touch");
    row.advance();
    expect(row.position()).toBeGreaterThan(-1512);
    expect(row.position()).toBeLessThanOrEqual(0);
    row.pointer("pointercancel", 4100, 210, "touch");
    const cancelled = row.position();
    row.advance();
    expect(Math.abs(row.position() - cancelled)).toBeLessThan(1);
    expect(row.rail).not.toHaveAttribute("data-dragging");
  });

  it("batches pointer movement into one transform update per frame", () => {
    const row = setup();
    const style = (row.rail.firstElementChild as HTMLElement).style;
    const writes = vi.spyOn(style, "transform", "set");
    row.pointer("pointerdown", 300, 0);
    row.pointer("pointermove", 260, 10);
    row.pointer("pointermove", 200, 20);
    row.pointer("pointermove", 100, 30);
    expect(writes).not.toHaveBeenCalled();
    row.advance();
    expect(writes).toHaveBeenCalledOnce();
    expect(row.position()).toBe(-200);
  });

  it("removes offscreen and background rows from the ticker and resumes in place", () => {
    const row = setup();
    row.advance(60);
    const position = row.position();
    const track = row.rail.firstElementChild as HTMLElement;
    intersections[0](false);
    expect(gsap.ticker.remove).toHaveBeenCalledOnce();
    expect(track.style.willChange).toBe("");
    intersections[0](true);
    expect(gsap.ticker.add).toHaveBeenCalledTimes(2);
    expect(row.position()).toBe(position);
    expect(track.style.willChange).toBe("transform");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(gsap.ticker.remove).toHaveBeenCalledTimes(2);
  });

  it("honors pause, supports keyboard movement, and removes its listeners", () => {
    let paused = true;
    const row = setup(0, () => paused);
    row.advance(60);
    expect(row.position()).toBe(0);
    row.rail.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(row.position()).toBe(-180);
    paused = false;
    row.advance(60);
    expect(row.position()).toBeLessThan(-180);
    cleanups.pop()!();
    expect(gsap.ticker.remove).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    row.pointer("pointerdown", 300, 0);
    expect(row.rail).not.toHaveAttribute("data-dragging");
    expect((row.rail.firstElementChild as HTMLElement).style.transform).toBe("");
  });
});
