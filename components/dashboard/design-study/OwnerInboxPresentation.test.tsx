import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxScrollArea } from "@/components/dashboard/design-study/OwnerInboxPresentation";

beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => vi.unstubAllGlobals());

describe("inbox message scrolling", () => {
  it("preserves the reader's position and resumes following when they return to the bottom", () => {
    const view = render(<InboxScrollArea label="History" messages><p>First message</p></InboxScrollArea>);
    const viewport = screen.getByLabelText("History");
    Object.defineProperties(viewport, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 300 } });
    viewport.scrollTop = 100;
    fireEvent.scroll(viewport);
    view.rerender(<InboxScrollArea label="History" messages><p>New message</p></InboxScrollArea>);
    expect(viewport.scrollTop).toBe(100);
    viewport.scrollTop = 700;
    fireEvent.scroll(viewport);
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1200 });
    view.rerender(<InboxScrollArea label="History" messages><p>Another message</p></InboxScrollArea>);
    expect(viewport.scrollTop).toBe(1200);
    expect(viewport).toHaveAttribute("tabindex", "0");
  });
});
