import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerSaleEventsPreview } from "@/components/dashboard/owner-preview/OwnerSaleEventsPreview";
import { OwnerSaleEventsLoading } from "@/components/dashboard/design-study/OwnerSaleEventsLoading";
import type { OwnerSaleEventPreviewData, OwnerSaleEventPreviewEvent } from "@/features/catalog/types/owner-sale-event-preview";

const actions = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), publish: vi.fn(), retry: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: actions.success, error: actions.error } }));
vi.mock("@/features/catalog/actions/owner-sale-event-preview", () => ({ createOwnerSaleEventPreviewAction: actions.create, updateOwnerSaleEventPreviewAction: actions.update, deleteOwnerSaleEventPreviewAction: actions.remove }));
vi.mock("@/features/social/actions/social", () => ({ publishSocialPostAction: actions.publish, retrySocialPostTargetAction: actions.retry }));
vi.mock("@/components/bookings/design-study/SelectionMotion", () => ({ useSelectionMotion: () => () => {} }));

const event: OwnerSaleEventPreviewEvent = { id: 1, title: "Autumn offer", description: "A catalog offer", startDate: "2026-10-01T00:00:00Z", endDate: "2026-10-31T00:00:00Z", status: "active", discountType: "PERCENTAGE", discountValue: 15, slotLimit: 20, bookings: 3, services: [{ id: 1, name: "Facial", category: "Skin" }], packages: [{ id: 2, name: "Spa day", category: "Spa" }], socialPosts: [] };
const data: OwnerSaleEventPreviewData = { section: "sale-events", generatedAt: "2026-10-09T00:00:00Z", now: "2026-10-09T00:00:00Z", business: { name: "Studio", slug: "studio" }, events: [event], availableServices: event.services, availablePackages: event.packages, connectedPlatforms: [], socialPublishingEnabled: false, metrics: { total: 1, active: 1, upcoming: 0, ended: 0, bookings: 3, attention: 0 } };

beforeEach(() => { vi.clearAllMocks(); Element.prototype.scrollIntoView = vi.fn(); });
function view(next = data, changed = vi.fn()) { return render(<OwnerSaleEventsPreview redesign result={{ success: true, data: next }} onChanged={changed} />); }
async function menu(name: string) { fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Autumn offer" }), { key: "ArrowDown" }); fireEvent.click(await screen.findByRole("menuitem", { name })); }

describe("redesign sale events", () => {
  it("links directly to social posts and states remaining booking capacity", () => {
    view();
    expect(screen.getByRole("link", { name: "Open social posts" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/social-posts");
    expect(screen.getByText("17 bookings remaining")).toBeInTheDocument();
  });
  it("keeps selected catalog items when the editor search hides them", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: "Create sale event" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Facial" }));
    fireEvent.change(screen.getByLabelText("Search services and packages"), { target: { value: "Spa" } });
    expect(screen.queryByRole("checkbox", { name: "Facial" })).not.toBeInTheDocument();
    expect(screen.getByText(/1 services · 0 packages selected/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search services and packages"), { target: { value: "" } });
    expect(screen.getByRole("checkbox", { name: "Facial" })).toBeChecked();
  });
  it("shows confirmed counts, searches the full catalog, and progressively reveals rows", () => {
    view({ ...data, events: Array.from({ length: 14 }, (_, i) => ({ ...event, id: i + 1, title: `Offer ${String(i + 1).padStart(2, "0")}` })) });
    expect(document.querySelectorAll("[data-offer-row]")).toHaveLength(12);
    expect(screen.getAllByText("15% off")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Show more offers" }));
    expect(document.querySelectorAll("[data-offer-row]")).toHaveLength(14);
    fireEvent.change(screen.getByRole("textbox", { name: "Search sale events" }), { target: { value: "Offer 14" } });
    expect(document.querySelectorAll("[data-offer-row]")).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox", { name: "Search sale events" }), { target: { value: "missing" } });
    expect(screen.getByText("No matching sale events")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(document.querySelectorAll("[data-offer-row]")).toHaveLength(12);
  });
  it("uses a styled status menu and offers a catalog link when no selections exist", async () => {
    view({ ...data, events: [], availableServices: [], availablePackages: [] });
    expect(screen.getByRole("button", { name: "Create sale event" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Manage services" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/services");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Filter sale events by status" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Upcoming" }));
    expect(screen.getByText("No matching sale events")).toBeInTheDocument();
  });
  it("keeps pending edits through refresh, blocks duplicate saves, and retains failed drafts", async () => {
    let finish!: (value: unknown) => void;
    actions.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const mounted = view();
    await menu("Edit");
    const dialog = screen.getByRole("dialog", { name: "Edit sale event" });
    fireEvent.change(within(dialog).getByLabelText("Event title"), { target: { value: "Updated offer" } });
    const form = document.getElementById("sale-event-form")!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(actions.update).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByLabelText("Event title")).toBeDisabled();
    expect(document.querySelector('[data-offer-row="1"]')).toHaveTextContent("Updated offer");
    expect(document.querySelector('[data-offer-row="1"]')).toHaveAttribute("aria-busy", "true");
    mounted.rerender(<OwnerSaleEventsPreview redesign result={{ success: true, data: { ...data, events: [{ ...event }] } }} />);
    expect(document.querySelector('[data-offer-row="1"]')).toHaveTextContent("Updated offer");
    expect(actions.success).not.toHaveBeenCalled();
    await act(async () => finish({ success: false, error: "Save rejected." }));
    expect(document.querySelector('[data-offer-row="1"]')).toHaveTextContent("Autumn offer");
    expect(within(dialog).getByLabelText("Event title")).toHaveValue("Updated offer");
    expect(actions.error).toHaveBeenCalledWith("Save rejected.");
    expect(screen.queryByText("Save rejected.")).not.toBeInTheDocument();
  });
  it("preserves scheduling and selections and reconciles confirmed updates through the cache", async () => {
    actions.update.mockResolvedValue({ success: true });
    const changed = vi.fn(); view(data, changed);
    await menu("Edit");
    const dialog = screen.getByRole("dialog", { name: "Edit sale event" });
    expect(within(dialog).getByLabelText("Facial")).toBeChecked();
    expect(within(dialog).getByLabelText("Spa day")).toBeChecked();
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: "Discount type" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Fixed amount" }));
    fireEvent.change(within(dialog).getByLabelText("Discount value"), { target: { value: "250" } });
    fireEvent.submit(document.getElementById("sale-event-form")!);
    await waitFor(() => expect(actions.success).toHaveBeenCalledWith("Sale event updated."));
    expect(actions.update).toHaveBeenCalledWith(expect.objectContaining({ id: 1, businessSlug: "studio", discountType: "FLAT", discountValue: 250, serviceIds: [1], packageIds: [2], slotLimit: 20, startDate: new Date(event.startDate), endDate: new Date(event.endDate) }));
    expect(changed).toHaveBeenCalledWith([expect.objectContaining({ id: 1, discountValue: 250 })]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("marks provisional creation as pending and removes the temporary ID after confirmation", async () => {
    let finish!: (value: unknown) => void; actions.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const changed = vi.fn(); view(data, changed);
    fireEvent.click(screen.getByRole("button", { name: "Create sale event" }));
    const dialog = screen.getByRole("dialog", { name: "Create sale event" });
    fireEvent.change(within(dialog).getByLabelText("Event title"), { target: { value: "New offer" } });
    fireEvent.click(within(dialog).getByLabelText("Facial"));
    fireEvent.submit(document.getElementById("sale-event-form")!);
    expect(document.querySelector('[data-offer-row^="-"]')).toHaveAttribute("aria-busy", "true");
    expect(actions.success).not.toHaveBeenCalled();
    await act(async () => finish({ success: true }));
    expect(document.querySelector('[data-offer-row^="-"]')).toBeNull();
    expect(changed).toHaveBeenCalledWith(undefined);
    expect(actions.success).toHaveBeenCalledTimes(1);
  });
  it("rolls back rejected deletion and keeps mutation feedback out of page banners", async () => {
    let finish!: (value: unknown) => void; actions.remove.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    view(); await menu("Delete");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(document.querySelector('[data-offer-row="1"]')).toBeNull();
    await act(async () => finish({ success: false, error: "Offer is in use." }));
    expect(document.querySelector('[data-offer-row="1"]')).toHaveTextContent("Autumn offer");
    expect(actions.error).toHaveBeenCalledWith("Offer is in use.");
    expect(screen.queryByText("Offer is in use.")).not.toBeInTheDocument();
  });
  it("returns keyboard focus to the offer actions when its editor closes", async () => {
    view();
    const trigger = screen.getByRole("button", { name: "Actions for Autumn offer" });
    trigger.focus();
    await menu("Edit");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Edit sale event" })).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("does not publish a linked post that is already publishing", async () => {
    view({ ...data, events: [{ ...event, socialPosts: [{ id: "post", title: "Promotion", status: "PUBLISHING", lastError: null, publishedAt: null, targets: [] }] }] });
    await menu("Details");
    expect(screen.queryByRole("button", { name: "Publish post" })).not.toBeInTheDocument();
    expect(actions.publish).not.toHaveBeenCalled();
  });
  it("renders a loading skeleton without fictional counts or empty-state text", () => {
    render(<OwnerSaleEventsLoading />);
    expect(screen.getByRole("status", { name: "Loading sale events" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("Your first offer starts here.")).not.toBeInTheDocument();
  });
});
