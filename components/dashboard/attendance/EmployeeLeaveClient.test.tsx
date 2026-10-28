import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
import type { LeaveRequest } from "@/prisma/generated/prisma/client";

const { cancelMock, readMock } = vi.hoisted(() => ({ cancelMock: vi.fn(), readMock: vi.fn() }));
vi.mock("@/features/workforce/actions/leave-request", () => ({
  cancelLeaveRequest: cancelMock,
  getMyLeaveRequestsAction: readMock,
}));
vi.mock("./RequestLeaveDialog", () => ({
  RequestLeaveDialog: ({ onSuccess }: { onSuccess: () => void }) =>
    <button type="button" onClick={onSuccess}>Submit leave</button>,
}));

import { EmployeeLeaveClient } from "./EmployeeLeaveClient";

const request = {
  id: 4, status: "PENDING", type: "VACATION", reason: "Family trip",
  start_date: new Date("2026-10-20T00:00:00Z"), end_date: new Date("2026-10-21T00:00:00Z"),
  admin_comment: null,
} as LeaveRequest;

function renderLeaves(requests: LeaveRequest[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EmployeeLeaveClient employeeId={7} businessId="biz-1" businessSlug="beautyfeel" requests={requests} />
    </QueryClientProvider>,
  );
  return client;
}

describe("staff leave request refresh", () => {
  beforeEach(() => vi.resetAllMocks());

  it("shows a newly confirmed request after the create callback refreshes the self-scoped query", async () => {
    readMock.mockResolvedValueOnce({ success: true, data: [] }).mockResolvedValue({ success: true, data: [request] });
    const client = renderLeaves([]);
    fireEvent.click(screen.getByRole("button", { name: "Request leave" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit leave" }));
    await waitFor(() => expect(client.getQueryData<LeaveRequest[]>(["employee-leave-requests", "beautyfeel", 7])).toEqual([request]));
    expect(screen.getByText("Family trip")).toBeInTheDocument();
  });

  it("restores a cancelled row when the server rejects cancellation", async () => {
    readMock.mockResolvedValue({ success: true, data: [request] });
    let resolveCancel!: (result: unknown) => void;
    cancelMock.mockReturnValue(new Promise((resolve) => { resolveCancel = resolve; }));
    const client = renderLeaves([request]);
    fireEvent.click(screen.getByRole("button", { name: /pending request/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Cancel$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, Cancel Request" }));
    await waitFor(() => expect(client.getQueryData<LeaveRequest[]>(["employee-leave-requests", "beautyfeel", 7])).toEqual([]));
    resolveCancel({ success: false, error: "Not allowed" });
    await waitFor(() => expect(client.getQueryData<LeaveRequest[]>(["employee-leave-requests", "beautyfeel", 7])).toEqual([request]));
  });

  it("keeps a confirmed cancellation removed after the server refresh", async () => {
    readMock.mockResolvedValueOnce({ success: true, data: [request] })
      .mockResolvedValue({ success: true, data: [] });
    cancelMock.mockResolvedValue({ success: true });
    const client = renderLeaves([request]);
    fireEvent.click(screen.getByRole("button", { name: /pending request/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Cancel$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, Cancel Request" }));
    await waitFor(() => expect(cancelMock).toHaveBeenCalledWith(4));
    await waitFor(() => expect(client.getQueryData<LeaveRequest[]>(["employee-leave-requests", "beautyfeel", 7])).toEqual([]));
  });
});
