import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

const actionMock = vi.fn();
vi.mock("./audit-actions", () => ({
  getEntityAuditHistoryAction: (...args: unknown[]) => actionMock(...args),
}));

const toastErrorMock = vi.fn();
vi.mock("@/components/feedback/permission-toasts", () => ({
  showActionErrorToast: (...args: unknown[]) => toastErrorMock(...args),
}));

import { AuditTrail } from "./AuditTrail";

beforeEach(() => {
  actionMock.mockReset();
  toastErrorMock.mockReset();
});

describe("<AuditTrail>", () => {
  it("renders the loading state initially", () => {
    actionMock.mockReturnValueOnce(new Promise(() => {})); // never resolves
    render(<AuditTrail entityType="Booking" entityId="1" />);
    expect(screen.getByText(/loading history/i)).toBeInTheDocument();
  });

  it("renders the empty state when no entries are returned", async () => {
    actionMock.mockResolvedValueOnce({ success: true, entries: [] });
    render(<AuditTrail entityType="Booking" entityId="1" />);
    await waitFor(() => {
      expect(screen.getByText("No history yet.")).toBeInTheDocument();
    });
  });

  it("renders entries with default verb mapping", async () => {
    actionMock.mockResolvedValueOnce({
      success: true,
      entries: [
        {
          id: "a1",
          entityType: "Booking",
          entityId: "1",
          action: "STATUS_CHANGED",
          actorId: "u1",
          actorType: "USER",
          changes: { before: { status: "HOLD" }, after: { status: "ACCEPTED" } },
          createdAt: new Date().toISOString(),
        },
      ],
    });
    render(<AuditTrail entityType="Booking" entityId="1" />);
    await waitFor(() => {
      expect(screen.getByText("Status changed")).toBeInTheDocument();
    });
    expect(screen.getByText(/HOLD/)).toBeInTheDocument();
    expect(screen.getByText(/ACCEPTED/)).toBeInTheDocument();
  });

  it("calls toast and shows the error state on failure", async () => {
    actionMock.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    render(<AuditTrail entityType="Booking" entityId="1" />);
    await waitFor(() => {
      expect(screen.getByText(/couldn't load history/i)).toBeInTheDocument();
    });
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Forbidden",
      expect.objectContaining({ action: "view audit history" }),
    );
  });

  it("uses formatAction override when provided", async () => {
    actionMock.mockResolvedValueOnce({
      success: true,
      entries: [
        {
          id: "a1",
          entityType: "Booking",
          entityId: "1",
          action: "STATUS_CHANGED",
          actorId: "u1",
          actorType: "USER",
          changes: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    render(
      <AuditTrail
        entityType="Booking"
        entityId="1"
        formatAction={(entry) => `custom:${entry.action}`}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("custom:STATUS_CHANGED")).toBeInTheDocument();
    });
  });
});
