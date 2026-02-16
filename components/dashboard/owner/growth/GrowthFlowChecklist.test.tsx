import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { GrowthFlowChecklist } from "./GrowthFlowChecklist";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("GrowthFlowChecklist", () => {
  it("renders current step and next action", () => {
    render(
      <GrowthFlowChecklist
        businessSlug="demo-business"
        activeStep={1}
        completedSteps={[]}
        nextAction="Create your first draft event."
      />,
    );

    expect(screen.getByText("Growth Publishing Flow")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(
      screen.getByText("Next action: Create your first draft event."),
    ).toBeInTheDocument();
  });

  it("renders step links for sale-events and social-posts", () => {
    render(
      <GrowthFlowChecklist
        businessSlug="demo-business"
        activeStep={3}
        completedSteps={[1, 2]}
        nextAction="Review and publish."
      />,
    );

    expect(
      screen.getByRole("link", { name: /1. Pick opportunity/i }),
    ).toHaveAttribute("href", expect.stringContaining("/app/demo-business/sale-events"));
    expect(
      screen.getByRole("link", { name: /3. Review and publish post/i }),
    ).toHaveAttribute("href", expect.stringContaining("/app/demo-business/social-posts"));
  });
});
