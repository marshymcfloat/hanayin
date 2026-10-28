import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerVouchersStudy } from "@/components/dashboard/design-study/OwnerVouchersStudy";
import type { OwnerVouchersPreviewReadModel } from "@/features/catalog/types/owner-catalog-preview";

const actions = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), active: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: actions.success, error: actions.error } }));
vi.mock("@/features/catalog/actions/vouchers", () => ({ createVoucherAction: actions.create, updateVoucherAction: actions.update, deleteVoucherAction: actions.remove, setVoucherActiveAction: actions.active }));
vi.mock("@/components/bookings/design-study/SelectionMotion", () => ({ useSelectionMotion: () => () => {} }));

const data: OwnerVouchersPreviewReadModel = {
  section: "vouchers", generatedAt: "2026-10-09T00:00:00Z", business: { slug: "studio", name: "Studio", initials: "ST" },
  metrics: { activeVouchers: 11, redemptions: 1, archivedVouchers: 1 },
  vouchers: Array.from({ length: 14 }, (_, index) => ({ id: index + 1, code: `CODE${String(index + 1).padStart(2, "0")}`, type: index === 0 ? "FLAT" : "PERCENTAGE", value: index === 0 ? 125.75 : 20, minimumAmount: 500.25 + index, expiresAt: "2026-12-31T15:59:59.000Z", status: index === 1 ? "archived" : index === 2 ? "used" : index === 3 ? "expired" : "active", redemptions: index === 2 ? 1 : 0 })),
};
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

function createForm() {
  fireEvent.click(screen.getByRole("button", { name: "Create voucher" }));
  const dialog = screen.getByRole("dialog", { name: "Create a voucher" });
  fireEvent.change(within(dialog).getByLabelText("Voucher code"), { target: { value: "NEW20" } });
  fireEvent.change(within(dialog).getByLabelText("Discount value"), { target: { value: "20.5" } });
  fireEvent.change(within(dialog).getByLabelText("Minimum spend"), { target: { value: "500.25" } });
  fireEvent.change(within(dialog).getByLabelText("Expiry date"), { target: { value: "2026-12-31" } });
  return dialog;
}
async function action(code: string, label: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: `Actions for ${code}` }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
}
function deferred() {
  let resolve!: (result: unknown) => void;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}


async function recoverDraft() {
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const options = actions.error.mock.calls.at(-1)?.[1];
  expect(options.action.label).toBe("Review draft");
  act(() => options.action.onClick());
  return screen.getByRole("dialog");
}

describe("redesign vouchers", () => {
  it("renders backend values, single-use terms, and searches all rows before progressive disclosure", () => {
    render(<OwnerVouchersStudy data={data} />);
    expect(screen.getByText("₱125.75 off")).toBeInTheDocument();
    expect(screen.getByText("Minimum ₱500.25")).toBeInTheDocument();
    expect(screen.getByText(/Each voucher can be redeemed once/)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Show more vouchers" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
    fireEvent.change(screen.getByRole("textbox", { name: "Search vouchers" }), { target: { value: "code14" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("CODE14")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search vouchers" }), { target: { value: "missing" } });
    expect(screen.getByText("No matching vouchers")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });

  it("uses accessible styled status and sort menus", async () => {
    render(<OwnerVouchersStudy data={data} />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Filter by status" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Archived" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("CODE02")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Filter by status" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "All statuses" }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Sort vouchers" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Lowest minimum spend" }));
    expect(within(screen.getAllByRole("listitem")[0]).getByText("CODE01")).toBeInTheDocument();
  });

  it("inserts a pending row, closes immediately and prevents duplicate saves, and reconciles only after success", async () => {
    const request = deferred();
    actions.create.mockReturnValue(request.promise);
    const onChanged = vi.fn();
    render(<OwnerVouchersStudy data={{ ...data, vouchers: [] }} onChanged={onChanged} />);
    const dialog = createForm();
    fireEvent.submit(dialog.querySelector("form")!);
    fireEvent.submit(dialog.querySelector("form")!);
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.create).toHaveBeenCalledWith({ code: "NEW20", type: "PERCENTAGE", value: 20.5, minimum_amount: 500.25, expires_at: new Date("2026-12-31T15:59:59Z") });
    expect(document.querySelector('[data-voucher-row="-1"]')).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector('[data-voucher-row="-1"]')).not.toHaveTextContent("active");
    expect(within(dialog).getByLabelText("Voucher code")).toBeDisabled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onChanged).not.toHaveBeenCalled();
    expect(actions.success).not.toHaveBeenCalled();
    const saved = { ...data.vouchers[0], id: 90, code: "NEW20", type: "PERCENTAGE" as const, value: 20.5 };
    await act(async () => request.resolve({ success: true, data: saved }));
    await waitFor(() => expect(document.querySelector('[data-voucher-row="90"]')).toBeInTheDocument());
    expect(document.querySelector('[data-voucher-row="-1"]')).not.toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledWith({ type: "upsert", item: saved });
    expect(actions.success).toHaveBeenCalledWith("NEW20 was created.", expect.objectContaining({ action: expect.objectContaining({ label: "View item" }) }));
  });

  it("rolls back a failed create and retains all values for retry without a result banner", async () => {
    actions.create.mockResolvedValue({ success: false, error: "Voucher code already exists" });
    render(<OwnerVouchersStudy data={data} />);
    let dialog = createForm();
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(actions.error).toHaveBeenCalledWith("Voucher code already exists", expect.objectContaining({ action: expect.objectContaining({ label: "Review draft" }) })));
    dialog = await recoverDraft();
    expect(within(dialog).getByLabelText("Voucher code")).toHaveValue("NEW20");
    expect(within(dialog).getByLabelText("Discount value")).toHaveValue(20.5);
    expect(within(dialog).getByLabelText("Minimum spend")).toHaveValue(500.25);
    expect(within(dialog).getByLabelText("Expiry date")).toHaveValue("2026-12-31");
    expect(document.querySelector('[data-voucher-row="-1"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Create voucher" })).toBeEnabled();
  });

  it("preserves fixed discounts and Philippine expiry when editing and rolls back failure", async () => {
    actions.update.mockResolvedValue({ success: false, error: "Not permitted" });
    render(<OwnerVouchersStudy data={data} />);
    await action("CODE01", "Edit");
    let dialog = screen.getByRole("dialog", { name: "Edit voucher" });
    expect(within(dialog).getByRole("combobox", { name: "Discount type" })).toHaveTextContent("Fixed amount");
    expect(within(dialog).getByLabelText("Expiry date")).toHaveValue("2026-12-31");
    fireEvent.change(within(dialog).getByLabelText("Discount value"), { target: { value: "99.75" } });
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(actions.error).toHaveBeenCalledWith("Not permitted", expect.objectContaining({ action: expect.objectContaining({ label: "Review draft" }) })));
    dialog = await recoverDraft();
    expect(actions.update).toHaveBeenCalledWith(1, expect.objectContaining({ type: "FLAT", value: 99.75, minimum_amount: 500.25, expires_at: new Date("2026-12-31T15:59:59Z") }));
    expect(document.querySelector('[data-voucher-row="1"]')).toHaveTextContent("₱125.75 off");
    expect(within(dialog).getByLabelText("Discount value")).toHaveValue(99.75);
  });

  it("rejects invalid percentages before dispatch and allows a valid fixed amount through the styled selector", async () => {
    actions.create.mockResolvedValue({ success: false, error: "Retry later" });
    render(<OwnerVouchersStudy data={data} />);
    const dialog = createForm();
    fireEvent.change(within(dialog).getByLabelText("Discount value"), { target: { value: "101" } });
    fireEvent.submit(dialog.querySelector("form")!);
    expect(actions.create).not.toHaveBeenCalled();
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: "Discount type" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Fixed amount" }));
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({ type: "FLAT", value: 101 })));
  });

  it("archives optimistically, disables conflicting actions, and rolls back a rejected write", async () => {
    const request = deferred();
    actions.active.mockReturnValue(request.promise);
    const onChanged = vi.fn();
    render(<OwnerVouchersStudy data={data} onChanged={onChanged} />);
    await action("CODE01", "Archive");
    expect(actions.active).toHaveBeenCalledWith(1, false);
    expect(screen.getByRole("button", { name: "Actions for CODE01" })).toBeDisabled();
    expect(document.querySelector('[data-voucher-row="1"]')).toHaveTextContent("Saving…");
    expect(actions.success).not.toHaveBeenCalled();
    await act(async () => request.resolve({ success: false, error: "Offline" }));
    expect(document.querySelector('[data-voucher-row="1"]')).toHaveTextContent("active");
    expect(onChanged).not.toHaveBeenCalled();
    expect(actions.error).toHaveBeenCalledWith("Offline");
  });

  it("uses server eligibility after restoring rather than resetting usage or expiry", async () => {
    const restored = { ...data.vouchers[1], status: "expired" as const };
    actions.active.mockResolvedValue({ success: true, data: restored });
    render(<OwnerVouchersStudy data={data} />);
    await action("CODE02", "Restore");
    await waitFor(() => expect(document.querySelector('[data-voucher-row="2"]')).toHaveTextContent("expired"));
    expect(actions.active).toHaveBeenCalledWith(2, true);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for CODE03" }), { key: "ArrowDown" });
    await screen.findByRole("menuitem", { name: "Edit" });
    expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("supports overlapping deletions and keeps a newer confirmation when an earlier deletion fails", async () => {
    const first = deferred();
    const second = deferred();
    actions.remove.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<OwnerVouchersStudy data={data} />);
    await action("CODE01", "Delete");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(document.querySelector('[data-voucher-row="1"]')).not.toBeInTheDocument();
    await action("CODE02", "Delete");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(actions.remove).toHaveBeenCalledTimes(2);
    await action("CODE03", "Delete");
    await act(async () => first.resolve({ success: false, error: "Cannot delete" }));
    expect(screen.getByRole("dialog", { name: "Delete CODE03?" })).toBeInTheDocument();
    expect(document.querySelector('[data-voucher-row="1"]')).toBeInTheDocument();
    await act(async () => second.resolve({ success: true, data: { id: 2 } }));
    expect(document.querySelector('[data-voucher-row="2"]')).not.toBeInTheDocument();
    expect(actions.success).toHaveBeenCalledWith("CODE02 was deleted.");
  });

  it("reports clipboard failures through a toast", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<OwnerVouchersStudy data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy CODE01" }));
    await waitFor(() => expect(actions.error).toHaveBeenCalledWith("Could not copy the code. Please try again."));
    expect(actions.success).not.toHaveBeenCalled();
  });
});
