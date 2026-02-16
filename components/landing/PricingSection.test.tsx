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
  it("renders Starter/Plus/Pro monthly tiers with updated prices", () => {
    render(<PricingSection />);

    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Plus")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();

    expect(screen.getByText("₱1,499")).toBeInTheDocument();
    expect(screen.getByText("₱2,499")).toBeInTheDocument();
    expect(screen.getByText("₱3,999")).toBeInTheDocument();

    expect(screen.getByText("Growth opportunity insights and workflow (manual mode)")).toBeInTheDocument();
    expect(screen.getByText("Direct social media publishing (pilot rollout)")).toBeInTheDocument();
    expect(screen.getByText("AI caption generation")).toBeInTheDocument();
    expect(screen.getByText("AI promo image generation")).toBeInTheDocument();
  });
});
