import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerEmployeesStudy } from "@/components/dashboard/design-study/OwnerEmployeesStudy";
const payRead = vi.hoisted(() => vi.fn());
const paySave = vi.hoisted(() => vi.fn());
vi.mock("@/features/payroll/actions/pay-settings", () => ({ getEmployeePaySettingsAction: payRead }));
vi.mock("@/features/payroll/actions/lifecycle", () => ({ saveCompensationAction: paySave }));
import type { OwnerPreviewEmployeesData } from "@/features/workforce/types/owner-preview-directory";
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), schedule: vi.fn(), saveSchedule: vi.fn(), invite: vi.fn(), password: vi.fn(), fetch: vi.fn(), revoke: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, warning: mocks.warning } }));
vi.mock("@/features/workforce/actions/employees", () => ({ createEmployeeAction: mocks.create, updateEmployeeAction: mocks.update, deleteEmployeeAction: mocks.remove, getEmployeeScheduleAction: mocks.schedule, upsertEmployeeScheduleAction: mocks.saveSchedule, resendEmployeeInviteAction: mocks.invite, resetEmployeePasswordAction: mocks.password }));
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewQueryProvider", () => ({ useOwnerPreviewContext: () => ({ businessId: "b", businessSlug: "studio", userId: "u" }), useOwnerPreviewFetch: () => mocks.fetch, useOwnerPreviewRevoke: () => mocks.revoke }));
vi.mock("@/components/bookings/design-study/SelectionMotion", () => ({ useSelectionMotion: () => () => {} }));
const employee = { id: 1, name: "Mika", contactNumber: "09123456789", profile: "STAFF" as const, specialties: ["Hair"], recurringDaysOff: [0] };
const data: OwnerPreviewEmployeesData = { businessName: "Studio", employees: [employee] };
const editor = { categories: ["Hair", "Nails"], defaults: { STAFF: ["BOOKING_CREATE"], MANAGER: ["CATALOG_MANAGE"], CASHIER: ["PAYMENT_COLLECT"] }, employees: [{ id: 1, name: "Mika", contact_number: "09123456789", profile: "STAFF", permissions: ["BOOKING_CREATE"], daily_rate: 500, commission_percentage: 5, specialties: ["Hair"], recurring_days_off: [0] }] };
function setup(value = data) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const changed = vi.fn();
  render(<QueryClientProvider client={client}><OwnerEmployeesStudy data={value} refreshControl={<button>Refresh employees</button>} onChanged={changed} /></QueryClientProvider>);
  return { changed, client };
}
async function open(label: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: "Manage Mika" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
  return within(screen.getByRole("dialog"));
}
beforeEach(() => { vi.clearAllMocks(); Element.prototype.scrollIntoView = vi.fn(); mocks.fetch.mockResolvedValue(editor); });
describe("redesign employees", () => {
  it("can open pay settings after confirmed employee creation without saving a pay rate automatically", async () => {
    mocks.fetch.mockResolvedValue({ ...editor, canManagePayroll: true });
    mocks.create.mockResolvedValue({ success: true, data: { id: 22 } });
    payRead.mockResolvedValue({ success: true, data: { policy: "SIMPLE", mode: "LEGACY", legacy: { dailyRate: "0", commissionRate: "0" }, employee: { id: 22, name: "New colleague", revision: 1, agreements: [] } } });
    setup({ ...data, canManagePay: true });
    fireEvent.click(screen.getByRole("button", { name: "Add employee" }));
    fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "New colleague" } });
    fireEvent.change(screen.getByLabelText(/Contact number/), { target: { value: "09123456788" } });
    fireEvent.click(screen.getByLabelText("Set pay after creating this employee"));
    fireEvent.click(screen.getByRole("button", { name: "Create employee" }));
    await waitFor(() => expect(payRead).toHaveBeenCalledWith(22), { timeout: 5000 });
    expect(await screen.findByLabelText("Daily rate")).toHaveValue(null);
    expect(paySave).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it("opens the common pay settings editor from People without a second legacy rate input", async () => {
    payRead.mockResolvedValue({ success: true, data: { policy: "SIMPLE", mode: "LEGACY", legacy: { dailyRate: "500", commissionRate: "5" }, employee: { id: 1, name: "Mika", revision: 1, agreements: [] } } });
    setup({ ...data, canManagePay: true });
    await open("Pay settings");
    expect(await screen.findByLabelText("Daily rate")).toHaveValue(500);
    expect(screen.getByLabelText("Commission percentage")).toHaveValue(5);
    expect(screen.getByRole("region", { name: "Current pay settings" })).toHaveTextContent("Review pay settings");
    expect(paySave).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not overwrite preserved legacy rates when editing an employee profile", async () => {
    mocks.update.mockResolvedValue({ success: true });
    setup();
    const dialog = await open("Edit employee");
    fireEvent.change(await dialog.findByLabelText("Full name"), { target: { value: "Mika Updated" } });
    expect(dialog.queryByLabelText("Daily rate (PHP)")).not.toBeInTheDocument();
    expect(dialog.queryByLabelText("Commission (%)")).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty("daily_rate");
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty("commission_percentage");
    expect(mocks.update.mock.calls[0][1].employment_start).toBeUndefined();
  });
  it("edits Joined on only through the People profile with its reviewed revision", async () => {
    mocks.fetch.mockResolvedValue({ ...editor, canManagePayroll: true, employees: [{ ...editor.employees[0], employment_start: "2026-01-01", financialRevision: 3 }] });
    mocks.update.mockResolvedValue({ success: true });
    setup();
    const dialog = await open("Edit employee");
    expect(await dialog.findByLabelText("Joined on", { exact: true })).toHaveValue("2026-01-01");
    fireEvent.change(dialog.getByLabelText("Joined on", { exact: true }), { target: { value: "2025-12-01" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(mocks.update.mock.calls[0][1]).toMatchObject({ employment_start: "2025-12-01", expectedFinancialRevision: 3 });
    expect(paySave).not.toHaveBeenCalled();
  });
  it("protects an unsaved employee draft without resetting it when editing continues", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Add employee" }));
    fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "Draft colleague" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard your changes?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Full name")).toHaveValue("Draft colleague");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps an availability draft locally after dismissing it", async () => {
    setup(); const dialog = await open("Specialties & days off");
    fireEvent.click(await dialog.findByRole("checkbox", { name: "Nails" }));
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep draft" }));
    await waitFor(() => expect(document.querySelector('[data-testid="catalog-editor-overlay"]')).toBeNull());
    fireEvent.click(await screen.findByRole("button", { name: "Resume Mika draft" }));
    expect(await screen.findByRole("checkbox", { name: "Nails" })).toBeChecked();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("searches all directory rows before progressive disclosure and clears empty filters", () => {
    setup({ ...data, employees: Array.from({ length: 14 }, (_, i) => ({ ...employee, id: i + 1, name: `Employee ${i + 1}` })) });
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    fireEvent.change(screen.getByRole("textbox", { name: "Search employees" }), { target: { value: "Employee 14" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox", { name: "Search employees" }), { target: { value: "missing" } });
    expect(screen.getByText("No matching employees")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Show more employees" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
  });
  it("shows an honest empty directory", () => { setup({ ...data, employees: [] }); expect(screen.getByText("Your team starts here")).toBeInTheDocument(); expect(screen.queryByRole("listitem")).not.toBeInTheDocument(); });
  it("updates reversible availability immediately, rolls back failure, and retains the draft", async () => {
    let finish!: (value: unknown) => void;
    mocks.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { changed } = setup(); const dialog = await open("Specialties & days off");
    fireEvent.click(await dialog.findByRole("checkbox", { name: "Nails" }));
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    expect(document.querySelector('[data-employee-row="1"]')).toHaveTextContent("Hair · Nails");
    expect(document.querySelector('[data-employee-row="1"]')).toHaveAttribute("aria-busy", "true");
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await act(async () => finish({ success: false, error: "Save failed" }));
    expect(document.querySelector('[data-employee-row="1"]')).not.toHaveTextContent("Nails");
    fireEvent.click(screen.getByRole("button", { name: "Resume Mika draft" }));
    expect(await screen.findByRole("checkbox", { name: "Nails" })).toBeChecked();
    expect(mocks.error).toHaveBeenCalledWith("Save failed", expect.objectContaining({ action: expect.objectContaining({ label: "Review draft" }) })); expect(changed).not.toHaveBeenCalled();
  });
  it("keeps account creation server-confirmed, locks duplicate submissions and preserves a rejected draft", async () => {
    let finish!: (value: unknown) => void; mocks.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    setup(); fireEvent.click(screen.getByRole("button", { name: "Add employee" })); const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(await dialog.findByLabelText("Full name"), { target: { value: "New colleague" } });
    fireEvent.change(dialog.getByLabelText(/Contact number/), { target: { value: "09987654321" } });
    fireEvent.click(dialog.getByRole("button", { name: "Create employee" }));
    expect(document.querySelectorAll("[data-employee-row]")).toHaveLength(1);
    expect(dialog.getByLabelText("Full name")).toBeDisabled();
    fireEvent.click(dialog.getByRole("button", { name: "Saving…" })); expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    await act(async () => finish({ success: false, error: "Contact number already in use" }));
    expect(dialog.getByLabelText("Full name")).toHaveValue("New colleague"); expect(mocks.error).toHaveBeenCalledWith("Contact number already in use");
  });
  it("does not permit saving an unread schedule and retries a failed read", async () => {
    mocks.schedule.mockResolvedValueOnce({ success: false, error: "Unavailable" }).mockResolvedValueOnce({ success: true, data: [] });
    setup(); const dialog = await open("Weekly schedule");
    expect(await dialog.findByRole("alert")).toHaveTextContent("could not be loaded");
    expect(dialog.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Retry" }));
    expect(await dialog.findByRole("button", { name: "Save changes" })).toBeEnabled(); expect(mocks.saveSchedule).not.toHaveBeenCalled();
  });
  it("reports a committed invitation with failed delivery as a warning, not a sent success", async () => {
    mocks.invite.mockResolvedValue({ success: true, warning: "Password rotated but SMS failed." });
    const { changed } = setup(); const dialog = await open("Resend invitation");
    expect(dialog.getByText(/replaces the current password/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Resend invitation" }));
    await waitFor(() => expect(mocks.warning).toHaveBeenCalledWith("Password rotated but SMS failed."));
    expect(mocks.success).not.toHaveBeenCalled(); expect(changed).toHaveBeenCalledTimes(1);
  });
});

