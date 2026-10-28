import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/payroll/LeaveAwardsReview", () => ({ LeaveAwardsReview: () => null }));
vi.mock("@/components/payroll/ServiceChargeReview", () => ({ ServiceChargeReview: () => null }));
vi.mock("@/features/payroll/actions/pay-settings", () => ({ getEmployeePaySettingsAction: vi.fn() }));
import type { PayrollWorkspaceView, StatementView } from "@/features/payroll/v2/contracts";
const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: notifications }));

const mocks = vi.hoisted(() => ({ get: vi.fn(), activate: vi.fn(), decision: vi.fn(), preview: vi.fn(), settings: vi.fn() }));
vi.mock("@/features/payroll/actions/lifecycle", () => ({ getPayrollWorkspaceAction: mocks.get, activatePayrollAction: mocks.activate, decidePayrollAdjustmentAction: mocks.decision, previewPayrollPaymentDateAction: mocks.preview, preparePayrollAction: vi.fn(), prepareNextPayrollEmployeeAction: vi.fn(), refreshPayrollAction: vi.fn(), approvePayrollAction: vi.fn(), publishPayrollAction: vi.fn(), recordPayrollPaymentAction: vi.fn(), voidPayrollAction: vi.fn(), saveCompensationAction: vi.fn(), savePayrollProfileAction: vi.fn(), savePayrollSettingsAction: mocks.settings, reconcileLegacyPayrollAction: vi.fn(), createPayrollAdjustmentAction: vi.fn(), reconcilePayrollPaymentDateAction: vi.fn() }));
vi.mock("@/features/payroll/actions/exports", () => ({ exportPayrollRunAction: vi.fn() }));
vi.mock("@/components/bookings/design-study/AnimatedFilterGroup", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("./BulkPayroll", () => ({ BulkPayroll: () => null }));
vi.mock("./GovernmentExports", () => ({ GovernmentExports: () => null }));
vi.mock("./BenefitsReview", () => ({ BenefitsReview: () => null }));
vi.mock("./LeaveReview", () => ({ LeaveReview: () => null }));
vi.mock("./CommissionConfirmation", () => ({ CommissionConfirmation: () => null }));
vi.mock("./WorkforceReview", () => ({ AttendanceReview: () => null }));
vi.mock("./AttendanceCorrectionInbox", () => ({ AttendanceCorrectionInbox: () => null }));
vi.mock("./StatementDetails", () => ({ php: (value: string) => "PHP " + value, StatementDetails: ({ statement }: { statement: StatementView }) => <div>Source breakdown for {statement.employeeName}</div> }));
import { PayrollWorkspace } from "./PayrollWorkspace";
import { PeoplePayrollSetup } from "./PeoplePayrollSetup";

const statement = (id: string, employeeId: number, employeeName: string): StatementView => ({ id, employeeId, employeeName, status: "DRAFT", paymentState: "UNPAID", revision: 2, gross: "100.00", deductions: "20.00", net: "80.00", employerCost: "110.00", paidAmount: "0.00", periodStart: "2026-10-01", periodEnd: "2026-10-10", paymentDate: "2026-10-11", publishedAt: null, lines: [], issues: [], payments: [] });
function fixture() {
  const data: PayrollWorkspaceView = { mode: "ACTIVE", revision: 1, cadence: "SEMIMONTHLY", smsEnabled: false, rulePackageId: "reviewed", ruleReady: true, openingConfirmed: true, canManageWorkforce: true, payDays: [15, 30], reconciliation: { legacyCount: 0, migrated: 0, unresolved: 0 }, employees: [1, 2].map(id => ({ id, name: id === 1 ? "Ana" : "Ben", revision: 1, profileReady: true, agreements: [] })), runs: [{ id: "run-a", revision: 1, start: "2026-10-01", end: "2026-10-10", paymentDate: "2026-10-11", kind: "REGULAR", employeeCount: 2, preparedCount: 2, statements: [statement("statement-a", 1, "Ana"), statement("statement-b", 2, "Ben")] }], hasMore: true, page: 1 };
  return { success: true as const, data, packages: [{ id: "reviewed", certified: true }], historical: [], adjustments: [{ id: "adjustment-a", employeeId: 1, amount: "-100.00", reason: "Authorized recovery", disposition: "PENDING", revision: 1 }] };
}
function mount(redesign = false) { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><PayrollWorkspace businessSlug="studio" userId="owner" redesign={redesign} /></QueryClientProvider>); }
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/app/studio/payroll"); mocks.get.mockResolvedValue(fixture()); });
describe("payroll lifecycle workspace", () => {
  it("uses the shared redesign heading without adding a nested main landmark", async () => {
    mount(true);
    expect(await screen.findByRole("heading", { level: 1, name: "Payroll" })).toHaveTextContent("clearly accounted for.");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/redesign/owner-dashboard");
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 · Choose period" })).toBeInTheDocument();
    expect(mocks.settings).not.toHaveBeenCalled();
  });
  it("requires an effective date and explicit opening review before enabling government calculations", async () => {
    const result = fixture(); Object.assign(result.data, { calculationPolicy: "SIMPLE" });
    mocks.get.mockResolvedValue(result);
    mocks.settings.mockResolvedValue({ success: true, id: "studio", revision: 2 });
    window.history.replaceState(null, "", "/redesign/owner-dashboard/team/payroll?stage=setup");
    mount();
    const section = await screen.findByRole("region", { name: "Enable government calculations" });
    const save = screen.getByRole("button", { name: "Save settings" });
    expect(save).toBeDisabled();
    fireEvent.change(within(section).getByLabelText("Government calculations from"), { target: { value: "2026-11-01" } });
    fireEvent.click(within(section).getByRole("checkbox", { name: /I reviewed the opening balances/ }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(mocks.settings).toHaveBeenCalledWith(expect.objectContaining({ effectiveFrom: "2026-11-01", reviewedOpening: true })));
  });

  it("uses the redesign loading skeleton while payroll is pending", () => {
    mocks.get.mockReturnValue(new Promise(() => {}));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><PayrollWorkspace businessSlug="studio" userId="owner" redesign /></QueryClientProvider>);
    expect(screen.getByRole("status", { name: "Loading payroll" })).toHaveAttribute("aria-busy", "true");
  });
  it("opens setup directly and retains employee context in the redesign", async () => {
    window.history.replaceState(null, "", "/redesign/owner-dashboard/team/payroll?employee=2");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><PayrollWorkspace businessSlug="studio" userId="owner" redesign initialStage="setup" /></QueryClientProvider>);
    expect(await screen.findByText("Business payroll setup")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Employee to configure" })).toHaveTextContent("Ben");
  });
  it("keeps review panel identities distinct for all and selected employees", async () => {
    const error = vi.spyOn(console, "error");
    try {
      window.history.replaceState(null, "", "/app/studio/payroll?stage=issues");
      mount();
      await screen.findByRole("region", { name: "Ana adjustment decision" });
      window.history.replaceState(null, "", "/app/studio/payroll?stage=issues&employee=1");
      fireEvent(window, new PopStateEvent("popstate"));
      await waitFor(() => expect(screen.getByRole("combobox", { name: "Employee context" })).toHaveTextContent("Ana"));
      fireEvent.click(screen.getByRole("button", { name: /Review and publish/ }));
      await screen.findByText("Source breakdown for Ana");
      fireEvent.click(screen.getByRole("button", { name: /Resolve issues/ }));
      await screen.findByRole("region", { name: "Ana adjustment decision" });
      const duplicateKeys = error.mock.calls.filter(args => String(args[0]).includes("same key"));
      expect(duplicateKeys).toEqual([]);
    } finally {
      error.mockRestore();
    }
  });
  it("restores selected run, employee and stage and preserves them while navigating", async () => {
    window.history.replaceState(null, "", "/app/studio/payroll?run=run-a&employee=2&stage=review&page=2");
    mount();
    expect(await screen.findByText("Source breakdown for Ben")).toBeInTheDocument();
    expect(screen.queryByText("Source breakdown for Ana")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(2));
    fireEvent.click(screen.getByRole("button", { name: /Record payments/ }));
    expect(new URLSearchParams(window.location.search).get("employee")).toBe("2");
    expect(new URLSearchParams(window.location.search).get("run")).toBe("run-a");
    expect(new URLSearchParams(window.location.search).get("stage")).toBe("payments");
  });
  it("requires an authorized decision and supports explicit reduced deductions with repeatable keys", async () => {
    window.history.replaceState(null, "", "/app/studio/payroll?stage=issues");
    mocks.decision.mockResolvedValue({ success: false, code: "UNAVAILABLE", error: "Retry this request" });
    mount();
    const panel = await screen.findByRole("region", { name: "Ana adjustment decision" });
    const approve = within(panel).getByRole("button", { name: "Approve amount" });
    expect(approve).toBeDisabled();
    fireEvent.change(within(panel).getByLabelText("Decision reason and authorization"), { target: { value: "Owner verified reduced recovery" } });
    const amount = within(panel).getByLabelText("Deduction to approve (negative amount)");
    fireEvent.change(amount, { target: { value: "0" } });
    expect(within(panel).getByRole("button", { name: "Approve reduced deduction" })).toBeDisabled();
    fireEvent.change(amount, { target: { value: "-150" } });
    expect(within(panel).getByRole("button", { name: "Approve reduced deduction" })).toBeDisabled();
    fireEvent.change(amount, { target: { value: "-50" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Approve reduced deduction" }));
    await waitFor(() => expect(mocks.decision).toHaveBeenCalledTimes(1));
    await screen.findByText("Retry this request");
    expect(notifications.error).toHaveBeenCalledWith("Retry this request");
    fireEvent.click(within(panel).getByRole("button", { name: "Approve reduced deduction" }));
    await waitFor(() => expect(mocks.decision).toHaveBeenCalledTimes(2));
    expect(mocks.decision.mock.calls[0][0]).toMatchObject({ reviewedAmount: "-50", disposition: "APPROVED", adjustmentId: "adjustment-a", expectedRevision: 1 });
    expect(mocks.decision.mock.calls[1][0].key).toBe(mocks.decision.mock.calls[0][0].key);
  });
  it("shows durable previous and current totals before a refreshed statement is approved", async () => {
    const result = fixture();
    Object.assign(result.data.runs[0].statements[0], { previousReview: { gross: "90.00", deductions: "10.00", net: "80.00", employerCost: "100.00", reviewHash: "old" } });
    mocks.get.mockResolvedValue(result);
    window.history.replaceState(null, "", "/app/studio/payroll?stage=review&employee=1");
    mount();
    const comparison = await screen.findByRole("region", { name: "Calculation changes" });
    expect(within(comparison).getByText("Previous review")).toBeInTheDocument();
    expect(within(comparison).getByText("PHP 90.00")).toBeInTheDocument();
    expect(within(comparison).getAllByText("PHP 10.00").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });
  it("lets an installment be reviewed even on the planned payment date", async () => {
    const result = fixture(); result.data.runs[0].statements[0].status = "PUBLISHED";
    mocks.get.mockResolvedValue(result);
    mocks.preview.mockResolvedValue({ success: false, error: "Needs independent review" });
    window.history.replaceState(null, "", "/app/studio/payroll?stage=payments&employee=1");
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Review payment date" }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith({ statementId: "statement-a", amount: "80.00", date: "2026-10-11" }));
  });
  it("retries activation with the same request key after an uncertain response", async () => {
    const result = fixture(); result.data.mode = "SHADOW"; mocks.get.mockResolvedValue(result);
    mocks.activate.mockResolvedValue({ success: false, code: "UNAVAILABLE", error: "Try activation again" });
    window.history.replaceState(null, "", "/app/studio/payroll?stage=setup&employee=2");
    mount();
    const button = await screen.findByRole("button", { name: "Activate reconciled payroll" });
    fireEvent.click(button); await screen.findByText("Try activation again");
    fireEvent.click(button); await waitFor(() => expect(mocks.activate).toHaveBeenCalledTimes(2));
    expect(mocks.activate.mock.calls[1][0].key).toBe(mocks.activate.mock.calls[0][0].key);
    expect(screen.getByRole("combobox", { name: "Employee to configure" })).toHaveTextContent("Ben");
  });
  it("creates a People link to this employee's shared compensation setup", () => {
    render(<PeoplePayrollSetup employeeId={2} employeeName="Ben" payrollHref="/app/studio/payroll" />);
    expect(screen.getByRole("link", { name: "Payroll setup for Ben" })).toHaveAttribute("href", "/app/studio/payroll?stage=setup&employee=2");
  });
});
