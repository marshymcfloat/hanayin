import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createPortal } from "react-dom";
import { Role, StaffProfile } from "@/prisma/generated/prisma/enums";
import { ViewerContextProvider, type ViewerContextValue } from "@/lib/auth/viewer-context";
import { useStaffDialogTheme } from "@/components/dashboard/employee/useStaffDialogTheme";
import staffTheme from "@/components/dashboard/employee/StaffWorkspaceTheme.module.css";

vi.mock("motion/react", () => ({
  motion: { div: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div> },
  useReducedMotion: () => true,
}));

import { HeroKpiGrid } from "./HeroKpiGrid";
import { PortalCard } from "./PortalCard";
import { StaffPortalCard } from "./StaffPortalCard";

describe("staff visual primitives", () => {
  it("keeps a large salary readable in the real three-tile summary", () => {
    const { container } = render(<HeroKpiGrid salaryEstimate={1_234_567} servedToday={12} queuePending={3} />);
    expect(screen.getByText(/1,234,567\.00/)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("grid-cols-2", "xl:grid-cols-3");
  });

  it("adds staff chrome without changing the shared card default", () => {
    render(<><PortalCard data-testid="shared" /><StaffPortalCard data-testid="staff" /></>);
    expect(screen.getByTestId("staff")).toHaveClass("border-[#E7E9E4]", "bg-white");
    expect(screen.getByTestId("shared")).not.toHaveClass("border-[#E7E9E4]");
  });

  it("carries staff colors through a portal while leaving owner portals unchanged", () => {
    const base: ViewerContextValue = {
      actorType: "OWNER", role: Role.OWNER, staffProfile: null, permissions: [],
      businessId: "biz-1", businessSlug: "beautyfeel", userId: "user-1", ownerId: 1, employeeId: null,
    };
    function PortalProbe() {
      const className = useStaffDialogTheme();
      return createPortal(<div data-testid="portal-probe" className={className} />, document.body);
    }
    const { rerender } = render(<ViewerContextProvider value={base}><PortalProbe /></ViewerContextProvider>);
    expect(screen.getByTestId("portal-probe")).not.toHaveClass(staffTheme.workspace);
    rerender(<ViewerContextProvider value={{ ...base, actorType: "EMPLOYEE", role: Role.EMPLOYEE, staffProfile: StaffProfile.STAFF, ownerId: null, employeeId: 7 }}><PortalProbe /></ViewerContextProvider>);
    expect(screen.getByTestId("portal-probe")).toHaveClass(staffTheme.workspace);
  });
});
