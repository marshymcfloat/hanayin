import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerPreviewEmployeesData, OwnerPreviewOwnersData } from "@/features/workforce/types/owner-preview-directory";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
const identity: OwnerPreviewIdentity = { userId: "owner-a", businessId: "business-a", businessSlug: "beautyfeel", businessName: "BeautyFeel", ownerName: "Owner" };
vi.mock("./OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => identity,
  useOwnerPreviewFetch: () => mocks.fetch,
}));

import { OwnerEmployeesPreview, OwnerEmployeesPreviewRoute } from "./OwnerEmployeesPreview";
import { OwnerOwnersPreview, OwnerOwnersPreviewRoute } from "./OwnerOwnersPreview";

const employees: OwnerPreviewEmployeesData = {
  businessName: "BeautyFeel",
  employees: [
    { id: 1, name: "Real Manager", contactNumber: "0912", profile: "MANAGER", specialties: ["Hair"], recurringDaysOff: [0] },
    { id: 2, name: "Real Cashier", contactNumber: "0913", profile: "CASHIER", specialties: [], recurringDaysOff: [] },
  ],
};
const owners: OwnerPreviewOwnersData = {
  businessName: "BeautyFeel",
  owners: [
    { id: 3, name: "Real Owner", contactNumber: "0999", isPrimary: true, specialties: ["Hair"], permissions: ["SETTINGS_MANAGE", "BILLING_VIEW"] },
    { id: 4, name: "Co Owner", contactNumber: "0888", isPrimary: false, specialties: [], permissions: [] },
  ],
};
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }); }

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("live owner-preview people pages", () => {
  it("renders employee data, truthful role counts, and filtering", () => {
    render(<OwnerEmployeesPreview businessSlug="beautyfeel" data={employees} refreshControl={null} />);
    expect(screen.getByRole("heading", { name: "Real Manager" })).toBeInTheDocument();
    expect(screen.getByText("Sunday")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage employees" })).toBeDisabled();
    expect(screen.queryByText("Mika Santos")).not.toBeInTheDocument();
    expect(screen.queryByText(/monthly commission/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cashier" }));
    expect(screen.queryByRole("heading", { name: "Real Manager" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Real Cashier" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search employees" }), { target: { value: "no match" } });
    expect(screen.getByText("No matching employees")).toBeInTheDocument();
  });

  it("derives owner responsibility coverage from stored permissions", () => {
    render(<OwnerOwnersPreview businessSlug="beautyfeel" data={owners} refreshControl={null} />);
    expect(screen.getByRole("heading", { name: "Real Owner" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Co Owner" })).toBeInTheDocument();
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
    expect(screen.getByText("No permissions assigned")).toBeInTheDocument();
    expect(screen.queryByText("Sofia Lim")).not.toBeInTheDocument();
    expect(screen.queryByText(/last active/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Manage permissions" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Manage permissions" }).every((button) => !button.hasAttribute("disabled"))).toBe(true);
  });

  it("opens the existing management content from the canonical preview controls", () => {
    const employeesView = render(<OwnerEmployeesPreview businessSlug="beautyfeel" data={employees} refreshControl={null} management={<p>Employee management form</p>} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage employees" }));
    expect(screen.getByRole("dialog", { name: "Manage employees" })).toHaveTextContent("Employee management form");
    employeesView.unmount();

    render(<OwnerOwnersPreview businessSlug="beautyfeel" data={owners} refreshControl={null} management={<p>Owner management form</p>} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage owners" }));
    expect(screen.getByRole("dialog", { name: "Manage owners" })).toHaveTextContent("Owner management form");
  });

  it.each([
    ["employees", OwnerEmployeesPreviewRoute, employees],
    ["owners", OwnerOwnersPreviewRoute, owners],
  ] as const)("uses warm %s cache and only its own refresh endpoint", async (page, Page, data) => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, page, "page"), data);
    mocks.fetch.mockRejectedValue(new Error("offline"));
    render(<QueryClientProvider client={queryClient}><Page /></QueryClientProvider>);
    expect(screen.getByRole("heading", { level: 1, name: page === "employees" ? "Employees" : "Owners" })).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `Refresh ${page}` }));
    await waitFor(() => expect(screen.getByText(/Refresh failed; showing saved data/)).toBeInTheDocument());
    expect(screen.getByRole("heading", { level: 1, name: page === "employees" ? "Employees" : "Owners" })).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe(`/api/owner-dashboard-preview/beautyfeel/${page}`);
  });

  it("loads a cold employee route through the endpoint", async () => {
    mocks.fetch.mockResolvedValue(employees);
    render(<QueryClientProvider client={client()}><OwnerEmployeesPreviewRoute /></QueryClientProvider>);
    expect(screen.queryByRole("heading", { name: "Real Manager" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Real Manager" })).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
