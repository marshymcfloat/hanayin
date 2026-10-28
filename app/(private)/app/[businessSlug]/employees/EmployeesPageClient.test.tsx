import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeesWorkspaceEmployee } from "@/features/workforce/queries/employees";
const mocks = vi.hoisted(() => ({ update: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/workforce/actions/employees", () => ({ updateEmployeeAction: mocks.update, createEmployeeAction: vi.fn(), deleteEmployeeAction: vi.fn(), resendEmployeeInviteAction: vi.fn(), resetEmployeePasswordAction: vi.fn() }));
vi.mock("@/components/dashboard/owner/ScheduleEditor", () => ({ ScheduleEditor: () => null }));
vi.mock("./EmployeeList", () => ({ EmployeeList: ({ employees, onEdit }: { employees: EmployeesWorkspaceEmployee[]; onEdit: (employee: EmployeesWorkspaceEmployee) => void }) => <button onClick={() => onEdit(employees[0])}>Edit Ana</button> }));
import { EmployeesPageClient } from "./EmployeesPageClient";
const employee: EmployeesWorkspaceEmployee = { id: 1, user_id: "employee-a", business_id: "business-a", profile: "STAFF", permissions: [], specialties: [], recurring_days_off: [], is_demo: false, employment_start: null, employment_end: null, archived_at: null, financial_revision: 0, salary: null, daily_rate: null, commission_percentage: null, attendance: [], payslips: [], _count: { served_services: 0 }, user: { id: "employee-a", name: "Ana", contact_number: "639123456789", role: "EMPLOYEE", created_at: new Date(), updated_at: new Date() } };
beforeEach(() => { vi.clearAllMocks(); mocks.update.mockResolvedValue({ success: true }); });
describe("People profile compensation guard", () => {
  it("hides salary inputs and omits rate fields from an ordinary profile update", async () => {
    render(<EmployeesPageClient employees={[employee]} categories={[]} businessSlug="studio" canAccessPayroll={false} canManageCompensation={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Ana" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByLabelText("Daily Rate (PHP)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Commission (%)")).not.toBeInTheDocument();
    expect(screen.queryByText("Avg commission")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: "Ana Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0][0]).toBe(1);
    expect(mocks.update.mock.calls[0][1]).toMatchObject({ name: "Ana Updated" });
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty("daily_rate");
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty("commission_percentage");
  });
  it("keeps legacy salary input available when compensation capability is explicitly granted", async () => {
    render(<EmployeesPageClient employees={[{ ...employee, daily_rate: 100, commission_percentage: 10 }]} categories={[]} businessSlug="studio" canAccessPayroll canManageCompensation />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Ana" }));
    expect(await screen.findByLabelText("Daily Rate (PHP)")).toHaveValue(100);
    expect(screen.getByLabelText("Commission (%)")).toHaveValue(10);
  });
});
