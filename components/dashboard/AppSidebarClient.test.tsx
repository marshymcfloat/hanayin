import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/beautyfeel" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("./SidebarUserFooter", () => ({ SidebarUserFooter: () => null }));

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebarClient } from "./AppSidebarClient";

const entitlements = {
  website: true,
  growth: true,
  social: true,
  ai: true,
  reportsCore: true,
  reportsAdvanced: true,
};

function renderSidebar(isOwner: boolean) {
  return render(
    <SidebarProvider>
      <AppSidebarClient
        businessSlug="beautyfeel"
        entitlements={entitlements}
        capabilities={{
          isOwner,
          canManageCatalog: true,
          canQueueOverride: true,
          canAccessSocialPosts: true,
        }}
        user={{ name: "Test User", contactNumber: "", role: isOwner ? "OWNER" : "EMPLOYEE" }}
      />
    </SidebarProvider>,
  );
}

describe("sidebar access presentation", () => {
  it("keeps Reports in the owner navigation when entitled", () => {
    renderSidebar(true);
    fireEvent.click(screen.getByRole("button", { name: "Business" }));
    expect(screen.getByRole("link", { name: /Reports/i })).toHaveAttribute("href", "/app/beautyfeel/reports");
  });

  it("does not advertise the owner-only Reports route to staff", () => {
    renderSidebar(false);
    fireEvent.click(screen.getByRole("button", { name: "Business" }));
    expect(screen.queryByRole("link", { name: /Reports/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Customers" }));
    expect(screen.getByRole("link", { name: /Bookings/i })).toHaveAttribute("href", "/app/beautyfeel/bookings");
  });
});
