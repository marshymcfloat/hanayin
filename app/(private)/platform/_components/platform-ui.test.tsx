import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PlatformStatusBadge,
  formatPhpFromCentavos,
  formatPlatformDate,
  formatPlatformDateTime,
} from "./platform-ui";

describe("platform-ui", () => {
  it("renders status badges with expected tone classes", () => {
    const { rerender } = render(<PlatformStatusBadge status="ACTIVE" />);
    expect(screen.getByText("ACTIVE")).toHaveClass("text-primary");

    rerender(<PlatformStatusBadge status="PENDING" />);
    expect(screen.getByText("PENDING")).toHaveClass("text-amber-700");

    rerender(<PlatformStatusBadge status="FAILED" />);
    expect(screen.getByText("FAILED")).toHaveClass("text-rose-700");
  });

  it("formats platform dates and money for display", () => {
    const date = new Date("2026-02-12T12:30:00.000Z");

    expect(formatPlatformDate(date)).toContain("2026");
    expect(formatPlatformDateTime(date)).toContain("2026");

    const money = formatPhpFromCentavos(12345);
    expect(money).toContain("123.45");
  });

  it("renders readable badge text for underscore statuses", () => {
    render(<PlatformStatusBadge status="GRACE_PERIOD" />);
    expect(screen.getByText("GRACE PERIOD")).toBeVisible();
  });
});
