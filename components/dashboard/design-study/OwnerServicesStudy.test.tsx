import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerServicesPreviewReadModel } from "@/features/catalog/types/owner-catalog-preview";
import { OwnerServicesStudy } from "@/components/dashboard/design-study/OwnerServicesStudy";

const actions = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: actions.success, error: actions.error } }));
vi.mock("@/features/catalog/actions/services", () => ({ createServiceAction: actions.create, updateServiceAction: actions.update, deleteServiceAction: actions.remove }));
vi.mock("@/components/bookings/design-study/SelectionMotion", () => ({ useSelectionMotion: () => () => {} }));

const data: OwnerServicesPreviewReadModel = {
  section: "services", generatedAt: "2026-10-09T00:00:00Z",
  business: { slug: "beautyfeel", name: "BeautyFeel", initials: "BF" }, categories: ["Hair", "Nails"],
  metrics: { totalServices: 14, monthlyBookings: 7, averageMarginPercent: 75, averageDurationMinutes: 60 },
  services: Array.from({ length: 14 }, (_, i) => ({ id: i + 1, name: `Treatment ${String(i + 1).padStart(2, "0")}`, category: i % 2 ? "Hair" : "Nails", description: "Backend treatment", price: 1000.25 + i, estimatedCost: 250, durationMinutes: 60, monthlyBookings: i })),
};

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});


async function recoverDraft() {
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const options = actions.error.mock.calls.at(-1)?.[1];
  expect(options.action.label).toBe("Review draft");
  act(() => options.action.onClick());
  return screen.getByRole("dialog");
}

describe("redesign services catalog", () => {
  it("offers only cancel and create, then dismisses without opening another form", async () => {
    actions.create.mockReturnValue(new Promise(() => {}));
    render(<OwnerServicesStudy data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    const first = screen.getByRole("dialog");
    fireEvent.change(within(first).getByLabelText("Service name"), { target: { value: "First draft" } });
    fireEvent.change(within(first).getByLabelText("Price"), { target: { value: "200" } });
    expect(within(first).queryByRole("button", { name: "Save & add another" })).not.toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(first.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    fireEvent.click(within(first).getByRole("button", { name: "Create service" }));
    expect(actions.create).toHaveBeenCalledTimes(1);
    await screen.findByRole("button", { name: "Add service" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps a new form open when an earlier save completes", async () => {
    let finish!: (value: unknown) => void;
    actions.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<OwnerServicesStudy data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    const first = screen.getByRole("dialog");
    fireEvent.change(within(first).getByLabelText("Service name"), { target: { value: "First draft" } });
    fireEvent.change(within(first).getByLabelText("Price"), { target: { value: "200" } });
    fireEvent.click(within(first).getByRole("button", { name: "Create service" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(await screen.findByRole("button", { name: "Add service" }));
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Second draft" } });
    await act(async () => finish({ success: true, data: { ...data.services[0], id: 99, name: "First draft" } }));
    expect(screen.getByLabelText("Service name")).toHaveValue("Second draft");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("duplicates into a create form and protects unsaved changes", async () => {
    render(<OwnerServicesStudy data={data} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Treatment 01" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    expect(screen.getByRole("dialog", { name: "Add a service" })).toBeInTheDocument();
    expect(screen.getByLabelText("Service name")).toHaveValue("Treatment 01 (copy)");
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "My draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Service name")).toHaveValue("My draft");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep draft" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(await screen.findByRole("button", { name: /Resume service draft/ }));
    expect(screen.getByLabelText("Service name")).toHaveValue("My draft");
    expect(actions.create).not.toHaveBeenCalled();
    expect(actions.update).not.toHaveBeenCalled();
  });

  it("adds an optimistic row immediately, then reconciles its ID and reports success only by toast", async () => {
    let finish!: (value: unknown) => void;
    actions.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<OwnerServicesStudy data={{ ...data, services: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    const dialog = screen.getByRole("dialog", { name: "Add a service" });
    fireEvent.change(within(dialog).getByLabelText("Service name"), { target: { value: "New treatment" } });
    fireEvent.change(within(dialog).getByLabelText("Price"), { target: { value: "450" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create service" }));
    expect(document.querySelector('[data-service-row="-1"]')).toHaveTextContent("New treatment");
    expect(document.querySelector('[data-service-row="-1"]')).toHaveAttribute("aria-busy", "true");
    expect(actions.success).not.toHaveBeenCalled();
    await act(async () => finish({ success: true, data: { ...data.services[0], id: 99, name: "New treatment", price: 450 } }));
    expect(document.querySelector('[data-service-row="99"]')).toHaveTextContent("New treatment");
    expect(document.querySelector('[data-service-row="-1"]')).toBeNull();
    expect(actions.success).toHaveBeenCalledWith("New treatment was created.", expect.objectContaining({ action: expect.objectContaining({ label: "View item" }) }));
    expect(screen.queryByText("New treatment was created.")).not.toBeInTheDocument();
  });

  it("applies edits before the response and restores the saved row on failure", async () => {
    let finish!: (value: unknown) => void;
    actions.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<OwnerServicesStudy data={{ ...data, services: [data.services[0]] }} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Treatment 01" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    let dialog = screen.getByRole("dialog", { name: "Edit service" });
    fireEvent.change(within(dialog).getByLabelText("Service name"), { target: { value: "Updated treatment" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(document.querySelector('[data-service-row="1"]')).toHaveTextContent("Updated treatment");
    expect(document.querySelector('[data-service-row="1"]')).toHaveAttribute("aria-busy", "true");
    await act(async () => finish({ success: false, error: "Save failed." }));
    dialog = await recoverDraft();
    expect(document.querySelector('[data-service-row="1"]')).toHaveTextContent("Treatment 01");
    expect(within(dialog).getByLabelText("Service name")).toHaveValue("Updated treatment");
    expect(actions.error).toHaveBeenCalledWith("Save failed.", expect.objectContaining({ action: expect.objectContaining({ label: "Review draft" }) }));
  });

  it("removes a confirmed deletion optimistically and restores it with an error toast if rejected", async () => {
    let finish!: (value: unknown) => void;
    actions.remove.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<OwnerServicesStudy data={{ ...data, services: [data.services[0]] }} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Treatment 01" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Treatment 01?" })).getByRole("button", { name: "Delete" }));
    expect(document.querySelector('[data-service-row="1"]')).toBeNull();
    await act(async () => finish({ success: false, error: "This service is in use." }));
    expect(document.querySelector('[data-service-row="1"]')).toHaveTextContent("Treatment 01");
    expect(actions.error).toHaveBeenCalledWith("This service is in use.");
    expect(screen.queryByText("This service is in use.")).not.toBeInTheDocument();
  });
  it("renders real prices and limits initial rows without hiding catalog totals", () => {
    render(<OwnerServicesStudy data={data} />);
    expect(screen.getByText("₱1,000.25")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Show more services" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
  });

  it("searches the complete catalog and offers a recoverable empty state", () => {
    render(<OwnerServicesStudy data={data} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search services" }), { target: { value: "Treatment 14" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Treatment 14")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search services" }), { target: { value: "not-found" } });
    expect(screen.getByText("No matching services")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });

  it("sorts by price through the styled menu", async () => {
    render(<OwnerServicesStudy data={data} />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Sort services" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Price: high to low" }));
    expect(within(screen.getAllByRole("listitem")[0]).getByText("Treatment 14")).toBeInTheDocument();
  });

  it("keeps form values and rolls back the optimistic row when the server rejects a save", async () => {
    actions.create.mockResolvedValue({ success: false, error: "Unable to save this treatment." });
    render(<OwnerServicesStudy data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    let dialog = screen.getByRole("dialog", { name: "Add a service" });
    fireEvent.change(within(dialog).getByLabelText("Service name"), { target: { value: "New treatment" } });
    fireEvent.change(within(dialog).getByLabelText("Price"), { target: { value: "450.50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create service" }));
    await waitFor(() => expect(actions.error).toHaveBeenCalledWith("Unable to save this treatment.", expect.objectContaining({ action: expect.objectContaining({ label: "Review draft" }) })));
    dialog = await recoverDraft();
    expect(screen.queryByText("Unable to save this treatment.")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Service name")).toHaveValue("New treatment");
    expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({ name: "New treatment", price: 450.5, category: "Hair" }));
    expect(document.querySelectorAll("[data-service-row]")).toHaveLength(12);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: /^Discard$/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
