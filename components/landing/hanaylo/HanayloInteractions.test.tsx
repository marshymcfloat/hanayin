import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HanayloHeader from "@/components/landing/hanaylo/HanayloHeader";
import WorkdayDemo from "@/components/landing/hanaylo/WorkdayDemo";

vi.mock("@/components/landing/hanaylo/useHeaderMotion", () => ({ default: vi.fn() }));

describe("HANAYIN product tour", () => {
  it("opens the selected service without presenting unpaid work as eligible earnings", () => {
    render(<WorkdayDemo />);
    fireEvent.click(screen.getByRole("button", { name: "View Sam D. service details" }));
    const panel = screen.getByRole("tabpanel");
    expect(screen.getByRole("tab", { name: /The service/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /The service/ })).toHaveFocus();
    expect(within(panel).getByRole("heading", { name: "Scalp treatment" })).toBeInTheDocument();
    expect(within(panel).getByText("Not recorded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /The earnings/ }));
    expect(within(panel).getByText("Sam D. / Scalp treatment")).toBeInTheDocument();
    expect(within(panel).getByText(/JULES’S ELIGIBLE SERVICE COMMISSION/)).toBeInTheDocument();
    expect(within(panel).getByText(/This service is not yet eligible/)).toBeInTheDocument();
    expect(within(panel).getByText(/Money transfers are handled separately/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /The schedule/ }));
    fireEvent.click(screen.getByRole("button", { name: "View Alex R. service details" }));
    fireEvent.click(screen.getByRole("tab", { name: /The earnings/ }));
    expect(within(panel).getByText("Alex R. / Cut & style")).toBeInTheDocument();
    expect(within(panel).getByText(/Completed service · Fully paid booking/)).toBeInTheDocument();
  });

  it("supports arrow keys, Home and End with one tab stop and the matching panel label", () => {
    render(<WorkdayDemo />);
    const schedule = screen.getByRole("tab", { name: /The schedule/ });
    const service = screen.getByRole("tab", { name: /The service/ });
    const earnings = screen.getByRole("tab", { name: /The earnings/ });
    schedule.focus();
    fireEvent.keyDown(schedule, { key: "ArrowRight" });
    expect(service).toHaveFocus();
    expect(service).toHaveAttribute("tabindex", "0");
    expect(schedule).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", service.id);
    fireEvent.keyDown(service, { key: "End" });
    expect(earnings).toHaveFocus();
    expect(earnings).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(earnings, { key: "ArrowRight" });
    expect(schedule).toHaveFocus();
    fireEvent.keyDown(schedule, { key: "ArrowLeft" });
    expect(earnings).toHaveFocus();
    fireEvent.keyDown(earnings, { key: "Home" });
    expect(schedule).toHaveFocus();
  });
});

describe("HANAYIN mobile navigation", () => {
  it("closes when a pointer interacts outside the header", () => {
    render(<HanayloHeader />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(navigation).toHaveAttribute("hidden");
  });

  it("closes the mobile panel when resized to desktop", () => {
    render(<HanayloHeader />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    fireEvent(window, new Event("resize"));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("collapses before document scroll listeners measure an anchor destination", () => {
    render(<HanayloHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    let closedBeforeScroll = false;
    window.addEventListener("click", () => { closedBeforeScroll = navigation.hidden; }, { once: true });

    fireEvent.click(within(navigation).getByRole("link", { name: "Who it’s for" }));
    expect(closedBeforeScroll).toBe(true);
  });

  it("closes with Escape and restores focus to the menu trigger", () => {
    render(<HanayloHeader />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    const link = within(navigation).getByRole("link", { name: "The product" });
    link.focus();
    fireEvent.keyDown(link, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(navigation).toHaveAttribute("hidden");
  });

  it("closes after an anchor choice and preserves real onboarding and login destinations", () => {
    render(<HanayloHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(navigation).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    fireEvent.click(within(navigation).getByRole("link", { name: "Who it’s for" }));
    expect(navigation).toHaveAttribute("hidden");
    expect(screen.getByRole("link", { name: /Get started/ })).toHaveAttribute("href", "/apply");
  });
});
