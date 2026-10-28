import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
import { StaffProfile } from "@/prisma/generated/prisma/enums";

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ cancelQueries: vi.fn(), getQueryData: vi.fn(), setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  useQuery: ({ initialData }: { initialData: unknown }) => ({ data: initialData, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("@/features/dashboard/actions", () => ({
  claimServiceAction: vi.fn(), getEmployeeServiceWorkAction: vi.fn(), markServiceServedAction: vi.fn(),
  unclaimServiceAction: vi.fn(), unserveServiceAction: vi.fn(),
}));
vi.mock("@/features/workforce/actions/leave-request", () => ({
  getMyLeaveRequestsAction: vi.fn(),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("../owner/BookingDialog", () => ({ BookingDialog: () => <button>Create booking</button> }));
vi.mock("../shared/GiftCardClaimDialog", () => ({ GiftCardClaimDialog: () => <button>Claim gift card</button> }));
vi.mock("../attendance/RequestLeaveDialog", () => ({ RequestLeaveDialog: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</> }));
vi.mock("../attendance/EmployeeLeaveClient", () => ({ EmployeeLeaveClient: ({ requests }: { requests: unknown[] }) => <div>Leave requests: {requests.length}</div> }));
vi.mock("./AttendanceCard", () => ({ default: () => <div>Shift status</div> }));
vi.mock("./PendingServicesList", () => ({ default: ({ services }: { services: { service: { name: string } }[] }) => <div data-testid="pending-services">{services.map((item) => item.service.name).join(", ")}</div> }));
vi.mock("./EmployeeServedHistory", () => ({ default: () => <div>Served history panel</div> }));
vi.mock("./EmployeePaymentsQueue", () => ({ default: () => <div>Payments queue</div> }));
vi.mock("../manager/ManagerQueueBoard", () => ({
  default: ({ managerCoordinator }: { managerCoordinator?: { run: unknown } }) =>
    <div data-testid="team-queue" data-coordinated={String(typeof managerCoordinator?.run === "function")}>Team queue controls</div>,
}));
vi.mock("../manager/ManagerBookingsDialog", () => ({ ManagerBookingsDialog: () => <button>Today&apos;s bookings</button> }));
vi.mock("./portal/AccountDropdown", () => ({ AccountDropdown: ({ canSubmitSocialPost }: { canSubmitSocialPost: boolean }) => <div>Social requests: {String(canSubmitSocialPost)}</div> }));
vi.mock("./portal/GreetingStrip", () => ({ GreetingStrip: ({ roleLabel, actions }: { roleLabel: string; actions: React.ReactNode }) => <div>{roleLabel}{actions}</div> }));
vi.mock("./portal/HeroKpiGrid", () => ({ HeroKpiGrid: ({ salaryEstimate }: { salaryEstimate: number }) => <div>Salary estimate: {salaryEstimate}</div> }));
vi.mock("./portal/EmployeePortalShell", () => ({ EmployeePortalShell: ({ greeting, heroKpi, children, manager }: { greeting: React.ReactNode; heroKpi: React.ReactNode; children: React.ReactNode; manager?: React.ReactNode }) => <div>{greeting}{heroKpi}{children}{manager}</div> }));

import EmployeeDashboard, { type EmployeeDashboardCapabilities } from "./EmployeeDashboard";
import ManagerDashboard from "../manager/ManagerDashboard";

const capabilities: EmployeeDashboardCapabilities = {
  canCreateBooking: false,
  canCollectPayment: false,
  canClaimQueue: false,
  canServeQueue: false,
  canQueueOverride: false,
  canManageCatalog: false,
  canSubmitSocialPost: false,
  canModifyBooking: false,
  canCancelBooking: false,
  canMarkNoShow: false,
  canAdjustBookingPrice: false,
};

const nails = { id: 1, service: { name: "Manicure", category: "Nails" } };
const hair = { id: 2, service: { name: "Haircut", category: "Hair" } };

const employeeProps = {
  businessName: "Beautyfeel",
  businessSlug: "beautyfeel",
  businessId: "biz-1",
  activeServices: [], completedServices: [], pendingServices: [nails, hair],
  managerQueueServices: [], managerQueueEmployees: [],
  currentEmployeeName: "Ana", currentEmployeeSpecialties: ["Nails"],
  currentEmployeeId: 1, currentEmployeeCommission: 10, currentEmployeeSalary: 1234567,
  employeeProfile: StaffProfile.STAFF, capabilities, todayAttendance: null,
  todayBookings: [], services: [], packages: [], categories: [], saleEvents: [], leaveRequests: [],
} as unknown as React.ComponentProps<typeof EmployeeDashboard>;

const managerProps = {
  businessName: "Beautyfeel", businessSlug: "beautyfeel", businessId: "biz-1",
  currentEmployeeId: 2, currentEmployeeSpecialties: ["Nails"], currentEmployeeCommission: 10,
  todayAttendance: null, capabilities, managerQueueServices: [], managerQueueEmployees: [],
  pendingServices: [nails, hair], servedHistory: [], todayBookings: [], managerBookings: [],
  services: [], packages: [], categories: [], saleEvents: [], leaveRequests: [],
} as unknown as React.ComponentProps<typeof ManagerDashboard>;

describe("staff dashboard capability presentation", () => {
  it("keeps the compact leave action accessible", () => {
    render(<EmployeeDashboard {...employeeProps} />);
    const leaveButton = screen.getByRole("button", { name: "Request leave" });
    expect(leaveButton).toHaveAttribute("title", "Request leave");
    expect(leaveButton).toHaveClass("size-11");
  });

  it("keeps cashier actions independent of queue and booking grants", () => {
    render(<EmployeeDashboard {...employeeProps} employeeProfile={StaffProfile.CASHIER} capabilities={{ ...capabilities, canSubmitSocialPost: true }} />);
    expect(screen.getByText("Cashier Portal")).toBeInTheDocument();
    expect(screen.getByText("Salary estimate: 1234567")).toBeInTheDocument();
    expect(screen.getByText("Social requests: true")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create booking" })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Available" }), { button: 0 });
    expect(screen.getByText("Your profile cannot claim available services.")).toBeInTheDocument();
  });

  it("shows granted staff work and filters it to specialties", () => {
    render(<EmployeeDashboard {...employeeProps} leaveRequests={[{}] as never} capabilities={{ ...capabilities, canCreateBooking: true, canClaimQueue: true, canServeQueue: true }} />);
    expect(screen.getByRole("button", { name: "Create booking" })).toBeInTheDocument();
    expect(screen.getByText("Leave requests: 1")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Available/ }), { button: 0 });
    expect(screen.getByTestId("pending-services")).toHaveTextContent("Manicure");
    expect(screen.getByTestId("pending-services")).not.toHaveTextContent("Haircut");
  });

  it("keeps staff queue override synchronized without granting unrelated actions", () => {
    render(<EmployeeDashboard {...employeeProps} capabilities={{ ...capabilities, canQueueOverride: true }} />);
    expect(screen.getByTestId("team-queue")).toHaveAttribute("data-coordinated", "true");
    expect(screen.queryByRole("button", { name: "Create booking" })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Available/ }), { button: 0 });
    expect(screen.getByText("Your profile cannot claim available services.")).toBeInTheDocument();
  });

  it("keeps manager queue override and payments independently gated", () => {
    const { rerender } = render(<ManagerDashboard {...managerProps} />);
    expect(screen.getByText("Queue override is not enabled for your profile.")).toBeInTheDocument();
    expect(screen.queryByText("Payments queue")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create booking" })).not.toBeInTheDocument();
    rerender(<ManagerDashboard {...managerProps} capabilities={{ ...capabilities, canQueueOverride: true, canCollectPayment: true, canCreateBooking: true, canClaimQueue: true }} />);
    expect(screen.getByText("Team queue controls")).toBeInTheDocument();
    expect(screen.getByText("Payments queue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create booking" })).toBeInTheDocument();
    expect(screen.getByTestId("pending-services")).toHaveTextContent("Manicure");
    expect(screen.getByTestId("pending-services")).not.toHaveTextContent("Haircut");
  });
});
