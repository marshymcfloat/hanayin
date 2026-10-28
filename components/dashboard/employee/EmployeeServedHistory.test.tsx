import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);

const { markServedMock, unclaimMock, unserveMock } = vi.hoisted(() => ({
  markServedMock: vi.fn(),
  unclaimMock: vi.fn(),
  unserveMock: vi.fn(),
}));

vi.mock("@/features/dashboard/actions", () => ({
  markServiceServedAction: markServedMock,
  unclaimServiceAction: unclaimMock,
  unserveServiceAction: unserveMock,
}));

import EmployeeServedHistory, { type ServedService } from "./EmployeeServedHistory";

const service = (status: "CLAIMED" | "COMPLETED"): ServedService => ({
  id: 17,
  updated_at: new Date("2026-08-29T10:00:00+08:00"),
  service: { id: 3, name: "Manicure gel", duration: 60, category: "Nails" },
  booking: {
    customer: { name: "Sandy Ruiz" },
    scheduled_at: new Date("2026-08-29T18:30:00+08:00"),
    created_at: new Date("2026-08-29T09:00:00+08:00"),
    downpayment: null,
    downpayment_status: null,
    grand_total: 280,
    amount_paid: 0,
    payment_status: "UNPAID",
  },
  scheduled_at: new Date("2026-08-29T18:30:00+08:00"),
  price: 280,
  status,
  package_id: null,
  package: null,
});

describe("EmployeeServedHistory lifecycle views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markServedMock.mockResolvedValue({ success: true });
  });

  it("shows claimed work in progress with an inline Done action", async () => {
    const onWorkChanged = vi.fn();
    render(
      <EmployeeServedHistory
        mode="active"
        services={[service("CLAIMED")]}
        currentEmployeeId={5}
        currentEmployeeCommission={10}
        onWorkChanged={onWorkChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(markServedMock).toHaveBeenCalledWith(17, 5);
      expect(onWorkChanged).toHaveBeenCalledOnce();
    });
  });

  it("keeps completed history read-only at the list level", () => {
    render(
      <EmployeeServedHistory
        mode="history"
        services={[service("COMPLETED")]}
        currentEmployeeId={5}
        currentEmployeeCommission={10}
      />,
    );

    expect(screen.getByText("Manicure gel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
  });
});
