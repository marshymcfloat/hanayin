import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MobiloLanding from "@/components/landing/hanaylo/MobiloLanding";
import ServiceShowcase from "@/components/landing/hanaylo/ServiceShowcase";
import GrowthTools from "@/components/landing/hanaylo/GrowthTools";

vi.mock("@/components/landing/hanaylo/useHeaderMotion", () => ({ default: vi.fn() }));
vi.mock("@/components/landing/hanaylo/RedesignSmoothScroll", () => ({ default: () => null }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("HANAYIN reference landing page", () => {
  it("uses the approved logo in accessible navbar and footer home links", () => {
    render(<MobiloLanding fontClassName="test-font" />);
    const homeLinks = screen.getAllByRole("link", { name: "HANAYIN home" });
    expect(homeLinks).toHaveLength(2);
    for (const link of homeLinks) {
      expect(link).toHaveAttribute("href", "/redesign");
      const image = link.querySelector("img");
      expect(image).toHaveAttribute("alt", "");
      expect(image?.getAttribute("src")).toContain("hanayin-logo-v1.png");
      expect(image?.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("explains growth tools with labelled examples and accurate plan availability", () => {
    const { container } = render(<GrowthTools />);
    expect(container.querySelectorAll("article")).toHaveLength(3);
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(container).toHaveTextContent("Illustrative growth signal · Sample data");
    expect(container).toHaveTextContent("Example creative · AI-generated illustration");
    expect(container).toHaveTextContent("Growth insights are available on Plus and Pro.");
    expect(container).toHaveTextContent("Social tools are available on Pro; publishing depends on configured integrations.");
    expect(container.querySelector("[data-image-placeholder]")).toBeNull();
    for (const image of container.querySelectorAll("img")) expect(image.closest("a, button")).toBeNull();
    expect(screen.getByRole("link", { name: "Find your plan" })).toHaveAttribute("href", "#plans");
  });

  it("shows service examples without testimonials and lets visitors pause the showcase", () => {
    const { container: section } = render(<ServiceShowcase />);
    expect(within(section).getAllByRole("list")).toHaveLength(2);
    expect(within(section).getAllByRole("listitem")).toHaveLength(8);
    expect(within(section).getAllByRole("heading", { level: 3 })).toHaveLength(8);
    expect(section).not.toHaveTextContent(/testimonial|trusted by|rated|customers say/i);
    expect(section.querySelectorAll("[data-image-placeholder]")).toHaveLength(0);
    expect(within(section).getByText("Drag or swipe to explore").parentElement).toContainElement(within(section).getByRole("button", { name: "Pause showcase animation" }));
    expect(section).not.toHaveTextContent("Different specialties.");
    const toggle = within(section).getByRole("button", { name: "Pause showcase animation" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveTextContent("Resume motion");
    expect(toggle.closest("[data-paused]")).toHaveAttribute("data-paused", "true");
    fireEvent.click(toggle);
    expect(toggle.closest("[data-paused]")).toHaveAttribute("data-paused", "false");
  });

  it("keeps hero assets decorative and shows a labelled actual-dashboard sample", () => {
    const { container } = render(<MobiloLanding fontClassName="test-font" />);
    const images = container.querySelectorAll('section[aria-labelledby="hero-heading"] img[aria-hidden="true"]');
    expect(images).toHaveLength(4);
    for (const image of images) {
      expect(image).toHaveAttribute("alt", "");
      expect(image).toHaveAttribute("aria-hidden", "true");
      expect(image.closest("section")).toHaveAttribute("aria-labelledby", "hero-heading");
    }
    expect(container.querySelector('[data-hero-dashboard] [data-image-placeholder]')).toBeNull();
    const dashboard = screen.getByRole("img", { name: /HANAYIN owner dashboard with fictional Luna Studio data/ });
    expect(dashboard.getAttribute("src")).toContain("hero-owner-dashboard-v2.png");
    expect(dashboard.closest("figure")).toHaveTextContent("Fictional business and sample data");
    for (const anchor of container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      expect(container.querySelector(anchor.getAttribute("href")!)).not.toBeNull();
    }
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("illustrates all three product foundations without blank media slots", () => {
    render(<MobiloLanding fontClassName="test-font" />);
    const section = screen.getByRole("region", { name: "Your bookings. Your team. Their earnings." });
    expect(section.querySelectorAll("article")).toHaveLength(3);
    expect(section.querySelectorAll("[data-image-placeholder]")).toHaveLength(0);
    for (const card of section.querySelectorAll("article")) {
      expect(card.querySelector("h3")).not.toBeNull();
      expect(card.querySelector("img")).toHaveAttribute("alt", "");
      expect(card.querySelector("img")).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("keeps plan applications, login, and legal destinations functional", () => {
    render(<MobiloLanding fontClassName="test-font" />);
    const closingSection = screen.getByRole("region", { name: "Bring your business into order. Keep your people connected." });
    expect(closingSection.querySelector("[data-image-placeholder]")).toBeNull();
    expect(closingSection.querySelectorAll("img")).toHaveLength(3);
    for (const image of closingSection.querySelectorAll("img")) {
      expect(image).toHaveAttribute("alt", "");
      expect(image.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    for (const name of ["Explore Starter", "Explore Plus", "Explore Pro"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", "/apply");
    }
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms of service" })).toHaveAttribute("href", "/terms");
    expect(screen.getAllByRole("link", { name: "Log in" }).every(link => link.getAttribute("href") === "/login")).toBe(true);
  });

  it("shows non-interactive product illustrations throughout the page", () => {
    const { container } = render(<MobiloLanding fontClassName="test-font" />);
    const section = screen.getByRole("region", { name: "Everything behind a service. Connected in one place." });
    expect(section.querySelectorAll("[data-image-placeholder]")).toHaveLength(0);
    expect(within(section).getAllByRole("img")).toHaveLength(3);
    for (const image of container.querySelectorAll("main img")) {
      expect(image.closest("a, button, [role='button']")).toBeNull();
    }
    expect(container).not.toHaveTextContent(/view larger/i);
    for (const image of within(section).getAllByRole("img")) expect(image.getAttribute("alt")).toMatch(/^Sample /);
    expect(section).toHaveTextContent("Names and records are fictional.");
    expect(within(section).getByRole("img", { name: /Sample confirmed booking/ })).toHaveAttribute("alt", expect.stringContaining("payment not recorded"));
  });

  it("shows performance and payroll details with accurate pay eligibility", () => {
    render(<MobiloLanding fontClassName="test-font" />);
    const section = screen.getByRole("region", { name: "The business numbers. The people behind them." });
    expect(section.querySelectorAll("[data-image-placeholder]")).toHaveLength(0);
    expect(within(section).getAllByRole("img")).toHaveLength(2);
    expect(within(section).getByRole("img", { name: /Sample Financial pulse chart/ })).toBeInTheDocument();
    expect(within(section).getByRole("img", { name: /Sample payroll workspace/ })).toBeInTheDocument();
    expect(section).toHaveTextContent("Daily pay for present days and paid leave");
    expect(section).toHaveTextContent("Eligible commissions from completed services on fully paid bookings");
    expect(section).toHaveTextContent("Fictional records");
    expect(section).not.toHaveTextContent(/automatic payout|transfer payroll|view larger/i);
  });

  it("updates all plan prices and savings for the selected billing period", () => {
    render(<MobiloLanding fontClassName="test-font" />);
    const group = screen.getByRole("group", { name: "Billing period" });
    const monthly = within(group).getByRole("button", { name: "Monthly" });
    const annual = within(group).getByRole("button", { name: "Annually" });
    expect(monthly).toHaveAttribute("aria-pressed", "true");
    expect(annual).toHaveAttribute("aria-pressed", "false");
    for (const [name, price] of [["Starter", "₱1,299"], ["Plus", "₱1,999"], ["Pro", "₱2,999"]]) {
      const card = screen.getByRole("article", { name: `${name} plan` });
      expect(card).toHaveTextContent(`${price}/ month`);
      expect(card).toHaveTextContent(`${price} billed monthly`);
    }
    fireEvent.click(annual);
    expect(annual).toHaveAttribute("aria-pressed", "true");
    expect(monthly).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Get 2 months free with annual billing.");
    for (const [name, price, saving, comparison] of [["Starter", "₱12,990", "₱2,598", "₱15,588"], ["Plus", "₱19,990", "₱3,998", "₱23,988"], ["Pro", "₱29,990", "₱5,998", "₱35,988"]]) {
      const card = screen.getByRole("article", { name: `${name} plan` });
      expect(card).toHaveTextContent(`${price}/ year`);
      expect(card).toHaveTextContent(`${price} billed annually`);
      expect(card).toHaveTextContent(`Save ${saving}/year`);
      expect(card).not.toHaveTextContent(/% off|2 months free/);
      expect(card.querySelector("s")).toHaveTextContent(comparison);
      expect(card).toHaveTextContent("with 12 monthly payments");
      expect(within(card).getByRole("link", { name: `Explore ${name}` })).toHaveAttribute("href", "/apply");
    }
    fireEvent.click(monthly);
    expect(monthly).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Billed monthly.");
    expect(screen.getByRole("article", { name: "Starter plan" })).toHaveTextContent("₱1,299/ month");
    expect(screen.queryByText(/billed annually/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Save ₱[\d,]+\/year/)).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Starter plan" }).querySelector("s")).toBeNull();
  });

  it("closes reference navigation when choosing plans", () => {
    render(<MobiloLanding fontClassName="test-font" />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("navigation", { name: "Mobile navigation" });
    const link = within(menu).getByRole("link", { name: "Plans" });
    expect(link).toHaveAttribute("href", "#plans");
    fireEvent.click(link);
    expect(menu).toHaveAttribute("hidden");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("states commission eligibility and payroll limits without fabricated social proof", () => {
    const { container } = render(<MobiloLanding fontClassName="test-font" />);
    expect(container).toHaveTextContent("Commission eligibility requires a completed service and a fully paid booking.");
    expect(container).toHaveTextContent("Money transfers, statutory deductions, and tax filing are handled separately.");
    expect(container).toHaveTextContent("₱1,299");
    expect(container).not.toHaveTextContent(/48,890|4\.90|satisfied customers|trusted by/i);
    expect(screen.getByRole("heading", { name: "Keep today running. Make room for tomorrow." })).toBeInTheDocument();
    expect(container).not.toHaveTextContent("One connected business");
  });
});
