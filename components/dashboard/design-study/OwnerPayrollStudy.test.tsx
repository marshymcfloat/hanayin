import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerPayrollEditor } from "@/components/dashboard/design-study/OwnerPayrollEditor";
import { OwnerPayrollStudy } from "@/components/dashboard/design-study/OwnerPayrollStudy";
import { OwnerPayrollPreviewRoute } from "@/components/dashboard/owner-preview/OwnerPayrollPreviewQuery";
import type { OwnerPayrollPreviewData } from "@/features/payroll/types/owner-payroll-preview";
vi.mock("@/features/payroll/actions/pay-settings", () => ({ getEmployeePaySettingsAction: vi.fn() }));
vi.mock("@/features/payroll/actions/lifecycle", () => ({ saveCompensationAction: vi.fn() }));

const mocks = vi.hoisted(() => ({ preview: vi.fn(), create: vi.fn(), success: vi.fn(), error: vi.fn(), fetch: vi.fn(), revoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/features/payroll/actions/payslip", () => ({ getPayslipDataAction: mocks.preview, createPayslipAction: mocks.create }));
vi.mock("@/components/payroll/PayrollWorkspace", () => ({ PayrollWorkspace: () => <div>Period payroll workspace</div> }));
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewQueryProvider", () => ({ useOwnerPreviewContext: () => ({ userId: "owner", businessId: "b", businessSlug: "studio", businessName: "Studio" }), useOwnerPreviewFetch: () => mocks.fetch, useOwnerPreviewRevoke: () => mocks.revoke }));
const data: Extract<OwnerPayrollPreviewData, { access: "granted" }> = { access: "granted", businessName: "Studio", month: "2026-10", paidThisMonth: 1000, paidPayslipsThisMonth: 1, employees: [{ id: 1, name: "Ana", profile: "STAFF", dailyRate: 500, commissionPercentage: 10, lastPaidAt: null, lastPaidAmount: null }], recentPayslips: [] };
const preview = { success: true, data: { employee: { id: 1, name: "Ana" }, period: { start: new Date("2026-10-01"), end: new Date("2026-10-11") }, total_salary: 1000, breakdown: { days_present: 2, paid_leave_days: 0, basic_salary: 900, commission_total: 100 } } };
function setupEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn(); const onOpenChange = vi.fn();
  const view = render(<QueryClientProvider client={client}><OwnerPayrollEditor employee={{ id: 1, name: "Ana" }} open onOpenChange={onOpenChange} onExited={vi.fn()} onSaved={onSaved} /></QueryClientProvider>);
  return { client, onSaved, onOpenChange, ...view };
}
beforeEach(() => { vi.clearAllMocks(); mocks.preview.mockResolvedValue(preview); Element.prototype.scrollIntoView = vi.fn(); });

describe("redesign Payroll", () => {
  it("requires an explicit confirmation and keeps payout server-confirmed", async () => {
    let finish!: (value: unknown) => void;
    mocks.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { onSaved, onOpenChange } = setupEditor();
    const confirmation = await screen.findByRole("checkbox");
    expect(screen.getByRole("button", { name: "Confirm payout" })).toBeDisabled();
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: "Confirm payout" }));
    expect(screen.getByRole("button", { name: "Recording…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(onOpenChange).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => finish({ success: true }));
    expect(onSaved).toHaveBeenCalledTimes(1); expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.success).toHaveBeenCalledWith("Payout recorded.");
  });
  it("preserves a failed payout draft and handles thrown server responses", async () => {
    mocks.create.mockRejectedValue(new Error("Offline"));
    const { onSaved } = setupEditor();
    fireEvent.change(await screen.findByLabelText("Deduction (PHP)"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm payout" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByLabelText("Deduction (PHP)")).toHaveValue(50); expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm payout" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload payout details" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reload payout details" })).not.toBeInTheDocument());
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("protects draft dismissal and clears private preview data on unmount", async () => {
    const view = setupEditor();
    fireEvent.change(await screen.findByLabelText("Payout note (optional)"), { target: { value: "Draft note" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Payout note (optional)")).toHaveValue("Draft note");
    view.unmount();
    await waitFor(() => expect(view.client.getQueryCache().getAll()).toHaveLength(0));
  });
  it("cannot submit unread payroll and can retry a failed preview", async () => {
    mocks.preview.mockResolvedValueOnce({ success: false, error: "Unavailable" }).mockResolvedValueOnce(preview);
    setupEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Retry payout details" }));
    expect(await screen.findByRole("checkbox")).toBeEnabled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("searches all employees before progressive rendering", () => {
    render(<QueryClientProvider client={new QueryClient()}><OwnerPayrollStudy data={{ ...data, employees: Array.from({ length: 14 }, (_, index) => ({ ...data.employees[0], id: index + 1, name: `Employee ${index + 1}` })) }} refreshControl={null} onChanged={vi.fn()} /></QueryClientProvider>);
    expect(screen.getAllByRole("button", { name: /Pay settings for/ })).toHaveLength(12);
    expect(screen.getByRole("link", { name: "Open existing payroll" })).toHaveAttribute("href", "/app/studio/payroll");
    fireEvent.change(screen.getByRole("textbox", { name: "Search payroll employees" }), { target: { value: "Employee 14" } });
    expect(screen.getAllByRole("button", { name: /Pay settings for/ })).toHaveLength(1);
  });
  it("never exposes financial rows to a restricted owner", async () => {
    mocks.fetch.mockResolvedValue({ access: "restricted" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPayrollPreviewRoute redesign /></QueryClientProvider>);
    expect(await screen.findByText("Payroll access restricted")).toBeInTheDocument();
    expect(screen.queryByText("Team pay settings")).not.toBeInTheDocument();
  });
});
