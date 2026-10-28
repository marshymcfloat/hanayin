import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OwnerAttendancePreviewData } from "@/features/workforce/types/owner-attendance-preview";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), updateLeave: vi.fn() }));
vi.mock("@/features/workforce/actions/leave-request", () => ({ updateLeaveRequestStatus: mocks.updateLeave }));
vi.mock("@/features/workforce/actions/attendance-admin", () => ({ getEmployeeAttendanceHistory: vi.fn(), previewAttendanceImpactAction: vi.fn(), updateAttendanceStatus: vi.fn() }));
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => ({ userId: "owner-a", businessId: "business-a", businessSlug: "studio-a", businessName: "Studio A", ownerName: "Owner" }),
  useOwnerPreviewFetch: () => mocks.fetch,
}));

import { OwnerAttendancePreviewRoute } from "./OwnerAttendancePreviewQuery";

const data: OwnerAttendancePreviewData = {
  businessName: "Studio A", date: "2026-09-28", pendingLeaveCount: 1,
  employees: [
    { id: 1, name: "Ana", role: "STAFF", status: "UNRECORDED", timeIn: null, timeOut: null },
    { id: 2, name: "Bea", role: "MANAGER", status: "PRESENT", timeIn: "2026-09-28T01:00:00.000Z", timeOut: null },
  ],
  leaveRequests: [{ id: 3, employeeName: "Bea", startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-10-02T00:00:00.000Z", reason: "Family visit", submittedAt: "2026-09-27T00:00:00.000Z", status: "PENDING" }],
};

afterEach(() => { vi.clearAllMocks(); });

describe("attendance preview live query", () => {
  it("shows unrecorded status, date-keyed data, working leave actions, and targeted refresh", async () => {
    mocks.fetch.mockResolvedValue(data);
    mocks.updateLeave.mockResolvedValue({ success: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerAttendancePreviewRoute /></QueryClientProvider>);
    expect(await screen.findAllByText("Ana")).not.toHaveLength(0);
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Explicitly marked absent").length).toBeGreaterThan(0);
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("/attendance?date="), expect.anything());
    const beforeRefresh = mocks.fetch.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh attendance" }));
    await waitFor(() => expect(mocks.fetch.mock.calls.length).toBe(beforeRefresh + 1));
    fireEvent.change(screen.getByLabelText("Attendance date"), { target: { value: "2026-09-27" } });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("date=2026-09-27"), expect.anything()));
    fireEvent.click(screen.getByRole("tab", { name: "Leave requests" }));
    expect(screen.getByText("Family visit")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.updateLeave).toHaveBeenCalledWith(3, "APPROVED"));
    await waitFor(() => expect(mocks.fetch.mock.calls.length).toBeGreaterThan(beforeRefresh + 2));
  });
});
