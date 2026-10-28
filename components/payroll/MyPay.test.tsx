import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), detail: vi.fn(), session: vi.fn(), replace: vi.fn() }));
vi.mock("@/features/payroll/actions/lifecycle", () => ({ getMyPayAction: mocks.get, getMyPublishedStatementAction: mocks.detail }));
vi.mock("next-auth/react", () => ({ useSession: mocks.session }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("./StatementDetails", () => ({ php: (value: string) => "PHP " + value, StatementDetails: () => <div>Published statement</div> }));
vi.mock("./AttendanceCorrectionRequest", () => ({ AttendanceCorrectionRequest: () => null }));
import { MyPay } from "./MyPay";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockReturnValue({ status: "authenticated", data: { user: { id: "employee-a", role: "EMPLOYEE" } } });
  mocks.get.mockResolvedValue({ success: true, data: { outstandingTotal: "750.00", estimated: [{ id: "pending", code: "COMMISSION", amount: "25.00", payable: false }], notifications: [], leave: [], hasMore: true, estimate: { start: "2026-10-01", end: "2026-10-10", gross: "100.00", net: "80.00", issues: [{ code: "CLOCK", message: "Missing clocks need review" }], lines: [] }, statements: [{ id: "statement-a", periodStart: "2026-10-01", periodEnd: "2026-10-10", paymentState: "PARTIAL", net: "80.00", paidAmount: "30.00" }] } });
});
describe("My Pay", () => {
  it("identifies simple estimates and manual deductions without claiming statutory calculation", async () => {
    const result = await mocks.get();
    result.data.estimate.calculationPolicy = "SIMPLE";
    result.data.statements[0].calculationPolicy = "SIMPLE";
    mocks.get.mockResolvedValue(result);
    render(<MyPay businessSlug="studio" userId="employee-a" />);
    expect(await screen.findByText(/Government contributions and tax are not calculated automatically/)).toBeInTheDocument();
    expect(screen.getByText(/Partly paid · Net/)).toBeInTheDocument();
    expect(screen.queryByText(/after attendance review and statutory calculation/)).not.toBeInTheDocument();
  });

  it("distinguishes estimated gross, take-home and held commission and shows review blockers", async () => {
    render(<MyPay businessSlug="studio" userId="employee-a" />);
    expect(await screen.findByText("Estimated take-home pay")).toBeInTheDocument();
    expect(screen.getByText("PHP 80.00", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("PHP 25.00")).toBeInTheDocument();
    expect(screen.getByText("Missing clocks need review")).toBeInTheDocument();
    expect(screen.getByText(/Work period: 2026-10-01/)).toBeInTheDocument();
  });
  it("uses the full outstanding balance and shows remaining money on each paginated statement", async () => {
    render(<MyPay businessSlug="studio" userId="employee-a" />);
    expect(await screen.findByText("PHP 750.00")).toBeInTheDocument();
    expect(screen.getByText(/Remaining PHP 50.00/)).toBeInTheDocument();
  });
  it("hides compensation after the employee identity changes", async () => {
    mocks.session.mockReturnValue({ status: "authenticated", data: { user: { id: "employee-b", role: "EMPLOYEE" } } });
    render(<MyPay businessSlug="studio" userId="employee-a" />);
    expect(await screen.findByText("Verify your employee session to view pay records.")).toBeInTheDocument();
    expect(screen.queryByText("PHP 750.00")).not.toBeInTheDocument();
  });
});
