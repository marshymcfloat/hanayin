import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerAttendanceStudy } from "@/components/dashboard/design-study/OwnerAttendanceStudy";
import { OwnerAttendancePreviewRoute } from "@/components/dashboard/owner-preview/OwnerAttendancePreviewQuery";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";
import type { OwnerAttendancePreviewData } from "@/features/workforce/types/owner-attendance-preview";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), status: vi.fn(), impact: vi.fn(), history: vi.fn(), leave: vi.fn(), revoke: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/features/workforce/actions/attendance-admin", () => ({ getEmployeeAttendanceHistory: mocks.history, previewAttendanceImpactAction: mocks.impact, updateAttendanceStatus: mocks.status }));
vi.mock("@/features/workforce/actions/leave-request", () => ({ updateLeaveRequestStatus: mocks.leave }));
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewQueryProvider", () => ({ useOwnerPreviewContext: () => ({ businessId: "business-a", businessSlug: "studio-a", userId: "owner-a" }), useOwnerPreviewFetch: () => mocks.fetch, useOwnerPreviewRevoke: () => mocks.revoke }));

const identity = { businessId: "business-a", businessSlug: "studio-a", userId: "owner-a" };
const data: OwnerAttendancePreviewData = {
  businessName: "Studio A", date: "2026-09-28", pendingLeaveCount: 1,
  employees: [{ id: 1, name: "Ana", role: "STAFF", status: "UNRECORDED", timeIn: null, timeOut: null }, { id: 2, name: "Bea", role: "MANAGER", status: "PRESENT", timeIn: "2026-09-27T17:30:00.000Z", timeOut: null }],
  leaveRequests: [{ id: 3, employeeName: "Bea", startDate: "2026-10-01T16:00:00.000Z", endDate: "2026-10-02T16:00:00.000Z", reason: "Family visit", submittedAt: "2026-09-27T00:00:00.000Z", status: "PENDING" }],
};
function setup(value = data, route = false) {
  const changed = vi.fn(); const date = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = render(<QueryClientProvider client={client}>{route ? <OwnerAttendancePreviewRoute redesign /> : <OwnerAttendanceStudy data={value} selectedDate={value.date} onDateChange={date} refreshControl={null} onLeaveChanged={changed} />}</QueryClientProvider>);
  return { ...view, changed, date, client };
}
async function open(label: string, name = "Ana") {
  fireEvent.keyDown(screen.getByRole("button", { name: `Attendance for ${name}` }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
  return within(screen.getByRole("dialog"));
}
async function select(label: string, option: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}
function deferred() { let finish!: (value: unknown) => void; const promise = new Promise(resolve => { finish = resolve; }); return { promise, finish }; }
beforeEach(() => {
  vi.clearAllMocks(); Element.prototype.scrollIntoView = vi.fn();
  mocks.impact.mockResolvedValue({ success: true, bookings: [] });
  mocks.fetch.mockResolvedValue(data);
});

describe("redesign Attendance", () => {
  it("protects unsaved correction choices when cancelling", async () => {
    setup(); await open("Correct status");
    await select("Attendance status", "Late");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard your changes?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("combobox", { name: "Attendance status" })).toHaveTextContent("Late");
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("shows recorded Philippine times, preserves unrecorded statuses, and filters the full directory", async () => {
    const { date } = setup({ ...data, employees: [...data.employees, ...Array.from({ length: 13 }, (_, i) => ({ ...data.employees[0], id: i + 10, name: `Employee ${i + 10}` }))] });
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getByText("1:30 AM")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search attendance" }), { target: { value: "Employee 22" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await select("Filter attendance status", "Absent");
    expect(screen.getByText("No matching attendance")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous attendance day" }));
    expect(date).toHaveBeenCalledWith("2026-09-27");
    fireEvent.click(screen.getByRole("button", { name: "Next attendance day" }));
    expect(date).toHaveBeenCalledWith("2026-09-29");
  });
  it("has independent employee and leave empty states", () => {
    setup({ ...data, employees: [], leaveRequests: [], pendingLeaveCount: 0 });
    expect(screen.getByText("No employees yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Leave requests" }));
    expect(screen.getByText("No recent leave requests")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave requests" })).toHaveAttribute("aria-pressed", "true");
  });
  it("does not invent a status or optimistically apply a correction; failed saves preserve the draft", async () => {
    const pending = deferred(); mocks.status.mockReturnValue(pending.promise);
    const { changed } = setup(); const dialog = await open("Correct status");
    expect(dialog.getByLabelText("Attendance details")).toHaveAttribute("tabindex", "0");
    expect(dialog.getByLabelText("Attendance details")).toHaveAttribute("data-slot", "scroll-area-viewport");
    expect(dialog.getByRole("button", { name: "Save status" })).toBeDisabled();
    await select("Attendance status", "Present");
    fireEvent.click(dialog.getByRole("button", { name: "Save status" }));
    expect(mocks.status).toHaveBeenCalledWith(1, new Date("2026-09-28T04:00:00.000Z"), "PRESENT");
    expect(changed).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Saving…" }));
    fireEvent.click(dialog.getByRole("button", { name: "Close editor" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.status).toHaveBeenCalledTimes(1);
    await act(async () => pending.finish({ success: false, error: "Save failed" }));
    expect(dialog.getByRole("combobox", { name: "Attendance status" })).toHaveTextContent("Present");
    expect(dialog.getByText(/Current status: Not recorded/)).toBeInTheDocument();
    expect(mocks.error).toHaveBeenCalledWith("Save failed"); expect(changed).not.toHaveBeenCalled();
  });
  it("blocks corrections when impact reads fail and requires review of affected bookings", async () => {
    mocks.impact.mockResolvedValueOnce({ success: false, error: "Unavailable" });
    mocks.status.mockResolvedValue({ success: true });
    const { changed } = setup(); const dialog = await open("Correct status");
    await select("Attendance status", "Absent");
    expect(await dialog.findByRole("alert")).toHaveTextContent("Nothing has been saved");
    expect(dialog.getByRole("button", { name: "Save status" })).toBeDisabled(); expect(mocks.status).not.toHaveBeenCalled();
    mocks.impact.mockResolvedValue({ success: true, bookings: [{ bookingId: 8, customerName: "Customer A", scheduledAt: "2026-09-28T01:00:00Z", serviceNames: ["Haircut"] }] });
    fireEvent.click(dialog.getByRole("button", { name: "Retry booking check" }));
    const review = await dialog.findByRole("checkbox");
    expect(dialog.getByRole("button", { name: "Save status" })).toBeDisabled();
    fireEvent.click(review); fireEvent.click(dialog.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(changed).toHaveBeenCalledWith({ type: "status", employeeId: 1, date: data.date, status: "ABSENT" }));
  });
  it("keeps paid-leave decisions server-confirmed, retains failed drafts, and revokes rejected sessions", async () => {
    const pending = deferred(); mocks.leave.mockReturnValue(pending.promise);
    const { changed } = setup(); fireEvent.click(screen.getByRole("button", { name: "Leave requests" }));
    fireEvent.click(screen.getByRole("button", { name: "Review approval" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Oct 2, 2026 – Oct 3, 2026")).toBeInTheDocument();
    fireEvent.change(dialog.getByRole("textbox", { name: "Note to employee (optional)" }), { target: { value: "Reviewed" } });
    fireEvent.click(dialog.getByRole("checkbox"));
    fireEvent.click(dialog.getByRole("button", { name: "Confirm approval" }));
    expect(mocks.leave).toHaveBeenCalledWith(3, "APPROVED", "Reviewed", true);
    expect(changed).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
    await act(async () => pending.finish({ success: false, error: "Forbidden" }));
    expect(dialog.getByRole("textbox")).toHaveValue("Reviewed"); expect(dialog.getByRole("checkbox")).toBeChecked();
    expect(mocks.revoke).toHaveBeenCalledTimes(1); expect(changed).not.toHaveBeenCalled();
  });
  it("shows retryable history failures and real empty history", async () => {
    mocks.history.mockRejectedValueOnce(new Error("Network failed"));
    setup(); const dialog = await open("Attendance history");
    expect(await dialog.findByRole("alert")).toHaveTextContent("could not be refreshed");
    mocks.history.mockResolvedValue({ success: true, data: [] });
    fireEvent.click(dialog.getByRole("button", { name: "Retry history" }));
    expect(await dialog.findByText("No attendance recorded yet.")).toBeInTheDocument();
    expect(mocks.history).toHaveBeenCalledWith(1);
  });
  it("returns keyboard focus after closing the correction sheet", async () => {
    setup(); const dialog = await open("Correct status");
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Attendance for Ana" })).toHaveFocus());
  });
  it("renders cold loading and a retryable query error", async () => {
    mocks.fetch.mockRejectedValue(new Error("Unavailable"));
    setup(data, true);
    expect(screen.getByLabelText("Loading attendance")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("Attendance unavailable")).toBeInTheDocument();
    mocks.fetch.mockResolvedValue(data); fireEvent.click(screen.getByRole("button", { name: "Refresh attendance" }));
    expect(await screen.findByText("Ana")).toBeInTheDocument();
  });
  it("identifies previous dates while loading and keeps cached rows on background failure", async () => {
    setup(data, true); await screen.findByText("Ana");
    const pending = deferred(); mocks.fetch.mockReturnValue(pending.promise);
    fireEvent.change(screen.getByLabelText("Attendance date"), { target: { value: "2026-10-01" } });
    expect(await screen.findByText(/Showing Sep 28, 2026 until it is ready/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attendance for Ana" })).toBeDisabled();
    await act(async () => pending.finish({ ...data, date: "2026-10-01" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh attendance" })).toBeEnabled());
    mocks.fetch.mockRejectedValue(new Error("Refresh failed"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh attendance" }));
    expect(await screen.findByText(/Refresh failed; showing saved data/)).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });
  it("updates confirmed leave state across cached dates and invalidates dependent pages", async () => {
    mocks.leave.mockResolvedValue({ success: true });
    const { client } = setup(data, true); await screen.findByText("Ana");
    const secondDay = ownerPreviewKeys.section(identity, "attendance", "page", { date: "2026-09-27" });
    client.setQueryData(secondDay, { ...data, date: "2026-09-27" });
    const payrollKey = ownerPreviewKeys.section(identity, "payroll", "page"); client.setQueryData(payrollKey, { test: true });
    mocks.fetch.mockRejectedValue(new Error("Refresh failed"));
    fireEvent.click(screen.getByRole("button", { name: "Leave requests" }));
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm decline" }));
    await waitFor(() => expect(client.getQueryData<OwnerAttendancePreviewData>(secondDay)?.leaveRequests[0].status).toBe("REJECTED"));
    expect(client.getQueryData<OwnerAttendancePreviewData>(secondDay)?.pendingLeaveCount).toBe(0);
    expect(client.getQueryState(payrollKey)?.isInvalidated).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Recent leave requests" })).toHaveFocus());
  });
});
