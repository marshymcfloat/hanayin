import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerGiftCardsStudy } from "@/components/dashboard/design-study/OwnerGiftCardsStudy";
import type { OwnerGiftCardsPreviewReadModel } from "@/features/catalog/types/owner-catalog-preview";

const actions = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: actions.success, error: actions.error, warning: actions.warning } }));
vi.mock("@/features/gift-cards/actions/gift-cards", () => ({ createGiftCardAction: actions.create, updateGiftCardAction: actions.update, deleteGiftCardAction: actions.remove }));
vi.mock("@/components/bookings/design-study/SelectionMotion", () => ({ useSelectionMotion: () => () => {} }));
vi.mock("@/components/bookings/GiftCardClaimForm", () => ({ default: ({ businessSlug, mode, onSuccess }: { businessSlug: string; mode: string; onSuccess: () => void }) => <div>{businessSlug} {mode}<button type="button" onClick={onSuccess}>Confirm mocked claim</button></div> }));

const data: OwnerGiftCardsPreviewReadModel = {
  section: "gift-cards", generatedAt: "2026-10-09T00:00:00Z", business: { slug: "studio", name: "Studio", initials: "ST" },
  metrics: { totalGiftCards: 14, activeGiftCards: 12, claimedGiftCards: 1, expiredGiftCards: 1 },
  availableServices: [{ id: 11, name: "Haircut", category: "Hair" }, { id: 12, name: "Facial", category: "Skin" }],
  availablePackages: [{ id: 11, name: "Reset", category: "Wellness" }],
  giftCards: Array.from({ length: 14 }, (_, index) => ({ id: index + 1, code: `GIFT${String(index + 1).padStart(2, "0")}`, recipientName: `Recipient ${String(index + 1).padStart(2, "0")}`, recipientEmail: `recipient${index + 1}@example.com`, recipientPhone: "09171234567", expiresAt: "2026-12-31T15:59:59.000Z", claimedAt: index === 1 ? "2026-10-08T00:00:00Z" : null, status: index === 1 ? "claimed" : index === 2 ? "expired" : "active", includedServices: [{ id: 11, name: "Haircut" }], includedPackages: [{ id: 11, name: "Reset" }] })),
};
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

function createForm() {
  fireEvent.click(screen.getByRole("button", { name: "Issue gift card" }));
  const dialog = screen.getByRole("dialog", { name: "Issue a gift card" });
  fireEvent.change(within(dialog).getByLabelText("Gift code"), { target: { value: "newgift" } });
  fireEvent.change(within(dialog).getByLabelText("Recipient name"), { target: { value: "New Recipient" } });
  fireEvent.change(within(dialog).getByLabelText("Recipient email"), { target: { value: "new@example.com" } });
  fireEvent.change(within(dialog).getByLabelText("Recipient phone"), { target: { value: "09170000000" } });
  fireEvent.change(within(dialog).getByLabelText("Expiry date"), { target: { value: "2026-12-31" } });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Include service Haircut" }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Include package Reset" }));
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

describe("redesign gift cards", () => {
  it("renders recipients, both contacts, inclusions and real counts without invented balances", () => {
    render(<OwnerGiftCardsStudy data={data} />);
    const row = within(screen.getAllByRole("listitem")[0]);
    expect(row.getByText("Recipient 01")).toBeInTheDocument();
    expect(row.getByText("recipient1@example.com")).toBeInTheDocument();
    expect(row.getByText("09171234567")).toBeInTheDocument();
    expect(row.getByText("Haircut")).toBeInTheDocument();
    expect(row.getByText("Reset")).toBeInTheDocument();
    expect(row.getByText("Dec 31, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/balance|original value|sender/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Show more gift cards" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
    fireEvent.change(screen.getByRole("textbox", { name: "Search gift cards" }), { target: { value: "recipient14@example.com" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("GIFT14")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search gift cards" }), { target: { value: "missing" } });
    expect(screen.getByText("No matching gift cards")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });

  it("uses styled status and sort menus and preserves claimed and expiry dates", async () => {
    render(<OwnerGiftCardsStudy data={data} />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Filter by status" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Claimed" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("GIFT02")).toBeInTheDocument();
    expect(screen.getByText("Oct 8, 2026")).toBeInTheDocument();
    expect(screen.getByText("Dec 31, 2026")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Sort gift cards" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Code A–Z" }));
    expect(screen.getByRole("combobox", { name: "Sort gift cards" })).toHaveTextContent("Code A–Z");
  });

  it("inserts a provisional row, closes immediately, and reconciles only after commit", async () => {
    const request = deferred(); actions.create.mockReturnValue(request.promise);
    const onChanged = vi.fn();
    render(<OwnerGiftCardsStudy data={{ ...data, giftCards: [] }} onChanged={onChanged} />);
    const dialog = createForm();
    fireEvent.submit(dialog.querySelector("form")!); fireEvent.submit(dialog.querySelector("form")!);
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.create).toHaveBeenCalledWith({ code: "NEWGIFT", customer_name: "New Recipient", customer_email: "new@example.com", customer_phone: "09170000000", expires_at: new Date("2026-12-31T15:59:59Z"), service_ids: [11], package_ids: [11] });
    expect(document.querySelector('[data-gift-row="-1"]')).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector('[data-gift-row="-1"]')).not.toHaveTextContent("active");
    expect(within(dialog).getByLabelText("Gift code")).toBeDisabled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onChanged).not.toHaveBeenCalled(); expect(actions.success).not.toHaveBeenCalled();
    const saved = { ...data.giftCards[0], id: 90, code: "NEWGIFT" };
    await act(async () => request.resolve({ success: true, data: saved }));
    await waitFor(() => expect(document.querySelector('[data-gift-row="90"]')).toBeInTheDocument());
    expect(document.querySelector('[data-gift-row="-1"]')).not.toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledWith({ type: "upsert", item: saved });
    expect(actions.success).toHaveBeenCalledWith("NEWGIFT was issued.", expect.objectContaining({ action: expect.objectContaining({ label: "View item" }) }));
  });

  it("rolls back failures and keeps all draft values and selections for retry", async () => {
    actions.create.mockResolvedValue({ success: false, error: "Gift code already exists" });
    render(<OwnerGiftCardsStudy data={data} />);
    let dialog = createForm();
    fireEvent.change(within(dialog).getByLabelText("Find services or packages"), { target: { value: "Facial" } });
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(actions.error).toHaveBeenCalledWith("Gift code already exists", expect.objectContaining({ action: expect.objectContaining({ label: "Review draft" }) })));
    dialog = await recoverDraft();
    expect(document.querySelector('[data-gift-row="-1"]')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Gift code")).toHaveValue("NEWGIFT");
    expect(within(dialog).getByLabelText("Recipient name")).toHaveValue("New Recipient");
    expect(within(dialog).getByLabelText("Recipient email")).toHaveValue("new@example.com");
    expect(within(dialog).getByLabelText("Recipient phone")).toHaveValue("09170000000");
    expect(within(dialog).getByLabelText("Expiry date")).toHaveValue("2026-12-31");
    fireEvent.change(within(dialog).getByLabelText("Find services or packages"), { target: { value: "" } });
    expect(within(dialog).getByRole("checkbox", { name: "Include service Haircut" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Include package Reset" })).toBeChecked();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports delivery warnings separately from a committed creation", async () => {
    const saved = { ...data.giftCards[0], id: 90, code: "NEWGIFT" };
    actions.create.mockResolvedValue({ success: true, data: saved, warning: "Gift card created but email could not be sent." });
    render(<OwnerGiftCardsStudy data={data} />);
    const dialog = createForm(); fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(actions.success).toHaveBeenCalledWith("NEWGIFT was issued.", expect.objectContaining({ action: expect.objectContaining({ label: "View item" }) })));
    expect(actions.warning).toHaveBeenCalledWith("Gift card created but email could not be sent.");
    expect(actions.error).not.toHaveBeenCalled();
  });

  it("validates recipient contact, expiry and inclusions before sending a request", () => {
    render(<OwnerGiftCardsStudy data={data} />); const dialog = createForm();
    fireEvent.change(within(dialog).getByLabelText("Recipient email"), { target: { value: "" } });
    fireEvent.change(within(dialog).getByLabelText("Recipient phone"), { target: { value: "" } });
    fireEvent.submit(dialog.querySelector("form")!);
    expect(actions.error).toHaveBeenLastCalledWith("Add a recipient email or phone.");
    fireEvent.change(within(dialog).getByLabelText("Recipient phone"), { target: { value: "09170000000" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Include service Haircut" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Include package Reset" }));
    fireEvent.submit(dialog.querySelector("form")!);
    expect(actions.error).toHaveBeenLastCalledWith("Select at least one service or package.");
    fireEvent.change(within(dialog).getByLabelText("Expiry date"), { target: { value: "" } });
    fireEvent.submit(dialog.querySelector("form")!);
    expect(actions.error).toHaveBeenLastCalledWith("Enter a gift code, recipient name, and valid expiry date.");
    expect(actions.create).not.toHaveBeenCalled();
  });

  it("preserves editing details and rolls back rejected edits", async () => {
    actions.update.mockResolvedValue({ success: false, error: "Cannot update this gift" });
    render(<OwnerGiftCardsStudy data={data} />); await action("GIFT02", "Edit");
    let dialog = screen.getByRole("dialog", { name: "Edit gift card" });
    expect(within(dialog).getByLabelText("Expiry date")).toHaveValue("2026-12-31");
    expect(within(dialog).getByRole("checkbox", { name: "Include package Reset" })).toBeChecked();
    fireEvent.change(within(dialog).getByLabelText("Recipient name"), { target: { value: "Changed recipient" } });
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(actions.error).toHaveBeenCalledWith("Cannot update this gift", expect.objectContaining({ action: expect.objectContaining({ label: "Review draft" }) })));
    dialog = await recoverDraft();
    expect(document.querySelector('[data-gift-row="2"]')).toHaveTextContent("Recipient 02");
    expect(within(dialog).getByLabelText("Recipient name")).toHaveValue("Changed recipient");
  });

  it("supports overlapping deletions and restores only the failed row", async () => {
    const first = deferred(); const second = deferred();
    actions.remove.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onChanged = vi.fn(); render(<OwnerGiftCardsStudy data={data} onChanged={onChanged} />);
    await action("GIFT01", "Delete"); fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await action("GIFT02", "Delete"); fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(actions.remove.mock.calls).toEqual([[1], [2]]);
    expect(document.querySelector('[data-gift-row="1"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-gift-row="2"]')).not.toBeInTheDocument();
    await act(async () => second.resolve({ success: true }));
    await act(async () => first.resolve({ success: false, error: "Deletion rejected" }));
    expect(document.querySelector('[data-gift-row="1"]')).toBeInTheDocument();
    expect(document.querySelector('[data-gift-row="2"]')).not.toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1); expect(onChanged).toHaveBeenCalledWith({ type: "delete", id: 2 });
    expect(actions.error).toHaveBeenCalledWith("Deletion rejected");
  });

  it("opens the existing staff claim flow and invokes invalidation only after its success callback", async () => {
    const onGiftCardClaimed = vi.fn(); render(<OwnerGiftCardsStudy data={data} onGiftCardClaimed={onGiftCardClaimed} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim gift card" }));
    const button = await screen.findByRole("button", { name: "Confirm mocked claim" });
    expect(screen.getByRole("dialog", { name: "Claim gift card booking" })).toHaveTextContent("studio staff");
    expect(onGiftCardClaimed).not.toHaveBeenCalled();
    fireEvent.click(button); expect(onGiftCardClaimed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Claim gift card" })).toHaveFocus());
  });

  it("shows the empty catalog state and disables issuing when there are no inclusions", () => {
    render(<OwnerGiftCardsStudy data={{ ...data, giftCards: [], availableServices: [], availablePackages: [] }} />);
    expect(screen.getByText("A thoughtful gift starts here.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Issue gift card" }));
    const dialog = screen.getByRole("dialog", { name: "Issue a gift card" });
    expect(within(dialog).getByRole("button", { name: "Issue gift card" })).toBeDisabled();
    expect(within(dialog).getByText("Add a service or package before issuing a gift card.")).toBeInTheDocument();
  });
});
