import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveGcashPaymentAction,
  escalateGcashPaymentAction,
  rejectGcashPaymentAction,
  resolveGcashFollowUpAction,
} from "@/features/payments/actions/manual-gcash";
import { GcashFollowUpQueue, GcashVerificationQueue } from "./GcashVerificationQueue";

const routerRefresh = vi.hoisted(() => vi.fn());
const paymentToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: paymentToast }));
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));
vi.mock("@/features/payments/actions/manual-gcash", () => ({
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

  it("keeps the themed review open after a thrown action and never claims success", async () => {
    const onSuccess = vi.fn();
    vi.mocked(approveGcashPaymentAction).mockRejectedValueOnce(new Error("Network failure"));
    render(<GcashVerificationQueue businessSlug="beautyfeel" items={[item]} onSuccess={onSuccess} themeClassName="lavender-test" />);
    fireEvent.click(screen.getByRole("button", { name: /review payment/i }));
    expect(screen.getByRole("dialog")).toHaveClass("lavender-test");
    fireEvent.click(screen.getByRole("button", { name: /^confirm payment$/i }));
    await waitFor(() => expect(paymentToast.error).toHaveBeenCalledWith("Could not confirm the payment action. Check its status before retrying."));
    expect(screen.getByRole("button", { name: /^confirm payment$/i })).toBeEnabled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(paymentToast.success).not.toHaveBeenCalled();
  });

  it("blocks duplicate confirmation until the server responds", async () => {
    let resolve!: (value: { success: true }) => void;
    vi.mocked(approveGcashPaymentAction).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const onSuccess = vi.fn();
    render(<GcashVerificationQueue businessSlug="beautyfeel" items={[item]} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /review payment/i }));
    const confirm = screen.getByRole("button", { name: /^confirm payment$/i });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(approveGcashPaymentAction).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    resolve({ success: true });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("uses a single confirmation action without a checklist", () => {
    render(<GcashVerificationQueue businessSlug="beautyfeel" items={[item]} />);
    fireEvent.click(screen.getByRole("button", { name: /review payment/i }));

    const confirm = screen.getByRole("button", { name: /^confirm payment$/i });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(confirm).toBeEnabled();
  });

  it("calls preview invalidation only after server-confirmed verification", async () => {
    const onSuccess = vi.fn();
    vi.mocked(approveGcashPaymentAction).mockResolvedValueOnce({ success: true });
    render(<GcashVerificationQueue businessSlug="beautyfeel" items={[item]} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /review payment/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm payment$/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("leaves the queue unchanged and does not invalidate on failed review", async () => {
    const onSuccess = vi.fn();
    vi.mocked(approveGcashPaymentAction).mockResolvedValueOnce({
      success: false,
      error: "Payment is no longer available for approval.",
    });
    render(<GcashVerificationQueue businessSlug="beautyfeel" items={[item]} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /review payment/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm payment$/i }));
    await waitFor(() => expect(approveGcashPaymentAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /^confirm payment$/i })).toBeEnabled());
    expect(onSuccess).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("invalidates after server-confirmed escalation", async () => {
    const onSuccess = vi.fn();
    vi.mocked(escalateGcashPaymentAction).mockResolvedValueOnce({ success: true });
    render(<GcashVerificationQueue businessSlug="beautyfeel" items={[item]} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /^escalate$/i }));
    fireEvent.change(screen.getByLabelText("Mismatch or investigation details"), {
      target: { value: "Reference mismatch" },
    });
    fireEvent.click(screen.getByRole("button", { name: /mark needs resolution/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("invalidates after server-confirmed rejection", async () => {
    const onSuccess = vi.fn();
    vi.mocked(rejectGcashPaymentAction).mockResolvedValueOnce({ success: true });
    render(<GcashVerificationQueue businessSlug="beautyfeel" items={[item]} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /^reject$/i }));
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Payment not found" }));
    fireEvent.click(screen.getByRole("button", { name: /reject and release slot/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

describe("GcashFollowUpQueue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invokes its success callback only after the server resolves the follow-up", async () => {
    const onSuccess = vi.fn();
    vi.mocked(resolveGcashFollowUpAction).mockResolvedValueOnce({ success: true });
    render(<GcashFollowUpQueue businessSlug="beautyfeel" items={[{
      id: 10,
      amountPrincipal: 200,
      payerName: "Ana",
      providerReference: "ABC123",
      submittedAt: new Date("2026-08-19T01:00:00Z"),
      followUpRequiredAt: new Date("2026-08-19T06:00:00Z"),
      escalationReason: null,
      booking: {
        id: 120,
        scheduledAt: null,
        customerName: "Daniel",
        customerPhone: "09171234567",
      },
    }]} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /resolve follow-up/i }));
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: /payment refunded/i }));
    fireEvent.click(screen.getByRole("button", { name: /save resolution/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
