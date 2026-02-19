import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TimeSlotPicker from "./TimeSlotPicker";

describe("TimeSlotPicker", () => {
  it("renders slot confidence and source labels", () => {
    render(
      <TimeSlotPicker
        slots={[
          {
            startTime: new Date("2026-02-13T09:00:00+08:00"),
            endTime: new Date("2026-02-13T09:30:00+08:00"),
            available: true,
            availableEmployeeCount: 2,
            availableOwnerCount: 0,
            source: "ROSTER",
            confidence: "TENTATIVE",
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/Estimated/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Roster/i).length).toBeGreaterThan(0);
  });

  it("shows and uses alternative slots in empty state", () => {
    const onChange = vi.fn();
    const alternativeSlot = {
      startTime: new Date("2026-02-14T10:00:00+08:00"),
      endTime: new Date("2026-02-14T10:30:00+08:00"),
      available: true,
      availableEmployeeCount: 1,
      availableOwnerCount: 0,
      source: "ROSTER" as const,
      confidence: "TENTATIVE" as const,
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
