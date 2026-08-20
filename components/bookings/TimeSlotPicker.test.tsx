import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TimeSlotPicker from "./TimeSlotPicker";

describe("TimeSlotPicker", () => {
  it("renders numeric capacity label per slot", () => {
    render(
      <TimeSlotPicker
        slots={[
          {
            startTime: new Date("2026-02-13T09:00:00+08:00"),
            endTime: new Date("2026-02-13T09:30:00+08:00"),
            available: true,
            availableEmployeeCount: 2,
            availableOwnerCount: 0,
            source: "WORKLOAD",
            confidence: "GUARANTEED",
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    // Numeric anchor replaces the old binary "Available" / "Limited" label.
    expect(screen.getByText("2 available")).toBeDefined();
  });

  it("shows '1 left' when only one staff member is available", () => {
    render(
      <TimeSlotPicker
        slots={[
          {
            startTime: new Date("2026-02-13T09:00:00+08:00"),
            endTime: new Date("2026-02-13T09:30:00+08:00"),
            available: true,
            availableEmployeeCount: 1,
            availableOwnerCount: 0,
            source: "WORKLOAD",
            confidence: "GUARANTEED",
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("1 left")).toBeDefined();
  });

  it("hides per-period 'X open' aggregate pill on public surfaces", () => {
    const { rerender } = render(
      <TimeSlotPicker
        slots={[
          {
            startTime: new Date("2026-02-13T09:00:00+08:00"),
            endTime: new Date("2026-02-13T09:30:00+08:00"),
            available: true,
            availableEmployeeCount: 2,
            availableOwnerCount: 0,
            source: "WORKLOAD",
            confidence: "GUARANTEED",
          },
        ]}
        onChange={vi.fn()}
        isPublic
      />,
    );
    expect(screen.queryByText(/\d+ open/)).toBeNull();

    rerender(
      <TimeSlotPicker
        slots={[
          {
            startTime: new Date("2026-02-13T09:00:00+08:00"),
            endTime: new Date("2026-02-13T09:30:00+08:00"),
            available: true,
            availableEmployeeCount: 2,
            availableOwnerCount: 0,
            source: "WORKLOAD",
            confidence: "GUARANTEED",
          },
        ]}
        onChange={vi.fn()}
        isPublic={false}
      />,
    );
    expect(screen.getByText(/\d+ open/)).toBeDefined();
  });

  it("shows and uses alternative slots in empty state", () => {
    const onChange = vi.fn();
    const alternativeSlot = {
      startTime: new Date("2026-02-14T10:00:00+08:00"),
      endTime: new Date("2026-02-14T10:30:00+08:00"),
      available: true,
      availableEmployeeCount: 1,
      availableOwnerCount: 0,
      source: "WORKLOAD" as const,
      confidence: "GUARANTEED" as const,
    };

    render(
      <TimeSlotPicker
        slots={[]}
        alternativeSlots={[alternativeSlot]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onChange).toHaveBeenCalledWith(alternativeSlot.startTime);
  });
});
