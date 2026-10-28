import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Preserve server-only production boundaries while unit tests run in jsdom.
vi.mock("server-only", () => ({}));

// jsdom doesn't ship IntersectionObserver. motion/react uses it for
// `whileInView` viewport detection on marketing-page components, so any
// component that renders a motion element with whileInView would crash
// the render pipeline with "IntersectionObserver is not defined".
//
// Stub a no-op observer here. Tests that need to assert "this element
// became visible" should mock this further; for the rest of the suite,
// the no-op lets the component mount and renders the fallback content.
class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}
