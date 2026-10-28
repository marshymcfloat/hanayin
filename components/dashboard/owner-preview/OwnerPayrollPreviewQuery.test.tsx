import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OwnerPayrollPreviewData } from "@/features/payroll/types/owner-payroll-preview";
vi.mock("@/features/payroll/actions/pay-settings", () => ({ getEmployeePaySettingsAction: vi.fn() }));
vi.mock("@/features/payroll/actions/lifecycle", () => ({ saveCompensationAction: vi.fn() }));

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/components/dashboard/owner/PayslipGenerationDialog", () => ({ PayslipGenerationDialog: () => null }));
vi.mock("@/components/dashboard/owner/PayslipAuditDialog", () => ({ PayslipAuditDialog: () => null }));
vi.mock("@/components/payroll/PayrollWorkspace", () => ({ PayrollWorkspace: () => <div>Period payroll workspace</div> }));
vi.mock("@/components/payroll/SimplePayrollWorkspace", () => ({ SimplePayrollWorkspace: () => <div>Simple payroll workspace</div> }));
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => ({ userId: "owner-a", businessId: "business-a", businessSlug: "studio-a", businessName: "Studio A", ownerName: "Owner" }),
  useOwnerPreviewFetch: () => mocks.fetch,
  useOwnerPreviewRevoke: () => vi.fn(),
}));

import { OwnerPayrollPreviewRoute } from "./OwnerPayrollPreviewQuery";

const granted: OwnerPayrollPreviewData = {
  access: "granted", businessName: "Studio A", month: "2026-09", paidThisMonth: 4800, paidPayslipsThisMonth: 1,
  employees: [{ id: 1, name: "Ana", profile: "STAFF", dailyRate: 1000, commissionPercentage: 12, lastPaidAt: "2026-09-20T00:00:00Z", lastPaidAmount: 4800 }],
  recentPayslips: [{ id: 12, employeeName: "Ana", periodStart: "2026-09-01T00:00:00Z", periodEnd: "2026-09-20T00:00:00Z", paidAt: "2026-09-20T00:00:00Z", amount: 4800 }],
};

afterEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/"); });

describe("owner payroll preview query", () => {
  it.each(["LEGACY", "SHADOW", "ACTIVE"])("connects SIMPLE policy in %s mode without enabling government calculations", async payrollMode => {
    mocks.fetch.mockResolvedValue({ ...granted, calculationPolicy: "SIMPLE", payrollMode });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPayrollPreviewRoute redesign /></QueryClientProvider>);
    expect(await screen.findByText("Simple payroll workspace")).toBeInTheDocument();
    expect(screen.queryByText("Period payroll workspace")).not.toBeInTheDocument();
  });

  it("lets a legacy business review simple setup without switching on mount", async () => {
    mocks.fetch.mockResolvedValue({ ...granted, calculationPolicy: "GOVERNMENT", payrollMode: "LEGACY" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPayrollPreviewRoute redesign /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Try simple pay tracking" }));
    expect(await screen.findByText("Simple payroll workspace")).toBeInTheDocument();
  });

  it("opens setup deep links even before payroll activation", async () => {
    window.history.replaceState(null, "", "/redesign/owner-dashboard/team/payroll?stage=setup&employee=1");
    mocks.fetch.mockResolvedValue({ ...granted, payrollMode: "LEGACY" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPayrollPreviewRoute redesign /></QueryClientProvider>);
    expect(await screen.findByText("Period payroll workspace")).toBeInTheDocument();
  });

  it.each(["SHADOW", "ACTIVE"])("connects %s mode to the lifecycle workspace", async payrollMode => {
    mocks.fetch.mockResolvedValue({ ...granted, payrollMode });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPayrollPreviewRoute redesign /></QueryClientProvider>);
    expect(await screen.findByText("Period payroll workspace")).toBeInTheDocument();
    expect(screen.queryByText("Employee pay settings")).not.toBeInTheDocument();
  });
  it("renders only an access message for restricted owners and retains refresh", async () => {
    mocks.fetch.mockResolvedValue({ access: "restricted" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPayrollPreviewRoute /></QueryClientProvider>);
    expect(await screen.findByText("Payroll access restricted")).toBeInTheDocument();
    expect(screen.queryByText("Employee pay settings")).not.toBeInTheDocument();
    expect(screen.queryByText("₱4,800")).not.toBeInTheDocument();
    const before = mocks.fetch.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh payroll" }));
    await waitFor(() => expect(mocks.fetch.mock.calls.length).toBe(before + 1));
  });

  it("shows actual paid amounts and keeps write actions disabled", async () => {
    mocks.fetch.mockResolvedValue(granted);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPayrollPreviewRoute /></QueryClientProvider>);
    expect(await screen.findByText("Employee pay settings")).toBeInTheDocument();
    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    expect(screen.getByText("Recent paid payslips")).toBeInTheDocument();
    expect(screen.queryByText("Ready to release")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export payroll" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Release payroll" })).toBeDisabled();
  });

  it("discards compensation when the route unmounts and checks access again on revisit", async () => {
    mocks.fetch.mockResolvedValueOnce(granted).mockResolvedValueOnce({ access: "restricted" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = render(<QueryClientProvider client={client}><OwnerPayrollPreviewRoute /></QueryClientProvider>);
    expect(await screen.findByText("Employee pay settings")).toBeInTheDocument();
    first.unmount();
    await waitFor(() => expect(client.getQueryCache().findAll()).toHaveLength(0));

    render(<QueryClientProvider client={client}><OwnerPayrollPreviewRoute /></QueryClientProvider>);
    expect(await screen.findByText("Payroll access restricted")).toBeInTheDocument();
    expect(screen.queryByText("Employee pay settings")).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("marks legacy paid records without a release timestamp as date unavailable", async () => {
    mocks.fetch.mockResolvedValue({ ...granted, employees: [{ ...granted.employees[0], lastPaidAt: null }], recentPayslips: [{ ...granted.recentPayslips[0], paidAt: null }] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OwnerPayrollPreviewRoute /></QueryClientProvider>);
    expect(await screen.findAllByText("Date unavailable")).not.toHaveLength(0);
    expect(screen.getByText(/Payment date unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/Paid Sep 20/)).not.toBeInTheDocument();
  });
});
