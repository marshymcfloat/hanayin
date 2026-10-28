import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerOwnersStudy } from "@/components/dashboard/design-study/OwnerOwnersStudy";
import { OwnerOwnersPreviewRoute } from "@/components/dashboard/owner-preview/OwnerOwnersPreview";
import type { OwnerPreviewOwnersData } from "@/features/workforce/types/owner-preview-directory";

const mocks = vi.hoisted(() => ({ specialties: vi.fn(), permissions: vi.fn(), primary: vi.fn(), fetch: vi.fn(), revoke: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/features/dashboard/actions/queries", () => ({ updateOwnerSpecialties: mocks.specialties }));
vi.mock("@/features/workforce/actions/owners", () => ({ updateOwnerPermissionsAction: mocks.permissions, setPrimaryOwnerAction: mocks.primary }));
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewQueryProvider", () => ({ useOwnerPreviewContext: () => ({ businessId: "b", businessSlug: "studio", userId: "u" }), useOwnerPreviewFetch: () => mocks.fetch, useOwnerPreviewRevoke: () => mocks.revoke }));
vi.mock("@/components/bookings/design-study/SelectionMotion", () => ({ useSelectionMotion: () => () => {} }));

const owner = { id: 7, name: "Alex", contactNumber: "09123456789", isPrimary: false, specialties: ["Hair"], permissions: ["SETTINGS_MANAGE", "REPORTS_VIEW_FULL"] as OwnerPreviewOwnersData["owners"][number]["permissions"] };
const data: OwnerPreviewOwnersData = { businessName: "Studio", owners: [owner], administration: { currentOwnerId: 7, canManage: true, categories: ["Hair", "Nails"] } };
function setup(value = data) {
  const changed = vi.fn();
  const view = render(<OwnerOwnersStudy data={value} refreshControl={<button>Refresh owners</button>} onChanged={changed} />);
  return { changed, ...view };
}
async function open(label: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: "Manage Alex" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
  if (label !== "Edit specialties") await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
  return within(screen.getByRole("dialog"));
}
function deferred() { let finish!: (value: unknown) => void; const promise = new Promise(resolve => { finish = resolve; }); return { promise, finish }; }
beforeEach(() => { vi.clearAllMocks(); Element.prototype.scrollIntoView = vi.fn(); });

describe("redesign Owners", () => {
  it("does not replace a newer permission form when an older specialties request fails", async () => {
    const pending = deferred(); mocks.specialties.mockReturnValue(pending.promise);
    setup({ ...data, owners: [owner, { ...owner, id: 8, name: "Rae" }] });
    const dialog = await open("Edit specialties");
    fireEvent.click(dialog.getByRole("checkbox", { name: "Nails" }));
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.keyDown(await screen.findByRole("button", { name: "Manage Rae" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit permissions" }));
    await act(async () => pending.finish({ success: false, error: "Save failed" }));
    const options = mocks.error.mock.calls.find(call => call[0] === "Save failed")?.[1];
    act(() => options.action.onClick());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Edit permissions" })).toBeInTheDocument();
    expect(mocks.error).toHaveBeenCalledWith("Close the current form before reopening this draft.");
  });
  it("searches the entire directory before progressively rendering rows", () => {
    setup({ ...data, owners: Array.from({ length: 14 }, (_, i) => ({ ...owner, id: i + 1, name: `Owner ${i + 1}` })) });
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    fireEvent.change(screen.getByRole("textbox", { name: "Search owners" }), { target: { value: "Owner 14" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox", { name: "Search owners" }), { target: { value: "missing" } });
    expect(screen.getByText("No matching owners")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    fireEvent.click(screen.getByRole("button", { name: "Show more owners" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
  });
  it("has an honest empty state and fails closed without management metadata", () => {
    const { rerender, changed } = setup({ ...data, administration: undefined });
    expect(screen.queryByRole("button", { name: "Manage Alex" })).not.toBeInTheDocument();
    expect(screen.getByText(/Business-settings permission is required/)).toBeInTheDocument();
    rerender(<OwnerOwnersStudy data={{ ...data, owners: [] }} refreshControl={null} onChanged={changed} />);
    expect(screen.getByText("No owners found")).toBeInTheDocument();
  });
  it("closes optimistic specialties immediately, rolls back failure, and recovers the draft", async () => {
    const pending = deferred(); mocks.specialties.mockReturnValue(pending.promise);
    const { changed } = setup(); const dialog = await open("Edit specialties");
    fireEvent.click(dialog.getByRole("checkbox", { name: "Nails" }));
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    const row = document.querySelector('[data-owner-row="7"]');
    expect(row).toHaveTextContent("Hair · Nails"); expect(row).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.specialties).toHaveBeenCalledTimes(1); expect(mocks.success).not.toHaveBeenCalled();
    await act(async () => pending.finish({ success: false, error: "Save failed" }));
    expect(row).not.toHaveTextContent("Nails"); expect(row).toHaveAttribute("aria-busy", "false");
    fireEvent.click(screen.getByRole("button", { name: "Resume Alex draft" }));
    expect(screen.getByRole("checkbox", { name: "Nails" })).toBeChecked(); expect(mocks.error).toHaveBeenCalledWith("Save failed", expect.objectContaining({ action: expect.objectContaining({ label: "Review draft" }) })); expect(changed).not.toHaveBeenCalled();
  });
  it("preserves unlisted specialties and reports a confirmed specialty change", async () => {
    mocks.specialties.mockResolvedValue({ success: true });
    const { changed } = setup({ ...data, owners: [{ ...owner, specialties: ["Archived category"] }] });
    const dialog = await open("Edit specialties");
    expect(dialog.getByRole("checkbox", { name: "Archived category" })).toBeChecked();
    fireEvent.click(dialog.getByRole("button", { name: "Use all service categories" }));
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(changed).toHaveBeenCalledWith({ type: "specialties", ownerId: 7, specialties: [] }));
    expect(mocks.specialties).toHaveBeenCalledWith(7, []); expect(mocks.success).toHaveBeenCalledWith("Owner specialties updated.");
  });
  it("protects primary settings permission and requires at least one permission", async () => {
    setup({ ...data, owners: [{ ...owner, isPrimary: true }] }); const dialog = await open("Edit permissions");
    expect(dialog.getByRole("checkbox", { name: "Business settings" })).toBeDisabled();
    expect(mocks.permissions).not.toHaveBeenCalled();
  });
  it("requires review and confirmation for self-access removal, never showing success before the response", async () => {
    const pending = deferred(); mocks.permissions.mockReturnValue(pending.promise);
    const { changed } = setup(); const dialog = await open("Edit permissions");
    fireEvent.click(dialog.getByRole("checkbox", { name: "Business settings" }));
    fireEvent.click(dialog.getByRole("checkbox", { name: "Full reports" }));
    expect(dialog.getByRole("button", { name: "Review changes" })).toBeDisabled();
    fireEvent.click(dialog.getByRole("checkbox", { name: "Sales reports" }));
    fireEvent.click(dialog.getByRole("button", { name: "Review changes" }));
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(dialog.getByText(/removing your own business-settings access/)).toBeInTheDocument();
    await waitFor(() => expect(dialog.getByRole("button", { name: "Confirm change" })).toHaveFocus());
    fireEvent.click(dialog.getByRole("button", { name: "Confirm change" }));
    expect(document.querySelector('[data-owner-row="7"]')).toHaveTextContent("Business settings");
    expect(changed).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
    await act(async () => pending.finish({ success: false, error: "Rejected" }));
    expect(dialog.getByRole("checkbox", { name: "Sales reports" })).toBeChecked();
    expect(mocks.error).toHaveBeenCalledWith("Rejected"); expect(changed).not.toHaveBeenCalled();
  });
  it("keeps full and sales reports mutually exclusive and handles revoked permission", async () => {
    mocks.permissions.mockResolvedValue({ success: false, error: "Forbidden" }); setup(); const dialog = await open("Edit permissions");
    fireEvent.click(dialog.getByRole("checkbox", { name: "Sales reports" }));
    expect(dialog.getByRole("checkbox", { name: "Full reports" })).not.toBeChecked();
    fireEvent.click(dialog.getByRole("button", { name: "Review changes" })); fireEvent.click(dialog.getByRole("button", { name: "Confirm change" }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledOnce());
  });
  it("confirms primary-owner transfer and waits for server success", async () => {
    const pending = deferred(); mocks.primary.mockReturnValue(pending.promise); const { changed } = setup(); const dialog = await open("Set primary owner");
    expect(mocks.primary).not.toHaveBeenCalled(); fireEvent.click(dialog.getByRole("button", { name: "Confirm change" }));
    expect(document.querySelector('[data-owner-row="7"]')).not.toHaveTextContent("Primary owner"); expect(changed).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Saving…" })); expect(mocks.primary).toHaveBeenCalledOnce();
    await act(async () => pending.finish({ success: true }));
    expect(changed).toHaveBeenCalledWith({ type: "primary", ownerId: 7 }); expect(mocks.success).toHaveBeenCalledWith("Primary owner updated.");
  });
  it("blocks primary transfer to an owner without business settings", async () => {
    setup({ ...data, owners: [{ ...owner, permissions: ["REPORTS_VIEW_FULL"] }] });
    fireEvent.keyDown(screen.getByRole("button", { name: "Manage Alex" }), { key: "ArrowDown" });
    expect(await screen.findByRole("menuitem", { name: "Set primary owner" })).toHaveAttribute("aria-disabled", "true");
  });
  it("disables an open editor when refreshed management access is revoked", async () => {
    const { rerender, changed } = setup(); const dialog = await open("Edit permissions");
    rerender(<OwnerOwnersStudy data={{ ...data, administration: { ...data.administration!, canManage: false } }} refreshControl={null} onChanged={changed} />);
    expect(dialog.getByRole("checkbox", { name: "Full reports" })).toBeDisabled();
    expect(dialog.getByRole("button", { name: "Review changes" })).toBeDisabled();
    expect(dialog.getByRole("alert")).toHaveTextContent("access has changed");
    expect(mocks.permissions).not.toHaveBeenCalled();
  });
  it("returns focus to the invoking owner action after cancelling a sheet", async () => {
    setup(); const dialog = await open("Edit specialties"); fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Manage Alex" })).toHaveFocus());
  });
});

describe("Owners query states", () => {
  function route() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); render(<QueryClientProvider client={client}><OwnerOwnersPreviewRoute redesign /></QueryClientProvider>); return client; }
  it("shows loading, retries a failed read, then retains real rows during a failed refresh", async () => {
    const pending = deferred(); mocks.fetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(data).mockRejectedValueOnce(new Error("offline"));
    route(); expect(screen.getByLabelText("Loading owners")).toHaveAttribute("aria-busy", "true");
    await act(async () => pending.finish(Promise.reject(new Error("offline"))));
    expect(await screen.findByText("Owners unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh owners" }));
    expect(await screen.findByRole("heading", { name: "Alex" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh owners" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh failed");
    expect(screen.getByRole("heading", { name: "Alex" })).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledWith("/api/owner-dashboard-preview/studio/owners", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it("removes management controls after a confirmed self-permission change, even if refresh fails", async () => {
    mocks.fetch.mockResolvedValueOnce(data).mockRejectedValue(new Error("offline")); mocks.permissions.mockResolvedValue({ success: true });
    route(); await screen.findByRole("heading", { name: "Alex" }); const dialog = await open("Edit permissions");
    fireEvent.click(dialog.getByRole("checkbox", { name: "Business settings" })); fireEvent.click(dialog.getByRole("button", { name: "Review changes" })); fireEvent.click(dialog.getByRole("button", { name: "Confirm change" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Manage Alex" })).not.toBeInTheDocument());
    expect(await screen.findByText(/Business-settings permission is required/)).toBeInTheDocument();
    expect(mocks.permissions).toHaveBeenCalledWith(7, ["REPORTS_VIEW_FULL"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Owner directory" })).toHaveFocus());
  });
});
