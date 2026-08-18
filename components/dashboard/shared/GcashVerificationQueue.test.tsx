import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GcashVerificationQueue } from "./GcashVerificationQueue";

const routerRefresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));
vi.mock("@/lib/server actions/manual-gcash", () => ({
  approveGcashPaymentAction: vi.fn(),
  rejectGcashPaymentAction: vi.fn(),
  escalateGcashPaymentAction: vi.fn(),
  resolveGcashFollowUpAction: vi.fn(),
  GCASH_REJECTION_REASONS: ["Payment not found", "Other"],
}));

const item = {
  id: 9,
  stage: "AWAITING_VERIFICATION" as const,
  amountPrincipal: 200,
  payerName: "Ana",
  providerReference: "ABC123",
  submittedAt: new Date("2026-08-19T01:00:00Z"),
  expiresAt: new Date("2026-08-19T05:00:00Z"),
  escalatedAt: null,
  escalationReason: null,
  destination: { accountName: "BeautyFeel", mobileNumber: "09951804645" },
  booking: {
    id: 120,
    scheduledAt: new Date("2026-08-20T02:00:00Z"),
    customerName: "Daniel",
    customerPhone: "09171234567",
    services: ["Manicure"],
  },
};

describe("GcashVerificationQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a single confirmation action without a checklist", () => {
    render(<GcashVerificationQueue businessSlug="beautyfeel" items={[item]} />);
    fireEvent.click(screen.getByRole("button", { name: /review payment/i }));

    const confirm = screen.getByRole("button", { name: /^confirm payment$/i });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(confirm).toBeEnabled();
  });
});
