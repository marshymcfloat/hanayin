import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import PricingSection from "./PricingSection";

describe("PricingSection", () => {
  it("renders Starter/Plus/Pro tiers with the right prices and Plus features", () => {
    render(<PricingSection />);

    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Plus")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();

    // Prices render as a separate ₱ glyph + numeric span so the
    // formatted string ("₱1,499") never appears as a single text
    // node. Match the numbers — confirms the active price set
    // without coupling to the layout markup.
    expect(screen.getByText("999")).toBeInTheDocument();
    expect(screen.getByText("1,499")).toBeInTheDocument();
    expect(screen.getByText("2,499")).toBeInTheDocument();

    // A handful of Plus + Pro feature lines as a smoke check that
    // each tier's feature list rendered correctly.
    expect(screen.getByText("Growth opportunity insights")).toBeInTheDocument();
    expect(screen.getByText("Workflow automation (manual mode)")).toBeInTheDocument();
    expect(
      screen.getByText("Direct social media publishing (pilot)"),
    ).toBeInTheDocument();
    expect(screen.getByText("AI caption generation")).toBeInTheDocument();
    expect(screen.getByText("AI promo image generation")).toBeInTheDocument();
  });
});
