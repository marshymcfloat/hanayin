import type {
  GcashFollowUpItem,
  GcashVerificationItem,
} from "@/lib/types/manual-gcash";

export type OwnerGcashVerificationItem = Omit<
  GcashVerificationItem,
  "submittedAt" | "expiresAt" | "escalatedAt" | "booking"
> & {
  submittedAt: string;
  expiresAt: string;
  escalatedAt: string | null;
  booking: Omit<GcashVerificationItem["booking"], "scheduledAt"> & {
    scheduledAt: string | null;
  };
};

export type OwnerGcashFollowUpItem = Omit<
  GcashFollowUpItem,
  "submittedAt" | "followUpRequiredAt" | "booking"
> & {
  submittedAt: string | null;
  followUpRequiredAt: string;
  booking: Omit<GcashFollowUpItem["booking"], "scheduledAt"> & {
    scheduledAt: string | null;
  };
};

export type OwnerGcashReviewQueue = {
  verificationItems: OwnerGcashVerificationItem[];
  followUpItems: OwnerGcashFollowUpItem[];
};
