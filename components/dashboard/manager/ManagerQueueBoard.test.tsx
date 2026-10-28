import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
import { AvailedServiceStatus } from "@/prisma/generated/prisma/enums";

const { boardMock, ownMock, serveMock, unclaimMock } = vi.hoisted(() => ({
  boardMock: vi.fn(), ownMock: vi.fn(), serveMock: vi.fn(), unclaimMock: vi.fn(),
}));
vi.mock("@/features/dashboard/actions", () => ({
  getManagerQueueBoardAction: boardMock,
  getEmployeeServiceWorkAction: ownMock,
  claimServiceAction: vi.fn(),
  markServiceServedAction: serveMock,
  unclaimServiceAction: unclaimMock,
}));

import ManagerQueueBoard, { type ManagerQueueService } from "./ManagerQueueBoard";
import { useManagerServiceCoordinator } from "@/components/dashboard/manager/useManagerServiceCoordinator";
import { useStaffServiceWork } from "@/components/dashboard/employee/useStaffServiceWork";
import type { EmployeeServiceWorkData } from "@/components/dashboard/employee/service-work-state";

const service: ManagerQueueService = {
  id: 1, status: AvailedServiceStatus.CLAIMED, price: 280, scheduled_at: null,
  package: null, service: { name: "Service 1", category: "Nails", duration: 60 },
  served_by_id: 7, served_by: { user: { name: "Ana" } },
  booking: { customer: { name: "Customer" }, scheduled_at: null, created_at: new Date("2026-10-04T09:00:00Z") },
};
const employees = [{ id: 7, specialties: ["Nails"], user: { name: "Ana" } }];
const ownItem: EmployeeServiceWorkData["active"][number] = {
  id: 1, updated_at: new Date("2026-10-04T09:00:00Z"),
  service: { id: 2, name: "Service 1", category: "Nails", duration: 60 },
  booking: { customer: { name: "Customer" }, downpayment: null, downpayment_status: null,
    grand_total: 280, amount_paid: 0, payment_status: "UNPAID" },
  scheduled_at: null, price: 280, status: "CLAIMED", package_id: null, package: null,
};
const ownData: EmployeeServiceWorkData = { pending: [], active: [ownItem], completed: [] };

function Harness({ initialService = service }: { initialService?: ManagerQueueService }) {
  const initialBoard = { services: [initialService], employees };
  const coordinator = useManagerServiceCoordinator({
    businessSlug: "beautyfeel", employeeId: 7, initialOwn: ownData, initialBoard,
  });
  const { serviceWork, pendingActionIds, runServiceWorkAction } = useStaffServiceWork({
    businessSlug: "beautyfeel", employeeId: 7, initialData: ownData,
    managerCoordinator: coordinator,
  });
  return <>
    <button type="button" disabled={pendingActionIds.has(1)} onClick={() => void runServiceWorkAction({
      service: ownItem, transition: "complete", execute: () => serveMock(1, 7),
      errorTitle: "Unable to serve",
    })}>Finish mine</button>
    <span data-testid="own-status">{serviceWork.active.some((item) => item.id === 1) ? "active" : serviceWork.completed.some((item) => item.id === 1) ? "completed" : "absent"}</span>
    <ManagerQueueBoard businessSlug="beautyfeel" currentEmployeeId={7}
      initialServices={[initialService]} initialEmployees={employees} managerCoordinator={coordinator} />
  </>;
}

function renderBoard(initialService = service) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness initialService={initialService} />
    </QueryClientProvider>,
  );
  return client;
}

describe("manager queue reliability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ownMock.mockResolvedValue({ success: true, data: ownData });
  });

  it("keeps the last board visible when its background read fails", async () => {
    boardMock.mockResolvedValue({ success: false, error: "Unavailable" });
    renderBoard();
    await waitFor(() => expect(boardMock).toHaveBeenCalled());
    expect(screen.getByText("Service 1")).toBeInTheDocument();
  });

  it("rolls back only a failed serve after immediately moving the card", async () => {
    boardMock.mockResolvedValue({ success: true, data: { services: [service], employees } });
    let resolveServe!: (value: unknown) => void;
    serveMock.mockReturnValue(new Promise((resolve) => { resolveServe = resolve; }));
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "Serve" }));
    await waitFor(() => expect(serveMock).toHaveBeenCalledOnce());
    expect(screen.queryByText("Service 1")).not.toBeInTheDocument();
    resolveServe({ success: false, error: "Conflict" });
    await waitFor(() => expect(screen.getByText("Service 1")).toBeInTheDocument());
  });

  it("mirrors own completion into the board, replays both overlays on refetch, and rolls back only that ID", async () => {
    const other = { ...service, id: 2, service: { ...service.service, name: "Service 2" } };
    boardMock.mockResolvedValue({ success: true, data: { services: [service, other], employees } });
    ownMock.mockResolvedValue({ success: true, data: { ...ownData, active: [ownItem, { ...ownItem, id: 2 }] } });
    let resolveServe!: (value: unknown) => void;
    serveMock.mockReturnValue(new Promise((resolve) => { resolveServe = resolve; }));
    const client = renderBoard();
    await waitFor(() => expect(screen.getByText("Service 2")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Finish mine" }));
    await waitFor(() => expect(serveMock).toHaveBeenCalledOnce());
    expect(screen.getByTestId("own-status")).toHaveTextContent("completed");
    expect(screen.queryByText("Service 1")).not.toBeInTheDocument();
    expect(screen.getByText("Service 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish mine" })).toBeDisabled();
    await client.refetchQueries({ queryKey: ["manager-queue-board", "beautyfeel", 7] });
    await client.refetchQueries({ queryKey: ["employee-service-work", "beautyfeel", 7] });
    expect(screen.getByTestId("own-status")).toHaveTextContent("completed");
    expect(screen.queryByText("Service 1")).not.toBeInTheDocument();
    resolveServe({ success: false, error: "Conflict" });
    await waitFor(() => expect(screen.getByTestId("own-status")).toHaveTextContent("active"));
    await waitFor(() => expect(screen.getByText("Service 1")).toBeInTheDocument());
    expect(screen.getByText("Service 2")).toBeInTheDocument();
  });

  it("keeps both surfaces confirmed after one successful completion", async () => {
    boardMock.mockResolvedValue({ success: true, data: { services: [service], employees } });
    let resolveServe!: (value: unknown) => void;
    serveMock.mockReturnValue(new Promise((resolve) => { resolveServe = resolve; }));
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "Serve" }));
    await waitFor(() => expect(screen.getByTestId("own-status")).toHaveTextContent("completed"));
    expect(screen.getByRole("button", { name: "Finish mine" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Finish mine" }));
    expect(serveMock).toHaveBeenCalledOnce();
    boardMock.mockResolvedValue({ success: true, data: { services: [], employees } });
    ownMock.mockResolvedValue({ success: true, data: { pending: [], active: [], completed: [{ ...ownItem, status: "COMPLETED" }] } });
    resolveServe({ success: true });
    await waitFor(() => expect(screen.getByTestId("own-status")).toHaveTextContent("completed"));
    expect(screen.queryByText("Service 1")).not.toBeInTheDocument();
  });

  it("returns a SERVING service to pending through unclaim, never financial unserve", async () => {
    const serving = { ...service, status: AvailedServiceStatus.SERVING };
    boardMock.mockResolvedValue({ success: true, data: { services: [serving], employees } });
    let resolveUnclaim!: (value: unknown) => void;
    unclaimMock.mockReturnValue(new Promise((resolve) => { resolveUnclaim = resolve; }));
    renderBoard(serving);
    fireEvent.click(screen.getByRole("button", { name: "Return to queue" }));
    await waitFor(() => expect(unclaimMock).toHaveBeenCalledWith(1));
    expect(screen.getByRole("button", { name: "Confirm Assignment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Finish mine" })).toBeDisabled();
    resolveUnclaim({ success: false, error: "Conflict" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Return to queue" })).toBeInTheDocument());
  });
});
