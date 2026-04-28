import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: ({ name }: { name: string }) => <div>{name}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: ({ name }: { name: string }) => <div>{name}</div>,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
}));

import { ReportTrendChart } from "./ReportTrendChart";

describe("ReportTrendChart", () => {
  it("shows an empty state when there is no data", () => {
    render(
      <ReportTrendChart
        data={[]}
        series={[{ dataKey: "bookedRevenue", label: "Booked Revenue", color: "#2563eb" }]}
      />,
    );

    expect(screen.getByText("No trend data for this date range.")).toBeInTheDocument();
  });

  it("renders legend labels when chart data exists", () => {
    render(
      <ReportTrendChart
        data={[
          { label: "Feb 1", bookedRevenue: 1000, collectedRevenue: 800 },
          { label: "Feb 2", bookedRevenue: 1200, collectedRevenue: 900 },
        ]}
        series={[
          { dataKey: "bookedRevenue", label: "Booked Revenue", color: "#2563eb" },
          { dataKey: "collectedRevenue", label: "Collected Revenue", color: "#16a34a" },
        ]}
      />,
    );

    expect(screen.getAllByText("Booked Revenue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Collected Revenue").length).toBeGreaterThan(0);
  });
});
