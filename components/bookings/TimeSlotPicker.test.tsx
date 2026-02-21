import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TimeSlotPicker from "./TimeSlotPicker";

describe("TimeSlotPicker", () => {
  it("renders deterministic workload labels", () => {
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

    expect(screen.getAllByText(/2 Employees/i).length).toBeGreaterThan(0);
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
