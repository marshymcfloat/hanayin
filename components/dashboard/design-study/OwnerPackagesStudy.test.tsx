import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerPackagesStudy } from "@/components/dashboard/design-study/OwnerPackagesStudy";
import type { OwnerPackagesPreviewReadModel } from "@/features/catalog/types/owner-catalog-preview";

const actions = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: actions.success, error: actions.error } }));
vi.mock("@/features/catalog/actions/packages", () => ({ createPackageAction: actions.create, updatePackageAction: actions.update, deletePackageAction: actions.remove }));
vi.mock("@/components/bookings/design-study/SelectionMotion", () => ({ useSelectionMotion: () => () => {} }));

const service = { id: 11, name: "Hair treatment", category: "Hair", description: null, price: 1200.5, estimatedCost: 200, durationMinutes: 60, monthlyBookings: 3 };
const data: OwnerPackagesPreviewReadModel = {
  section: "packages", generatedAt: "2026-10-09T00:00:00Z", business: { slug: "studio", name: "Studio", initials: "ST" },
  categories: ["Hair", "Wellness"], availableServices: [service, { ...service, id: 12, name: "Massage" }],
  metrics: { totalPackages: 14, monthlySales: 8, monthlyRevenue: 8000, averageSavingsPercent: 17 },
  packages: Array.from({ length: 14 }, (_, i) => ({ id: i + 1, name: `Package ${String(i + 1).padStart(2, "0")}`, description: "Backend package", category: i % 2 ? "Wellness" : "Hair", price: 1000.25 + i, durationMinutes: 60, originalPrice: 1200.5, monthlySales: i, services: [{ ...service, name: i === 13 ? "Special treatment" : service.name, packageItemPrice: 850.5 }] })),
};

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());
function createForm() {
  fireEvent.click(screen.getByRole("button", { name: "Add package" }));
  const dialog = screen.getByRole("dialog", { name: "Add a package" });
  fireEvent.change(within(dialog).getByLabelText("Package name"), { target: { value: "New bundle" } });
  fireEvent.change(within(dialog).getByLabelText("Package price"), { target: { value: "950.75" } });
  return dialog;
}
async function editForm() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Package 01" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
  return screen.getByRole("dialog", { name: "Edit package" });
}


async function recoverDraft() {
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const options = actions.error.mock.calls.at(-1)?.[1];
  expect(options.action.label).toBe("Review draft");
  act(() => options.action.onClick());
  return screen.getByRole("dialog");
}

describe("redesign packages", () => {
  it("renders backend prices and metrics, progressively reveals rows and searches included services across the full catalog", () => {
    render(<OwnerPackagesStudy data={data} />);
    expect(screen.getByText("₱1,000.25")).toBeInTheDocument();
    expect(screen.getByText("₱8,000")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Show more packages" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
    fireEvent.change(screen.getByRole("textbox", { name: "Search packages" }), { target: { value: "Special treatment" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Package 14")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search packages" }), { target: { value: "missing" } });
    expect(screen.getByText("No matching packages")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });

  it("filters and sorts with styled menus", async () => {
    render(<OwnerPackagesStudy data={data} />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Filter by category" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Wellness" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Sort packages" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Price: high to low" }));
    expect(within(screen.getAllByRole("listitem")[0]).getByText("Package 14")).toBeInTheDocument();
  });

  it("inserts a pending package with custom item pricing, prevents duplicates, and reconciles only after server success", async () => {
    let finish!: (value: unknown) => void;
    actions.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const onChanged = vi.fn();
    render(<OwnerPackagesStudy data={{ ...data, packages: [] }} onChanged={onChanged} />);
    const dialog = createForm();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Include Hair treatment" }));
    fireEvent.change(within(dialog).getByLabelText("Package item price for Hair treatment"), { target: { value: "500.25" } });
    fireEvent.submit(dialog.querySelector("form")!);
    fireEvent.submit(dialog.querySelector("form")!);
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({ businessSlug: "studio", price: 950.75, items: [{ serviceId: 11, customPrice: 500.25 }] }));
    expect(document.querySelector('[data-package-row="-1"]')).toHaveTextContent("New bundle");
    expect(document.querySelector('[data-package-row="-1"]')).toHaveAttribute("aria-busy", "true");
    expect(within(dialog).getByLabelText("Package name")).toBeDisabled();
    expect(actions.success).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const saved = { ...data.packages[0], id: 99, name: "New bundle", price: 950.75 };
    await act(async () => finish({ success: true, data: saved }));
    expect(document.querySelector('[data-package-row="-1"]')).toBeNull();
    expect(document.querySelector('[data-package-row="99"]')).toHaveTextContent("New bundle");
    expect(onChanged).toHaveBeenCalledWith({ type: "upsert", item: saved });
    expect(actions.success).toHaveBeenCalledWith("New bundle was created.", expect.objectContaining({ action: expect.objectContaining({ label: "View item" }) }));
    expect(screen.queryByText("New bundle was created.")).not.toBeInTheDocument();
  });

  it("preserves selected services and draft values after rejection, and rolls back provisional rows", async () => {
    actions.create.mockResolvedValue({ success: false, error: "Unable to save." });
    render(<OwnerPackagesStudy data={{ ...data, packages: [] }} />);
    let dialog = createForm();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Include Hair treatment" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create package" }));
    await waitFor(() => expect(actions.error).toHaveBeenCalledWith("Unable to save.", expect.objectContaining({ action: expect.objectContaining({ label: "Review draft" }) })));
    dialog = await recoverDraft();
    expect(document.querySelector('[data-package-row="-1"]')).toBeNull();
    expect(within(dialog).getByLabelText("Package name")).toHaveValue("New bundle");
    expect(within(dialog).getByRole("checkbox", { name: "Include Hair treatment" })).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Create package" })).toBeEnabled();
    expect(screen.queryByText("Unable to save.")).not.toBeInTheDocument();
  });

  it("retains existing item prices while filtering selection and rejects an empty service selection", async () => {
    render(<OwnerPackagesStudy data={{ ...data, packages: [data.packages[0]] }} />);
    const dialog = await editForm();
    expect(within(dialog).getByLabelText("Package item price for Hair treatment")).toHaveValue(850.5);
    fireEvent.change(within(dialog).getByLabelText("Find services"), { target: { value: "Massage" } });
    expect(within(dialog).queryByRole("checkbox", { name: "Include Hair treatment" })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Find services"), { target: { value: "" } });
    expect(within(dialog).getByRole("checkbox", { name: "Include Hair treatment" })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Include Hair treatment" }));
    fireEvent.submit(dialog.querySelector("form")!);
    expect(actions.update).not.toHaveBeenCalled();
    expect(actions.error).toHaveBeenCalledWith("Add at least one service or choice, up to 100 inclusions.");
  });

  it("optimistically edits, rolls back a thrown request, and keeps the draft available", async () => {
    let fail!: (reason: Error) => void;
    actions.update.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    render(<OwnerPackagesStudy data={{ ...data, packages: [data.packages[0]] }} />);
    let dialog = await editForm();
    fireEvent.change(within(dialog).getByLabelText("Package name"), { target: { value: "Updated bundle" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(document.querySelector('[data-package-row="1"]')).toHaveTextContent("Updated bundle");
    await act(async () => fail(new Error("offline")));
    dialog = await recoverDraft();
    expect(document.querySelector('[data-package-row="1"]')).toHaveTextContent("Package 01");
    expect(within(dialog).getByLabelText("Package name")).toHaveValue("Updated bundle");
    expect(actions.error).toHaveBeenCalledWith("The change could not be saved. Please try again.", expect.objectContaining({ action: expect.objectContaining({ label: "Review draft" }) }));
  });

  it("restores rejected deletions and commits a successful retry", async () => {
    let finish!: (value: unknown) => void;
    actions.remove.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ success: true });
    const onChanged = vi.fn();
    render(<OwnerPackagesStudy data={{ ...data, packages: [data.packages[0]] }} onChanged={onChanged} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Package 01" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Package 01?" })).getByRole("button", { name: "Delete" }));
    expect(document.querySelector('[data-package-row="1"]')).toBeNull();
    expect(actions.success).not.toHaveBeenCalled();
    await act(async () => finish({ success: false, error: "Package is in use." }));
    expect(document.querySelector('[data-package-row="1"]')).toBeInTheDocument();
    expect(actions.error).toHaveBeenCalledWith("Package is in use.");
    expect(onChanged).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Package 01?" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ type: "delete", id: 1 }));
    expect(actions.success).toHaveBeenCalledWith("Package 01 was deleted.");
  });

  it("explains the no-services prerequisite and disables creation", () => {
    render(<OwnerPackagesStudy data={{ ...data, packages: [], availableServices: [] }} />);
    const dialog = createForm();
    expect(within(dialog).getByText("Add services to your catalog before creating a package.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Create package" })).toBeDisabled();
  });

  it("allows a different package deletion while one is pending and does not replace its confirmation on failure", async () => {
    let finish!: (value: unknown) => void;
    actions.remove.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ success: true });
    render(<OwnerPackagesStudy data={{ ...data, packages: data.packages.slice(0, 2) }} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Package 01" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Package 01?" })).getByRole("button", { name: "Delete" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Package 02" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await act(async () => finish({ success: false, error: "Package is in use." }));
    expect(screen.getByRole("dialog", { name: "Delete Package 02?" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Package 02?" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(actions.success).toHaveBeenCalledWith("Package 02 was deleted."));
    expect(document.querySelector('[data-package-row="1"]')).toBeInTheDocument();
    expect(document.querySelector('[data-package-row="2"]')).toBeNull();
  });

  it("submits independent deletions without waiting for the first response", async () => {
    const responses: Array<(value: unknown) => void> = [];
    actions.remove.mockImplementation(() => new Promise(resolve => responses.push(resolve)));
    render(<OwnerPackagesStudy data={{ ...data, packages: data.packages.slice(0, 2) }} />);
    for (const name of ["Package 01", "Package 02"]) {
      fireEvent.keyDown(screen.getByRole("button", { name: `Actions for ${name}` }), { key: "ArrowDown" });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      fireEvent.click(within(screen.getByRole("dialog", { name: `Delete ${name}?` })).getByRole("button", { name: "Delete" }));
    }
    expect(actions.remove).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll("[data-package-row]")).toHaveLength(0);
    await act(async () => { responses[1]({ success: true }); responses[0]({ success: false, error: "In use." }); });
    expect(document.querySelector('[data-package-row="1"]')).toBeInTheDocument();
    expect(document.querySelector('[data-package-row="2"]')).toBeNull();
  });
});
