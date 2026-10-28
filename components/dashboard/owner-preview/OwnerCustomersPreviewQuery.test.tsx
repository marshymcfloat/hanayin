import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerPreviewCustomerDirectory } from "@/features/customers/types/owner-preview";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/features/customers/actions/customer", () => ({ updateCustomer: mocks.update }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
const identity: OwnerPreviewIdentity = { userId: "owner-a", businessId: "business-a", businessSlug: "beautyfeel", businessName: "BeautyFeel", ownerName: "Owner" };
vi.mock("./OwnerPreviewQueryProvider", () => ({ useOwnerPreviewContext: () => identity, useOwnerPreviewFetch: () => mocks.fetch }));
import { OwnerCustomersPreviewRoute } from "./OwnerCustomersPreview";

const directory: OwnerPreviewCustomerDirectory = {
  businessName: "BeautyFeel", page: 1, pageSize: 25, filteredCount: 1,
  totals: { customers: 1, newCustomers: 1, returningCustomers: 0, completedVisits: 0 },
  customers: [{ id: "existing", name: "Existing Customer", email: null, phone: null, joinedAt: "2026-09-01T00:00:00.000Z", completedVisits: 0, lastVisitAt: null }],
};
const key = ownerPreviewKeys.section(identity, "customers", "directory", { search: "", segment: "all", page: 1 });
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("owner-preview customers cache and creation", () => {
  it("does not replace a newer draft when an earlier save fails", async () => {
    const queryClient = client(); queryClient.setQueryData(key, directory);
    const submission = deferred<{ success: false; error: string }>();
    mocks.update.mockReturnValue(submission.promise);
    render(<QueryClientProvider client={queryClient}><OwnerCustomersPreviewRoute redesign /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Existing Customer" }));
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "First draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add customer" }));
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Newer draft" } });
    submission.resolve({ success: false, error: "Unavailable" });
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByLabelText("Customer name")).toHaveValue("Newer draft");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(await screen.findByRole("button", { name: /Resume customer draft/ }));
    expect(screen.getByLabelText("Customer name")).toHaveValue("First draft");
  });

  it("remembers directory filters within the same owner cache", async () => {
    const queryClient = client(); queryClient.setQueryData(key, directory);
    mocks.fetch.mockResolvedValue(directory);
    const view = render(<QueryClientProvider client={queryClient}><OwnerCustomersPreviewRoute redesign /></QueryClientProvider>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Existing" } });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    view.unmount();
    render(<QueryClientProvider client={queryClient}><OwnerCustomersPreviewRoute redesign /></QueryClientProvider>);
    expect(screen.getByRole("searchbox")).toHaveValue("Existing");
  });
  it("keeps a failed optimistic edit draft, rolls back the row, and locks duplicate writes", async () => {
    const queryClient = client(); queryClient.setQueryData(key, directory);
    const submission = deferred<{ success: false; error: string }>();
    mocks.update.mockReturnValue(submission.promise);
    render(<QueryClientProvider client={queryClient}><OwnerCustomersPreviewRoute redesign /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Existing Customer" }));
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Changed contact" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Changed contact")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add customer" })).toBeVisible());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    submission.resolve({ success: false, error: "Forbidden" });
    await waitFor(() => expect(screen.getByText("Existing Customer")).toBeInTheDocument());
    fireEvent.click(await screen.findByRole("button", { name: /Resume customer draft/ }));
    expect(screen.getByLabelText("Customer name")).toBeEnabled();
    expect(screen.getByLabelText("Customer name")).toHaveValue("Changed contact");
    expect(mocks.error).toHaveBeenCalled();
    expect(queryClient.getQueryData(key)).toEqual(directory);
  });

  it("reconciles confirmed edits and invalidates customer-dependent queries", async () => {
    const queryClient = client(); queryClient.setQueryData(key, directory);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const updated = { ...directory.customers[0], name: "Confirmed contact", email: "", phone: "" };
    mocks.update.mockResolvedValue({ success: true, data: updated });
    mocks.fetch.mockResolvedValue({ ...directory, customers: [updated] });
    render(<QueryClientProvider client={queryClient}><OwnerCustomersPreviewRoute redesign /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Existing Customer" }));
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Confirmed contact" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Customer updated."));
    expect(queryClient.getQueryData<OwnerPreviewCustomerDirectory>(key)?.customers[0].name).toBe("Confirmed contact");
    expect(mocks.update).toHaveBeenCalledWith("existing", { businessSlug: "beautyfeel", name: "Confirmed contact", email: "", phone: "" });
    for (const page of ["customers", "bookings", "dashboard", "reports", "inbox"]) expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.page(identity, page) });
  });

  it("loads private history only on demand and provides an independent retry", async () => {
    const queryClient = client(); queryClient.setQueryData(key, directory);
    mocks.fetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ customerId: "existing", services: [], hasMore: false });
    render(<QueryClientProvider client={queryClient}><OwnerCustomersPreviewRoute redesign /></QueryClientProvider>);
    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "View profile for Existing Customer" }));
    expect(await screen.findByRole("button", { name: "Retry history" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
    expect(await screen.findByText("No completed services yet.")).toBeInTheDocument();
    expect(mocks.fetch.mock.calls[0][0]).toBe("/api/owner-dashboard-preview/beautyfeel/customers/existing/history");
  });

  it("debounces server search and preserves cached rows on failed refresh", async () => {
    const queryClient = client(); queryClient.setQueryData(key, directory);
    mocks.fetch.mockRejectedValue(new Error("offline"));
    render(<QueryClientProvider client={queryClient}><OwnerCustomersPreviewRoute redesign /></QueryClientProvider>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "someone" } });
    expect(screen.getByText("Showing the previous selection while the requested customers load.")).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    expect(mocks.fetch.mock.calls[0][0]).toContain("search=someone&segment=all&page=1");
    expect(screen.getByText("Existing Customer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Existing Customer" })).toBeDisabled();
  });

  it("renders a warm directory without a redundant GET and refreshes only customers", async () => {
    const queryClient = client();
    queryClient.setQueryData(key, directory);
    mocks.fetch.mockResolvedValue(directory);
    render(<QueryClientProvider client={queryClient}><OwnerCustomersPreviewRoute /></QueryClientProvider>);
    expect(screen.getByText("Existing Customer")).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh customers" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    expect(mocks.fetch.mock.calls[0][0]).toContain("/api/owner-dashboard-preview/beautyfeel/customers?");
  });

  it.each([false, true])("optimistically inserts and reconciles a confirmed customer (redesign=%s)", async (redesign) => {
    const queryClient = client();
    queryClient.setQueryData(key, directory);
    const submission = deferred<{ id: string; name: string; email: null; phone: null; joinedAt: string; completedVisits: number; lastVisitAt: null }>();
    const created = { id: "created", name: "New Customer", email: null, phone: null, joinedAt: "2026-09-28T00:00:00.000Z", completedVisits: 0, lastVisitAt: null };
    mocks.fetch.mockImplementation((_url: string, init?: RequestInit) => init?.method === "POST" ? submission.promise : Promise.resolve({ ...directory, customers: [created, ...directory.customers], filteredCount: 2, totals: { ...directory.totals, customers: 2, newCustomers: 2 } }));
    render(<QueryClientProvider client={queryClient}><OwnerCustomersPreviewRoute redesign={redesign} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(dialog.querySelector('input[required]')!, { target: { value: "New Customer" } });
    fireEvent.click(screen.getByRole("button", { name: "Create customer" }));
    expect(await screen.findByText("Saving customer…")).toBeInTheDocument();
    expect(screen.getByText("New Customer")).toBeInTheDocument();
    submission.resolve(created);
    await waitFor(() => expect(queryClient.getQueryData<OwnerPreviewCustomerDirectory>(key)?.customers[0].id).toBe("created"));
    await waitFor(() => expect(screen.queryByText("Saving customer…")).not.toBeInTheDocument());
  });

  it.each([false, true])("rolls back a failed create and leaves the form open for retry (redesign=%s)", async (redesign) => {
    const queryClient = client();
    queryClient.setQueryData(key, directory);
    const submission = deferred<never>();
    mocks.fetch.mockImplementation((_url: string, init?: RequestInit) => init?.method === "POST" ? submission.promise : Promise.resolve(directory));
    render(<QueryClientProvider client={queryClient}><OwnerCustomersPreviewRoute redesign={redesign} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(dialog.querySelector('input[required]')!, { target: { value: "Rollback Customer" } });
    fireEvent.click(screen.getByRole("button", { name: "Create customer" }));
    expect(await screen.findByText("Saving customer…")).toBeInTheDocument();
    submission.reject(new Error("offline"));
    await waitFor(() => expect(screen.queryByText("Saving customer…")).not.toBeInTheDocument());
    expect(screen.queryByText("Rollback Customer")).not.toBeInTheDocument();
    if (redesign) {
      await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("The customer could not be saved. Review your draft and try again.", expect.anything()));
      fireEvent.click(await screen.findByRole("button", { name: /Resume customer draft/ }));
      expect(screen.getByLabelText("Customer name")).toHaveValue("Rollback Customer");
    }
    else expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(queryClient.getQueryData(key)).toEqual(directory);
  });
});
