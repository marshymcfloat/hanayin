import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BookingDesignExperiment from "@/components/bookings/design-study/BookingDesignExperiment";

describe("responsive booking design experiment", () => {
  it("keeps the latest tab and filter results during rapid switching without losing selection", () => {
    render(<BookingDesignExperiment />);
    fireEvent.click(screen.getByRole("button", { name: "Add Gel manicure" }));
    for (let index = 0; index < 3; index++) {
      fireEvent.click(screen.getByRole("button", { name: "Packages 2" }));
      fireEvent.click(screen.getByRole("button", { name: "Services 8" }));
      fireEvent.click(screen.getByRole("button", { name: "Skin" }));
      fireEvent.click(screen.getByRole("button", { name: "Spa & body" }));
    }
    const results = within(screen.getByRole("list", { name: "Available treatments" }));
    expect(results.getAllByRole("button")).toHaveLength(2);
    expect(results.getByRole("button", { name: "Add Foot spa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spa & body" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Remove Gel manicure from selection" })).toBeInTheDocument();
  });

  it("updates selection, quantities and totals without replacing the catalog", () => {
    render(<BookingDesignExperiment />);
    const catalog = screen.getByRole("list", { name: "Available treatments" });
    expect(catalog.querySelector(".lucide-sparkles, .lucide-flower-2")).toBeNull();
    const serviceTab = screen.getByRole("button", { name: "Services 8" });
    expect(serviceTab.querySelector('[data-icon="hair-dryer"]')).toHaveAttribute("aria-hidden", "true");
    expect(serviceTab.querySelector(".lucide-sparkles")).toBeNull();
    const summary = within(screen.getByRole("complementary", { name: /Your selection/ }));
    expect(summary.getByText("₱0.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Gel manicure" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Gel pedicure" }));
    expect(summary.getByText("₱580.00")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Available treatments" })).toBe(catalog);
    expect(screen.getByRole("button", { name: "Remove Gel manicure" })).toHaveAttribute("aria-pressed", "true");
    expect(summary.getByRole("button", { name: "Decrease Gel manicure quantity" })).toBeDisabled();
    fireEvent.click(summary.getByRole("button", { name: "Increase Gel manicure quantity" }));
    expect(summary.getByText("₱860.00")).toBeInTheDocument();
    fireEvent.click(summary.getByRole("button", { name: "Decrease Gel manicure quantity" }));
    fireEvent.click(summary.getByRole("button", { name: "Remove Gel pedicure from selection" }));
    expect(summary.getByText("1 item selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Gel manicure" }));
    expect(summary.getByText("₱0.00")).toBeInTheDocument();
    expect(summary.getByText("No services selected")).toBeInTheDocument();
  });

  it("keeps selected treatments when filtering, searching and switching to packages", () => {
    render(<BookingDesignExperiment />);
    fireEvent.click(screen.getByRole("button", { name: "Add Gel manicure" }));
    fireEvent.click(screen.getByRole("button", { name: "Brows & lashes" }));
    expect(screen.queryByRole("button", { name: "Add Gel pedicure" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Brow lamination" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search treatments" }), { target: { value: "not a treatment" } });
    expect(screen.getByText("No treatments found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Packages 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Add The nail care duo" }));
    const summary = within(screen.getByRole("complementary", { name: /Your selection/ }));
    expect(summary.getByText("Gel manicure")).toBeInTheDocument();
    expect(summary.getByText("The nail care duo")).toBeInTheDocument();
    expect(summary.getByText("₱830.00")).toBeInTheDocument();
    expect(summary.getByRole("button", { name: "Continue to schedule" })).toBeDisabled();
    expect(screen.getByText("Sample prices · No booking is created")).toBeInTheDocument();
  });

  it("opens the sheet with its own selection and unique accessible references", () => {
    render(<BookingDesignExperiment fontClassName="test-font-variable" />);
    fireEvent.click(screen.getByRole("button", { name: "Add Gel manicure" }));
    fireEvent.click(screen.getByRole("button", { name: "Open as sheet" }));
    const dialog = screen.getByRole("dialog", { name: "New booking" });
    expect(dialog).toHaveClass("test-font-variable");
    expect(screen.queryByRole("button", { name: "Open as sheet" })).not.toBeInTheDocument();
    const sheet = within(dialog);
    const progress = sheet.getByRole("list", { name: "Booking progress" });
    expect(progress.closest("section")).toBeNull();
    expect(progress.parentElement?.parentElement).toBe(dialog);
    expect(within(progress).getAllByRole("listitem")).toHaveLength(4);
    expect(within(progress).getByText("Services").closest("li")).toHaveAttribute("aria-current", "step");
    expect(sheet.getByText("No services selected")).toBeInTheDocument();
    fireEvent.click(sheet.getByRole("button", { name: "Add Gel pedicure" }));
    expect(sheet.getByText("1 item selected")).toBeInTheDocument();
    const ids = Array.from(document.querySelectorAll("[id]")).map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sheet.getByRole("button", { name: "Close editor" })).toBeInTheDocument();
  });

  it("opens a mobile preview without automatically focusing the search input", async () => {
    render(<BookingDesignExperiment />);
    fireEvent.click(screen.getByRole("button", { name: "Open mobile preview" }));
    const dialog = screen.getByRole("dialog", { name: "New booking" });
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(within(dialog).getByRole("textbox", { name: "Search treatments" })).not.toHaveFocus();
  });

  it("updates the mobile total and exposes quantity controls without moving the picker", async () => {
    render(<BookingDesignExperiment />);
    fireEvent.click(screen.getByRole("button", { name: "Open mobile preview" }));
    const dialog = screen.getByRole("dialog", { name: "New booking" });
    const sheet = within(dialog);
    await waitFor(() => expect(dialog).toHaveFocus());
    const catalog = sheet.getByRole("list", { name: "Available treatments" });
    fireEvent.click(sheet.getByRole("button", { name: "Add Gel manicure" }));
    const toggle = sheet.getByRole("button", { name: /1 treatment.*₱280/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    const summary = sheet.getByRole("complementary", { name: "Your selection" });
    expect(summary).toHaveAttribute("data-expanded", "true");
    await waitFor(() => expect(sheet.getByRole("button", { name: "Collapse selection" })).toHaveFocus());
    fireEvent.click(within(summary).getByRole("button", { name: "Increase Gel manicure quantity" }));
    expect(toggle).toHaveTextContent("2 treatments");
    expect(toggle).toHaveTextContent("₱560.00");
    fireEvent.click(within(summary).getByRole("button", { name: "Collapse selection" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    expect(dialog).toBeInTheDocument();
    expect(sheet.getByRole("list", { name: "Available treatments" })).toBe(catalog);
    expect(sheet.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("adapts the drawer to the visual viewport and cleans up its listeners", () => {
    const viewport = Object.assign(new EventTarget(), { height: 400, offsetTop: 0, scale: 1 });
    vi.stubGlobal("visualViewport", viewport);
    const view = render(<BookingDesignExperiment />);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Open mobile preview" }));
      const dialog = screen.getByRole("dialog", { name: "New booking" });
      expect(dialog.style.getPropertyValue("--booking-visible-height")).toBe("400px");
      expect(dialog.style.getPropertyValue("--booking-keyboard-inset")).toBe(`${Math.max(0, window.innerHeight - 400)}px`);
      viewport.height = 600;
      viewport.dispatchEvent(new Event("resize"));
      expect(dialog.style.getPropertyValue("--booking-visible-height")).toBe("600px");
      view.unmount();
      expect(dialog.style.getPropertyValue("--booking-visible-height")).toBe("");
      viewport.dispatchEvent(new Event("resize"));
      expect(dialog.style.getPropertyValue("--booking-visible-height")).toBe("");
    } finally {
      view.unmount();
      vi.unstubAllGlobals();
    }
  });
});
