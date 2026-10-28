import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";
import type { OwnerBillingPreviewData } from "@/features/billing/types/owner-billing-preview";

const identity: OwnerPreviewIdentity = { userId: "owner-a", businessId: "business-a", businessSlug: "beautyfeel", businessName: "BeautyFeel", ownerName: "Owner" };
vi.mock("./OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => identity,
  useOwnerPreviewFetch: () => vi.fn(),
}));

import { OwnerBillingPreviewQuery } from "./OwnerBillingPreviewQuery";

function renderBilling(data: OwnerBillingPreviewData) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(ownerPreviewKeys.section(identity, "billing", "page"), data);
  return render(<QueryClientProvider client={client}><OwnerBillingPreviewQuery /></QueryClientProvider>);
}

describe("owner billing preview presentation", () => {
  it("uses the owner-preview header and readable feature names without inventing upgrade actions", () => {
    renderBilling({
      businessName: "BeautyFeel",
      subscription: {
        planName: "Pro Monthly", planCode: "PRO_MONTHLY", status: "ACTIVE", periodEnd: "2026-10-06T00:00:00.000Z",
        entitlements: { website: true, growth: true, social: true, ai: false, reportsCore: true, reportsAdvanced: false },
      },
      availableUpgradePlanNames: [], availableUpgradePlans: [], pendingUpgradeRequest: null, referral: null, invoices: [], upgradeRequests: [],
    });
    expect(screen.getByRole("heading", { level: 1, name: "Billing" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/owner-dashboard-preview/beautyfeel");
    expect(screen.getByRole("button", { name: "Refresh billing" })).toBeInTheDocument();
    expect(screen.getByText("No higher plan is currently available.")).toBeInTheDocument();
    const features = screen.getByRole("list", { name: "" });
    expect(within(features).getByText("Advanced reports")).toBeInTheDocument();
    expect(screen.getAllByText("Not included")).toHaveLength(2);
    expect(screen.queryByText("reportsAdvanced")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upgrade/i })).not.toBeInTheDocument();
  });

  it("preserves invoice values and request states in the live-data view", () => {
    renderBilling({
      businessName: "BeautyFeel",
      subscription: null,
      availableUpgradePlanNames: [],
      availableUpgradePlans: [], pendingUpgradeRequest: null, referral: null,
      invoices: [{ id: "invoice-1", createdAt: "2026-09-06T00:00:00.000Z", periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z", dueAt: "2026-09-06T00:00:00.000Z", status: "PAID", amountSubtotal: 249900, amountCreditApplied: 50000, amountDue: 199900, amountPaid: 199900, paidAt: "2026-09-06T00:00:00.000Z", paymentReference: null, paymentSubmittedAt: null }],
      upgradeRequests: [{ id: "request-1", currentPlanCode: "PLUS_MONTHLY", targetPlanCode: "PRO_MONTHLY", status: "PENDING", createdAt: "2026-09-06T00:00:00.000Z", reviewedAt: null }],
    });
    expect(screen.getByRole("heading", { name: "No subscription record" })).toBeInTheDocument();
    expect(screen.getAllByText("₱2,499.00")).toHaveLength(2);
    expect(screen.getAllByText("₱1,999.00")).toHaveLength(2);
    expect(screen.getByText("Plus Monthly", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("does not use the active-plan accent for a past-due subscription", () => {
    renderBilling({
      businessName: "BeautyFeel",
      subscription: {
        planName: "Plus Monthly", planCode: "PLUS_MONTHLY", status: "PAST_DUE", periodEnd: null,
        entitlements: { website: true, growth: true, social: false, ai: false, reportsCore: true, reportsAdvanced: true },
      },
      availableUpgradePlanNames: [], availableUpgradePlans: [], pendingUpgradeRequest: null, referral: null, invoices: [], upgradeRequests: [],
    });
    expect(screen.getByText("Past Due").querySelector("svg")).toHaveClass("text-white/70");
  });
});
