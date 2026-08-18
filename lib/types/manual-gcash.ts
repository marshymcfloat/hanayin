export const GCASH_REJECTION_REASONS = [
  "Payment not found",
  "Incorrect amount",
  "Wrong recipient",
  "Duplicate transaction reference",
  "Transaction details do not match",
  "Other",
] as const;

export const GCASH_RESOLUTION_OUTCOMES = [
  "NO_PAYMENT_FOUND",
  "REFUNDED",
  "REBOOKED",
] as const;

export type GcashResolutionOutcome = (typeof GCASH_RESOLUTION_OUTCOMES)[number];

export type GcashVerificationItem = {
  id: number;
  stage: "AWAITING_VERIFICATION" | "NEEDS_RESOLUTION";
  amountPrincipal: number;
  payerName: string | null;
  providerReference: string | null;
  submittedAt: Date;
  expiresAt: Date;
  escalatedAt: Date | null;
  escalationReason: string | null;
  destination: { accountName: string; mobileNumber: string };
  booking: {
    id: number;
    scheduledAt: Date | null;
    customerName: string;
    customerPhone: string | null;
    services: string[];
  };
};

export type GcashFollowUpItem = {
  id: number;
  amountPrincipal: number;
  payerName: string | null;
  providerReference: string | null;
  submittedAt: Date | null;
  followUpRequiredAt: Date;
  escalationReason: string | null;
  booking: {
    id: number;
    scheduledAt: Date | null;
    customerName: string;
    customerPhone: string | null;
  };
};
