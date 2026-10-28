import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PayrollWorkspaceView, StatementView } from "@/features/payroll/v2/contracts";

const mocks = vi.hoisted(() => ({ get: vi.fn(), prepare: vi.fn(), next: vi.fn(), save: vi.fn(), payment: vi.fn(), settings: vi.fn(), compensation: vi.fn(), adjustment: vi.fn(), decision: vi.fn(), confirmCommission: vi.fn(), reconcile: vi.fn(), refresh: vi.fn(), changed: vi.fn(), denied: vi.fn(), government: vi.fn() }));
const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: notifications }));
vi.mock("@/features/payroll/actions/lifecycle", () => ({ getPayrollWorkspaceAction: mocks.get, preparePayrollAction: mocks.prepare, prepareNextPayrollEmployeeAction: mocks.next, saveSimplePayslipAction: mocks.save, recordPayrollPaymentAction: mocks.payment, saveSimplePayrollSettingsAction: mocks.settings, saveCompensationAction: mocks.compensation, createSimplePayrollAdjustmentAction: mocks.adjustment, decidePayrollAdjustmentAction: mocks.decision, confirmHistoricalPayrollCommissionAction: mocks.confirmCommission, reconcileLegacyPayrollAction: mocks.reconcile, refreshPayrollAction: mocks.refresh }));
vi.mock("@/features/payroll/actions/exports", () => ({ exportPayrollRunAction: vi.fn() }));
vi.mock("@/components/dashboard/owner-preview/CatalogEditorOverlay", () => ({
  CatalogEditorOverlay: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) => open ? <div role="dialog" aria-label={title}>{children}</div> : null,
  CatalogEditorFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { SimplePayrollWorkspace } from "./SimplePayrollWorkspace";
const payRead = vi.hoisted(() => vi.fn());
vi.mock("@/features/payroll/actions/pay-settings", () => ({ getEmployeePaySettingsAction: payRead }));

const statement = (): StatementView => ({ id: "statement-a", employeeId: 1, employeeName: "Ana", calculationPolicy: "SIMPLE", status: "DRAFT", paymentState: "UNPAID", revision: 2, gross: "100.00", deductions: "20.00", net: "80.00", employerCost: "100.00", paidAmount: "0.00", periodStart: "2026-10-01", periodEnd: "2026-10-10", paymentDate: "2026-10-11", publishedAt: null, lines: [], issues: [], payments: [] });
function fixture() {
  const data: PayrollWorkspaceView = { calculationPolicy: "SIMPLE", mode: "ACTIVE", revision: 1, cadence: "SEMIMONTHLY", smsEnabled: false, rulePackageId: null, ruleReady: false, openingConfirmed: true, canManageWorkforce: true, payDays: [15, 30], reconciliation: { legacyCount: 0, migrated: 0, unresolved: 0 }, employees: [{ id: 1, name: "Ana", revision: 1, profileReady: false, agreements: [{ id: "agreement-a", from: "2026-10-01", to: null, basis: "DAILY", rate: "100", commissionRate: "10", hours: "8" }] }], runs: [{ id: "run-a", calculationPolicy: "SIMPLE", revision: 1, start: "2026-10-01", end: "2026-10-10", paymentDate: "2026-10-11", kind: "REGULAR", employeeCount: 1, preparedCount: 1, statements: [statement()] }], hasMore: false, page: 1 };
  return { success: true as const, data, packages: [], historical: [], adjustments: [] };
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><SimplePayrollWorkspace businessSlug="studio" userId="owner" onChanged={mocks.changed} onDenied={mocks.denied} onGovernmentSettings={mocks.government} /></QueryClientProvider>);
  return { ...view, client };
}
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  window.history.replaceState(null, "", "/redesign/owner-dashboard/team/payroll");
  mocks.get.mockResolvedValue(fixture());
  payRead.mockResolvedValue({ success: true, data: { employee: fixture().data.employees[0], policy: "SIMPLE", mode: "ACTIVE", legacy: { dailyRate: "500", commissionRate: "10" } } });
});
afterEach(() => {
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

describe("simple payroll", () => {
  it("uses the redesign heading and summary before the payroll steps", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: "Payroll" })).toHaveTextContent("clearly accounted for.");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/redesign/owner-dashboard");
    const summary = screen.getByRole("region", { name: "Payroll overview" });
    expect(summary.compareDocumentPosition(screen.getByRole("list", { name: "Prepare payroll" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summary).toHaveTextContent("Earnings");
    expect(summary).toHaveTextContent("Recorded payments");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.payment).not.toHaveBeenCalled();
  });

  it("shows setup counts and searchable pay-term rows without implying any payment", async () => {
    const value = fixture(); value.data.mode = "SHADOW"; value.data.runs = []; value.data.employees[0].agreements = [];
    mocks.get.mockResolvedValue(value);
    mount();
    const summary = await screen.findByRole("region", { name: "Payroll setup overview" });
    expect(summary).toHaveTextContent("Team members1");
    expect(summary).toHaveTextContent("Needs pay terms1");
    expect(screen.queryByRole("region", { name: "Payroll overview" })).not.toBeInTheDocument();
    const terms = screen.getByRole("region", { name: "Set how your people earn" });
    expect(within(terms).getByRole("button", { name: "Set pay terms for Ana" })).toBeEnabled();
    fireEvent.change(within(terms).getByRole("textbox", { name: "Find an employee" }), { target: { value: "No match" } });
    expect(within(terms).queryByRole("button", { name: "Set pay terms for Ana" })).not.toBeInTheDocument();
    fireEvent.click(within(terms).getByRole("button", { name: "Clear search" }));
    fireEvent.click(within(terms).getByRole("button", { name: "Set pay terms for Ana" }));
    expect(await screen.findByRole("dialog", { name: "Pay settings" })).toBeInTheDocument();
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.payment).not.toHaveBeenCalled();
  });
  it("returns focus to the payslip row after a pending payment finishes", async () => {
    const value = fixture();
    Object.assign(value.data.runs[0].statements[0], { status: "PUBLISHED", paymentState: "UNPAID" });
    mocks.get.mockResolvedValue(value);
    let finish!: (result: unknown) => void;
    mocks.payment.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mount();
    const trigger = await screen.findByRole("button", { name: "View payslip" });
    vi.spyOn(trigger, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    fireEvent.change(screen.getByLabelText("Amount paid"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Payment reference or note"), { target: { value: "Synthetic cash installment" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Record payment" }));
    expect(trigger).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    Object.assign(value.data.runs[0].statements[0], { paidAmount: "40.00", paymentState: "PARTIAL" });
    await act(async () => { finish({ success: true, id: "payment-a" }); });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("shows three steps and keeps government setup inside settings", async () => {
    mount();
    expect(await screen.findByRole("list", { name: "Prepare payroll" })).toHaveTextContent("Choose dates");
    expect(screen.getByRole("list", { name: "Prepare payroll" })).toHaveTextContent("Review pay");
    expect(screen.getByRole("list", { name: "Prepare payroll" })).toHaveTextContent("Save payslips");
    expect(screen.queryByText("Statutory rule package")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Payroll settings" }));
    const settings = screen.getByRole("dialog", { name: "Payroll settings" });
    fireEvent.click(within(settings).getByRole("button", { name: "Review government setup" }));
    expect(mocks.government).toHaveBeenCalledTimes(1);
  });

  it("does not activate legacy payroll until the owner submits setup", async () => {
    const value = fixture(); value.data.mode = "LEGACY"; value.data.runs = [];
    mocks.get.mockResolvedValue(value);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Set up simple pay tracking" }));
    const dialog = screen.getByRole("dialog", { name: "Start simple pay tracking" });
    expect(within(dialog).queryByText("Employer SSS")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Start simple pay tracking" })).toBeDisabled();
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("dismisses a reviewed submission immediately and recovers the draft on failure", async () => {
    let resolve!: (value: unknown) => void;
    mocks.save.mockReturnValue(new Promise(value => { resolve = value; }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Review pay" }));
    const dialog = screen.getByRole("dialog", { name: "Review pay" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "I reviewed these earnings and deductions." }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save payslip" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saving payslip");
    const row = screen.getByText("Ana", { selector: "strong" }).closest("li")!;
    expect(within(row).getByText("Draft", { selector: "span" })).toBeInTheDocument();
    expect(within(row).queryByText("Ready to pay", { selector: "span" })).not.toBeInTheDocument();
    expect(within(row).queryByText("Paid", { selector: "span" })).not.toBeInTheDocument();
    await act(async () => { resolve({ success: false, code: "UNAVAILABLE", error: "The save could not be confirmed" }); });
    await waitFor(() => expect(notifications.error).toHaveBeenCalled());
    const recovery = notifications.error.mock.calls.at(-1)?.[1];
    expect(recovery.action.label).toBe("Review draft");
    act(() => recovery.action.onClick());
    expect(screen.getByRole("dialog", { name: "Review pay" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "I reviewed these earnings and deductions." })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save payslip" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][0].key).toBe(mocks.save.mock.calls[0][0].key);
  });

  it("retains the payment revision and request key after an uncertain partial payment", async () => {
    const original = fixture(); original.data.runs[0].statements[0].status = "PUBLISHED";
    const later = fixture(); Object.assign(later.data.runs[0].statements[0], { status: "PUBLISHED", paymentState: "PARTIAL", paidAmount: "10.00", revision: 3 });
    mocks.get.mockResolvedValue(original);
    mocks.payment.mockImplementation(async () => { mocks.get.mockResolvedValue(later); throw new Error("Connection lost after payment"); });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Record payment" }));
    const dialog = screen.getByRole("dialog", { name: "Record payment" });
    fireEvent.change(within(dialog).getByLabelText("Amount paid"), { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Payment reference or note"), { target: { value: "Cash given to Ana" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
    await screen.findByRole("button", { name: "Resume draft" });
    fireEvent.click(screen.getByRole("button", { name: "Resume draft" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Record payment" })).getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(mocks.payment).toHaveBeenCalledTimes(2));
    expect(mocks.payment.mock.calls[0][0]).toMatchObject({ amount: "10", expectedRevision: 2, reference: "Cash given to Ana" });
    expect(mocks.payment.mock.calls[1][0]).toEqual(mocks.payment.mock.calls[0][0]);
  });

  it("blocks saving unresolved work beside the affected employee", async () => {
    const value = fixture(); value.data.runs[0].statements[0].issues = [{ code: "MISSING_CLOCK", message: "Confirm Ana’s attendance first." }];
    mocks.get.mockResolvedValue(value);
    mount();
    expect(await screen.findByText("Confirm Ana’s attendance first.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review pay" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Save payslip" })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("resolves a proposed recovery from review and refreshes the affected draft after confirmation", async () => {
    const value = fixture();
    value.data.runs[0].statements[0].issues = [{ code: "ADJUSTMENT_REVIEW", message: "Decide pending adjustments before publishing." }];
    Object.assign(value, { adjustments: [{ id: "recovery-a", employeeId: 1, revision: 4, amount: "-100.00", reason: "Refunded completed service", disposition: "PENDING" }] });
    mocks.get.mockResolvedValue(value);
    mocks.decision.mockResolvedValue({ success: true, id: "recovery-a", revision: 5 });
    mocks.refresh.mockImplementation(async () => { mocks.get.mockResolvedValue(fixture()); return { success: true, id: "statement-a", revision: 3 }; });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Review pay" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve pay checks" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Pay checks" })).getByRole("button", { name: "Review amount" }));
    const dialog = screen.getByRole("dialog", { name: "Review an amount" });
    fireEvent.change(within(dialog).getByLabelText("Decision reason and authorization"), { target: { value: "Owner authorizes a smaller recovery" } });
    const amount = within(dialog).getByLabelText("Deduction to approve (negative amount)");
    fireEvent.change(amount, { target: { value: "-150" } });
    expect(within(dialog).getByRole("button", { name: "Approve reduced deduction" })).toBeDisabled();
    fireEvent.change(amount, { target: { value: "-50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve reduced deduction" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.decision).toHaveBeenCalledWith(expect.objectContaining({ adjustmentId: "recovery-a", expectedRevision: 4, reviewedAmount: "-50", disposition: "APPROVED" })));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith(expect.objectContaining({ statementId: "statement-a", expectedRevision: 2 })));
    expect(notifications.success).toHaveBeenCalledWith("Adjustment decision saved.");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each([["Defer this amount", "Defer amount", "DEFERRED"], ["Waive this amount", "Waive amount", "WAIVED"]])("supports an explicit %s decision from settings", async (option, button, disposition) => {
    const value = fixture();
    Object.assign(value, { adjustments: [{ id: "recovery-a", employeeId: 1, revision: 4, amount: "-100.00", reason: "Cancelled service recovery", disposition: "PENDING" }] });
    mocks.get.mockResolvedValue(value); mocks.decision.mockResolvedValue({ success: true, id: "recovery-a", revision: 5 }); mocks.refresh.mockResolvedValue({ success: true, id: "statement-a", revision: 3 });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Payroll settings" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Payroll settings" })).getByRole("button", { name: "Review pay checks" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Pay checks" })).getByRole("button", { name: "Review amount" }));
    const dialog = screen.getByRole("dialog", { name: "Review an amount" });
    fireEvent.change(within(dialog).getByLabelText("Decision reason and authorization"), { target: { value: "Owner reviewed this recovery decision" } });
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Decision" }));
    fireEvent.click(await screen.findByRole("option", { name: option }));
    fireEvent.click(within(dialog).getByRole("button", { name: button }));
    await waitFor(() => expect(mocks.decision).toHaveBeenCalledWith(expect.objectContaining({ disposition, reviewedAmount: undefined })));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it("retains recovery authorization and the same decision key after an uncertain result", async () => {
    const value = fixture();
    Object.assign(value, { adjustments: [{ id: "recovery-a", employeeId: 1, revision: 4, amount: "-100.00", reason: "Refunded service", disposition: "PENDING" }] });
    mocks.get.mockResolvedValue(value); mocks.decision.mockResolvedValue({ success: false, code: "UNAVAILABLE", error: "Decision response was lost" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Review pay checks" }));
    fireEvent.click(screen.getByRole("button", { name: "Review amount" }));
    fireEvent.change(screen.getByLabelText("Decision reason and authorization"), { target: { value: "Owner verified refund authorization" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve amount" }));
    await screen.findByRole("button", { name: "Resume draft" });
    expect(mocks.refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Resume draft" }));
    expect(screen.getByLabelText("Decision reason and authorization")).toHaveValue("Owner verified refund authorization");
    fireEvent.click(screen.getByRole("button", { name: "Approve amount" }));
    await waitFor(() => expect(mocks.decision).toHaveBeenCalledTimes(2));
    expect(mocks.decision.mock.calls[1][0]).toEqual(mocks.decision.mock.calls[0][0]);
  });

  it("confirms historical commissions without opening government settings and refreshes the draft", async () => {
    const value = fixture();
    value.data.runs[0].statements[0].issues = [{ code: "COMMISSION_SETUP", message: "Confirm captured commission evidence.", sourceId: "99" }];
    Object.assign(value, { historical: { count: 1, records: [{ id: 99, revision: 3, employeeId: 1, employeeName: "Renamed Ana", earnedOn: "2024-01-15", recordedBase: "500.00", paid: true }] } });
    mocks.get.mockResolvedValue(value); mocks.confirmCommission.mockResolvedValue({ success: true, id: "99" }); mocks.refresh.mockResolvedValue({ success: true, id: "statement-a", revision: 3 });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Review pay" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve pay checks" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm commission" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm commission" });
    fireEvent.change(within(dialog).getByLabelText("Confirmed commission percentage"), { target: { value: "12" } });
    fireEvent.change(within(dialog).getByLabelText("Customer fully paid on"), { target: { value: "2024-01-16" } });
    fireEvent.change(within(dialog).getByLabelText("Rate and payment evidence"), { target: { value: "Original invoice confirms rate and full payment" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm captured evidence" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.confirmCommission).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 99, expectedRevision: 3, rate: "12", base: "500.00", payableOn: "2024-01-16", evidence: "Original invoice confirms rate and full payment" })));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith(expect.objectContaining({ statementId: "statement-a", expectedRevision: 2 })));
    expect(mocks.government).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("records a published correction for later pay without changing the original payslip", async () => {
    const value = fixture(); Object.assign(value.data.runs[0].statements[0], { status: "PUBLISHED", paymentState: "PAID", paidAmount: "80.00" });
    mocks.get.mockResolvedValue(value);
    mocks.adjustment.mockResolvedValue({ success: true, id: "correction-a" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Add correction" }));
    const dialog = screen.getByRole("dialog", { name: "Add a correction" });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "25" } });
    fireEvent.change(within(dialog).getByLabelText("Label"), { target: { value: "Extra service bonus" } });
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Owner approved missing bonus" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save adjustment" }));
    await waitFor(() => expect(mocks.adjustment).toHaveBeenCalledTimes(1));
    expect(mocks.adjustment.mock.calls[0][0]).toMatchObject({ employeeId: 1, expectedRevision: 1, originalStatementId: "statement-a", label: "Extra service bonus", amount: "25", reason: "Owner approved missing bonus" });
    expect(mocks.adjustment.mock.calls[0][0].earnedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mocks.refresh).not.toHaveBeenCalled();
    await waitFor(() => expect(notifications.success).toHaveBeenCalledWith("Correction saved for next payroll."));
    const row = screen.getByText("Ana", { selector: "strong" }).closest("li")!;
    expect(within(row).getByText("Paid", { selector: "span" })).toBeInTheDocument();
    expect(within(row).getByText("₱0.00")).toBeInTheDocument();
  });

  it("can prepare extra pay separately from an overlapping regular payroll", async () => {
    mocks.prepare.mockResolvedValue({ success: false, code: "BLOCKED", error: "Check selected sources" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Prepare pay" }));
    const dialog = screen.getByRole("dialog", { name: "Choose dates" });
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Pay type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Extra pay / correction" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Review pay" }));
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1));
    expect(mocks.prepare.mock.calls[0][0]).toMatchObject({ kind: "OFF_CYCLE", employeeIds: [1] });
  });

  it("allows pay terms to be entered while simple setup is still being reconciled", async () => {
    const value = fixture(); value.data.mode = "SHADOW"; value.data.employees[0].agreements = []; value.data.runs = [];
    mocks.get.mockResolvedValue(value);
    mount();
    const button = await screen.findByRole("button", { name: "Set pay terms for Ana" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(await screen.findByRole("dialog", { name: "Pay settings" })).toBeInTheDocument();
  });

  it("offers monthly pay without government profile or daily-divisor fields", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Payroll settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit pay terms" }));
    const dialog = screen.getByRole("dialog", { name: "Pay settings" });
    expect(await within(dialog).findByLabelText("Daily rate")).toHaveValue(100);
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Paid per" }));
    fireEvent.click(await screen.findByRole("option", { name: "Month" }));
    expect(within(dialog).getByLabelText("Monthly salary")).toHaveValue(100);
    expect(within(dialog).queryByText(/divisor/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/SSS/i)).not.toBeInTheDocument();
  });

  it("does not report zero-net payslips as paid or offer a zero payment", async () => {
    const value = fixture(); Object.assign(value.data.runs[0].statements[0], { status: "PUBLISHED", net: "0.00", deductions: "100.00" });
    mocks.get.mockResolvedValue(value);
    mount();
    expect(await screen.findByText("No payment due", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
    expect(screen.queryByText("Paid", { selector: "span" })).not.toBeInTheDocument();
  });

  it("removes sensitive compensation after navigation", async () => {
    const view = mount();
    await screen.findByRole("button", { name: "Review pay" });
    view.unmount();
    await waitFor(() => expect(view.client.getQueryCache().findAll()).toHaveLength(0));
  });
});

