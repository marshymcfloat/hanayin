import type { PlanEntitlements } from "@/features/billing/plan-entitlements";

export type OwnerBillingPreviewData = {
  businessName: string;
  subscription: null | {
    planName: string;
    planCode: string;
    status: string;
    periodEnd: string | null;
    entitlements: PlanEntitlements;
  };
  availableUpgradePlanNames: string[];
  availableUpgradePlans: Array<{ code: string; name: string; priceAmount: number }>;
  pendingUpgradeRequest: null | { id: string; targetPlanCode: string };
  referral: null | {
    code: string | null;
    earnedCredits: number;
    attributions: Array<{ id: string; businessName: string; status: string; createdAt: string }>;
  };
  invoices: Array<{
    id: string;
    createdAt: string;
    periodStart: string;
    periodEnd: string;
    dueAt: string;
    status: string;
    amountSubtotal: number;
    amountCreditApplied: number;
    amountDue: number;
    amountPaid: number;
    paidAt: string | null;
    paymentReference: string | null;
    paymentSubmittedAt: string | null;
  }>;
  upgradeRequests: Array<{
    id: string;
    currentPlanCode: string;
    targetPlanCode: string;
    status: string;
    createdAt: string;
    reviewedAt: string | null;
  }>;
};
