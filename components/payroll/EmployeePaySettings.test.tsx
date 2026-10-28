import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { EmployeePaySettings } from "@/features/payroll/pay-settings";
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), success: vi.fn(), error: vi.fn(), saved: vi.fn() }));
vi.mock("@/features/payroll/actions/pay-settings", () => ({ getEmployeePaySettingsAction: mocks.get }));
vi.mock("@/features/payroll/actions/lifecycle", () => ({ saveCompensationAction: mocks.save }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/components/dashboard/owner-preview/CatalogEditorOverlay", () => ({ CatalogEditorOverlay: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="dialog">{children}</div> : null, CatalogEditorFooter: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
import { EmployeePaySettingsEditor } from "@/components/payroll/EmployeePaySettings";

const fixture = (): EmployeePaySettings => ({ policy: "SIMPLE", mode: "ACTIVE", legacy: { dailyRate: "500", commissionRate: "10" }, employee: { id: 1, name: "Ana", revision: 2, employmentStart: "2026-01-01", agreements: [] } });
function Harness() { const [open, setOpen] = useState(true); return <EmployeePaySettingsEditor employeeId={1} businessSlug="studio" userId="owner" open={open} onOpenChange={setOpen} restoreFocusKey="pay-settings:1" onSaved={mocks.saved} />; }
function mount() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const view = render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>); return { ...view, client }; }
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue({ success: true, data: fixture() }); mocks.save.mockResolvedValue({ success: true, id: "agreement" }); });

it("prefills existing pay details but creates dated terms only after explicit save", async () => {
  mount();
  expect(await screen.findByLabelText("Daily rate")).toHaveValue(500);
  expect(screen.getByLabelText("Commission percentage")).toHaveValue(10);
  expect(screen.getByRole("region", { name: "Current pay settings" })).toHaveTextContent("Review pay settings");
  expect(screen.getByText(/Filled from this person's existing pay details/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Use as starting values" })).not.toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save pay settings" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Save pay settings" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ employeeId: 1, expectedRevision: 2, rate: "500", commissionRate: "10", basis: "DAILY" });
  expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("employmentStart");
  expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("employmentEnd");
});
it("shows only the pay effective date without an employment-date editor", async () => {
  mount();
  expect(await screen.findByLabelText("Apply this pay from", { exact: true })).toHaveAttribute("type", "date");
  expect(screen.queryByLabelText("Employment started")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Joined on")).not.toBeInTheDocument();
  expect(screen.getByText(/This pay applies to work from this date/)).toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("cancels a prefilled sheet without saving or asking to discard untouched defaults", async () => {
  mount();
  await screen.findByLabelText("Daily rate");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("leaves an unconfigured legacy zero rate blank instead of assuming zero pay", async () => {
  const value = fixture(); value.legacy = { dailyRate: "0", commissionRate: "0" };
  mocks.get.mockResolvedValue({ success: true, data: value });
  mount();
  expect(await screen.findByLabelText("Daily rate")).toHaveValue(null);
  expect(screen.getByRole("button", { name: "Save pay settings" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "This person also earns commission" })).not.toBeChecked();
  expect(screen.queryByText(/Filled from this person's existing pay details/)).not.toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("keeps a saved zero rate and commission policy ahead of legacy values", async () => {
  const value = fixture(); value.employee.agreements = [{ id: "current", from: "2020-01-01", to: null, basis: "DAILY", rate: "0", hours: "6", commissionRate: "5", commissionBasis: "DISCOUNTED_PRICE" }];
  mocks.get.mockResolvedValue({ success: true, data: value });
  mount();
  expect(await screen.findByLabelText("Daily rate")).toHaveValue(0);
  expect(screen.getByLabelText("Commission percentage")).toHaveValue(5);
  expect(screen.getByRole("combobox", { name: "Calculate commission from" })).toHaveTextContent("Price after discounts");
  expect(screen.getByRole("button", { name: "Save pay settings" })).toBeDisabled();
  expect(screen.queryByText(/Filled from this person's existing pay details/)).not.toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("dismisses immediately, keeps uncertain drafts, and retries with the same request key", async () => {
  let finish!: (value: unknown) => void;
  mocks.save.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  mount();
  fireEvent.change(await screen.findByLabelText("Daily rate"), { target: { value: "600" } });
  fireEvent.click(screen.getByRole("button", { name: "Save pay settings" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("current rate stays in place");
  expect(mocks.success).not.toHaveBeenCalled();
  await act(async () => { finish({ success: false, code: "UNAVAILABLE", error: "Retry safely" }); });
  act(() => mocks.error.mock.calls[0][1].action.onClick());
  expect(screen.getByLabelText("Daily rate")).toHaveValue(600);
  fireEvent.click(screen.getByRole("button", { name: "Save pay settings" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls[1][0].key).toBe(mocks.save.mock.calls[0][0].key);
  await waitFor(() => expect(mocks.saved).toHaveBeenCalledOnce());
});
it("protects unsaved changes and never persists pay settings in query cache after dismissal", async () => {
  const view = mount();
  fireEvent.change(await screen.findByLabelText("Daily rate"), { target: { value: "700" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Daily rate")).toHaveValue(700);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.unmount();
  await waitFor(() => expect(view.client.getQueryCache().findAll()).toHaveLength(0));
  expect(mocks.save).not.toHaveBeenCalled();
});
it("keeps government monthly requirements but not in simple tracking", async () => {
  const value = fixture(); value.policy = "GOVERNMENT"; value.employee.agreements = [{ id: "old", from: "2020-01-01", to: null, basis: "MONTHLY", rate: "20000", hours: "8", commissionRate: "0", monthlyDivisor: "26" }];
  mocks.get.mockResolvedValue({ success: true, data: value });
  mount();
  expect(await screen.findByLabelText("Monthly salary")).toHaveValue(20000);
  expect(screen.getByLabelText("Verified monthly daily-rate divisor")).toHaveValue(26);
  expect(screen.getByRole("region", { name: "Pay history" })).toHaveTextContent("2020-01-01");
});
it("shows a safe error and no pay fields when authorization fails", async () => {
  mocks.get.mockResolvedValue({ success: false, forbidden: true, error: "Access changed" });
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Access changed");
  expect(screen.queryByLabelText("Daily rate")).not.toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("keeps optional commission editable when entering a fractional rate beginning with zero", async () => {
  const value = fixture(); value.legacy.commissionRate = "0";
  mocks.get.mockResolvedValue({ success: true, data: value });
  mount();
  await screen.findByLabelText("Daily rate");
  fireEvent.click(screen.getByRole("checkbox", { name: "This person also earns commission" }));
  fireEvent.change(screen.getByLabelText("Commission percentage"), { target: { value: "0" } });
  expect(screen.getByLabelText("Commission percentage")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Commission percentage"), { target: { value: "0.5" } });
  expect(screen.getByLabelText("Commission percentage")).toHaveValue(0.5);
});
it("uses scheduled hourly terms instead of falling back to old daily pay", async () => {
  const value = fixture(); value.employee.agreements = [{ id: "scheduled", from: "2099-01-01", to: null, basis: "HOURLY", rate: "125", hours: "8", commissionRate: "0" }];
  mocks.get.mockResolvedValue({ success: true, data: value });
  mount();
  expect(await screen.findByLabelText("Hourly rate")).toHaveValue(125);
  expect(screen.getByRole("checkbox", { name: "This person also earns commission" })).not.toBeChecked();
  expect(screen.queryByText(/Filled from this person's existing pay details/)).not.toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});
