import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OwnerDashboardShell from "@/components/dashboard/design-study/OwnerDashboardShell";

const scrollIntoView = vi.fn();
const scrollTo = vi.fn();
const pageScrollTo = vi.fn();
let reducedMotion = false;
let desktop = true;

beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion = false;
  desktop = true;
  vi.spyOn(window, "scrollTo").mockImplementation(pageScrollTo);
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("reduced-motion") ? reducedMotion : query.includes("max-width") ? !desktop : desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  scrollIntoView.mockClear();
  scrollTo.mockClear();
  pageScrollTo.mockClear();
  window.history.replaceState(null, "", "/");
});

function setup(business?: { name: string; slug: string }, actions: { ownerName?: string; onSignOut?: () => Promise<void>; onBooking?: (focusKey?: string) => void } = {}) {
  const view = render(<OwnerDashboardShell business={business} {...actions}><section id="queue">Queue content</section><section id="team">Team content</section></OwnerDashboardShell>);
  for (const target of view.container.querySelectorAll<HTMLElement>("main, section")) {
    target.scrollIntoView = scrollIntoView;
    target.scrollTo = scrollTo;
  }
  return { ...view, navigation: within(screen.getByRole("navigation", { name: "Dashboard sections" })) };
}

describe("dashboard section navigation", () => {
  it.each(["dashboard", "employees", "services", "customers"] as const)("omits the Expenses rail shortcut on %s", (activePage) => {
    render(<OwnerDashboardShell activePage={activePage}><h1>Workspace</h1></OwnerDashboardShell>);
    const rail = within(screen.getByRole("navigation", { name: "Workspace shortcuts" }));
    expect(rail.queryByRole("link", { name: "Expenses" })).not.toBeInTheDocument();
    expect(rail.getByRole("link", { name: "Customers" })).toBeInTheDocument();
    if (activePage === "dashboard") {
      expect(within(screen.getByRole("navigation", { name: "Dashboard sections" })).getByRole("link", { name: "Expenses" })).toHaveAttribute("href", "#expenses");
    }
  });
  it("selects Bookings in customer navigation and the dock without selecting New booking", () => {
    const openBooking = vi.fn();
    render(<OwnerDashboardShell activePage="bookings" business={{ name: "Studio", slug: "studio" }} onBooking={openBooking}><h1>Bookings</h1></OwnerDashboardShell>);
    const nav = within(screen.getByRole("navigation", { name: "Customers sections" }));
      expect(nav.getByRole("link", { name: "Customer inbox" })).toHaveAttribute("href", "/redesign/owner-dashboard/customers/inbox");
    expect(nav.getByRole("link", { name: "Bookings" })).toHaveAttribute("aria-current", "page");
    const dock = within(screen.getByRole("navigation", { name: "Mobile workspace" }));
    expect(dock.getByRole("link", { name: "Bookings" })).toHaveAttribute("aria-current", "page");
    const create = dock.getByRole("button", { name: "New booking" });
    expect(create).not.toHaveAttribute("aria-current");
    fireEvent.click(create);
    expect(openBooking).toHaveBeenCalledWith("redesign-mobile-new-booking");
  });
  it("exposes all four Customers destinations in the sidebar and mobile menu", () => {
    render(<OwnerDashboardShell activePage="customers" business={{ name: "Studio", slug: "studio" }}><h1>Customers</h1></OwnerDashboardShell>);
    const rail = within(screen.getByRole("navigation", { name: "Workspace shortcuts" }));
    expect(rail.getByRole("link", { name: "Customers" })).toHaveAttribute("href", "/redesign/owner-dashboard/customers");
    const nav = within(screen.getByRole("navigation", { name: "Customers sections" }));
      expect(nav.getByRole("link", { name: "Customer inbox" })).toHaveAttribute("href", "/redesign/owner-dashboard/customers/inbox");
    expect(nav.getByRole("link", { name: "Customers" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Notifications" })).toHaveAttribute("href", "/redesign/owner-dashboard/customers/notifications");
    const dock = within(screen.getByRole("navigation", { name: "Mobile workspace" }));
    expect(dock.getByRole("link", { name: "Bookings" })).toHaveAttribute("href", "/redesign/owner-dashboard/customers/bookings");
    expect(dock.queryByRole("link", { name: "Customers" })).not.toBeInTheDocument();
    fireEvent.click(dock.getByRole("button", { name: "Menu" }));
    const menu = within(screen.getByRole("dialog"));
    expect(menu.getByRole("link", { name: "Customers" })).toHaveAttribute("href", "/redesign/owner-dashboard/customers");
    for (const [name, path] of [["Customers", ""], ["Bookings", "/bookings"], ["Customer inbox", "/inbox"], ["Notifications", "/notifications"]]) expect(menu.getByRole("link", { name })).toHaveAttribute("href", `/redesign/owner-dashboard/customers${path}`);
  });
  it("routes Team to Employees and exposes all implemented Team destinations", () => {
    render(<OwnerDashboardShell activePage="employees" business={{ name: "Studio", slug: "studio" }}><h1>Employees</h1></OwnerDashboardShell>);
    const nav = within(screen.getByRole("navigation", { name: "Team sections" }));
    expect(nav.getByRole("link", { name: "Employees" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Employees" })).toHaveAttribute("href", "/redesign/owner-dashboard/team/employees");
    expect(nav.getByRole("link", { name: "Owners" })).toHaveAttribute("href", "/redesign/owner-dashboard/team/owners");
    expect(nav.getByRole("link", { name: "Attendance" })).toHaveAttribute("href", "/redesign/owner-dashboard/team/attendance"); expect(nav.getByRole("link", { name: "Payroll" })).toHaveAttribute("href", "/redesign/owner-dashboard/team/payroll");
    expect(screen.queryByRole("navigation", { name: "Business sections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Dashboard sections" })).not.toBeInTheDocument();
    const dock = within(screen.getByRole("navigation", { name: "Mobile workspace" }));
    expect(dock.getByRole("link", { name: "Team" })).toHaveAttribute("aria-current", "page");
    expect(dock.getByRole("link", { name: "Team" })).toHaveAttribute("href", "/redesign/owner-dashboard/team/employees");
    fireEvent.click(dock.getByRole("button", { name: "Menu" }));
    const menu = within(screen.getByRole("dialog"));
    expect(menu.getByRole("link", { name: "Employees" })).toHaveAttribute("href", "/redesign/owner-dashboard/team/employees");
    expect(menu.getByRole("link", { name: "Owners" })).toHaveAttribute("href", "/redesign/owner-dashboard/team/owners");
    expect(menu.getByRole("link", { name: "Attendance" })).toHaveAttribute("href", "/redesign/owner-dashboard/team/attendance"); expect(menu.getByRole("link", { name: "Payroll" })).toHaveAttribute("href", "/redesign/owner-dashboard/team/payroll");
  });
  it.each([["business-hours", "Business Hours", "Business hours"], ["billing", "Billing", "Billing"], ["reports", "Reports", "Reports"]] as const)("connects %s through both Business and mobile navigation", (page, label, mobileLabel) => {
    render(<OwnerDashboardShell activePage={page} business={{ name: "Studio", slug: "studio" }}><h1>{label}</h1></OwnerDashboardShell>);
    const navigation = within(screen.getByRole("navigation", { name: "Business sections" }));
    expect(navigation.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    expect(navigation.getByRole("link", { name: label })).toHaveAttribute("href", `/redesign/owner-dashboard/business/${page}`);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile workspace" })).getByRole("button", { name: "Menu" }));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: mobileLabel })).toHaveAttribute("href", `/redesign/owner-dashboard/business/${page}`);
  });
  it("keeps catalog links out of the dashboard section menu while preserving the business shortcut", () => {
    const { navigation } = setup();
    expect(navigation.queryByText("Your catalog")).not.toBeInTheDocument();
    for (const name of ["Services", "Packages", "Vouchers", "Gift Cards", "Sale Events"]) {
      expect(navigation.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    expect(navigation.getAllByRole("link")).toHaveLength(8);
    expect(navigation.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "#overview");
    expect(navigation.getByRole("link", { name: "Today’s bookings" })).toHaveAttribute("href", "#appointments");
    expect(navigation.getByRole("link", { name: "Performance" })).toHaveAttribute("href", "#performance");
    expect(within(screen.getByRole("navigation", { name: "Workspace shortcuts" })).queryByRole("link", { name: "Performance" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Workspace shortcuts" })).queryByRole("link", { name: "Bookings" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Workspace shortcuts" })).getByRole("link", { name: "Services" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/services");
  });

  it("links services to the redesign and routes its dashboard shortcuts back to the overview", () => {
    render(<OwnerDashboardShell activePage="services" business={{ name: "BeautyFeel", slug: "beautyfeel" }}><h1>Services</h1></OwnerDashboardShell>);
    const nav = within(screen.getByRole("navigation", { name: "Business sections" }));
    expect(nav.getByRole("link", { name: "Services" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/services");
    expect(nav.getByRole("link", { name: "Services" })).toHaveAttribute("aria-current", "page");
    expect(within(screen.getByRole("navigation", { name: "Workspace shortcuts" })).getByRole("link", { name: "Services" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/services");
    expect(screen.queryByRole("navigation", { name: "Dashboard sections" })).not.toBeInTheDocument();
    expect(screen.queryByText("A little more room to grow.")).not.toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Packages" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/packages");
    expect(nav.getByRole("link", { name: "Social Posts" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/social-posts");
    for (const name of ["Growth"]) {
      expect(nav.getByRole("button", { name })).toBeDisabled();
      expect(nav.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    const dock = within(screen.getByRole("navigation", { name: "Mobile workspace" }));
    expect(dock.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/redesign/owner-dashboard");
    expect(dock.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });
  it("selects Packages in Business navigation and links the mobile menu to its redesign", () => {
    render(<OwnerDashboardShell activePage="packages" business={{ name: "Studio", slug: "studio" }}><h1>Packages</h1></OwnerDashboardShell>);
    const nav = within(screen.getByRole("navigation", { name: "Business sections" }));
    expect(nav.getByRole("link", { name: "Packages" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Services" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("main", { name: "Packages workspace" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile workspace" })).getByRole("button", { name: "Menu" }));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Packages" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/packages");
  });
  it("selects Vouchers in Business navigation and links its mobile menu to the redesign", () => {
    render(<OwnerDashboardShell activePage="vouchers" business={{ name: "Studio", slug: "studio" }}><h1>Vouchers</h1></OwnerDashboardShell>);
    const nav = within(screen.getByRole("navigation", { name: "Business sections" }));
    expect(nav.getByRole("link", { name: "Vouchers" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Vouchers" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/vouchers");
    expect(nav.getByRole("link", { name: "Services" })).not.toHaveAttribute("aria-current");
    expect(nav.getByRole("link", { name: "Packages" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("main", { name: "Vouchers workspace" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile workspace" })).getByRole("button", { name: "Menu" }));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Vouchers" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/vouchers");
  });
  it("selects Gift Cards in Business navigation and links its mobile menu to the redesign", () => {
    render(<OwnerDashboardShell activePage="gift-cards" business={{ name: "Studio", slug: "studio" }}><h1>Gift cards</h1></OwnerDashboardShell>);
    const nav = within(screen.getByRole("navigation", { name: "Business sections" }));
    expect(nav.getByRole("link", { name: "Gift Cards" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Gift Cards" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/gift-cards");
    expect(nav.getByRole("link", { name: "Vouchers" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("main", { name: "Gift cards workspace" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile workspace" })).getByRole("button", { name: "Menu" }));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Gift cards" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/gift-cards");
  });
  it("selects Sale Events and routes the mobile menu to its implemented page", () => {
    render(<OwnerDashboardShell activePage="sale-events" business={{ name: "Studio", slug: "studio" }}><h1>Sale events</h1></OwnerDashboardShell>);
    const nav = within(screen.getByRole("navigation", { name: "Business sections" }));
    expect(nav.getByRole("link", { name: "Sale Events" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Sale Events" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/sale-events");
    expect(screen.getByRole("main", { name: "Sale events workspace" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile workspace" })).getByRole("button", { name: "Menu" }));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Sale events" })).toHaveAttribute("href", "/redesign/owner-dashboard/business/sale-events");
  });
  it("smoothly scrolls and focuses the selected section without reloading", () => {
    const { navigation } = setup();
    fireEvent.click(navigation.getByRole("link", { name: "Live queue" }));
    act(() => vi.runOnlyPendingTimers());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(document.getElementById("queue")).toHaveFocus();
    expect(window.location.hash).toBe("#queue");
  });

  it("returns the desktop scroll panel to the top for Overview", () => {
    const { navigation } = setup();
    fireEvent.click(navigation.getByRole("link", { name: "Overview" }));
    act(() => vi.runOnlyPendingTimers());
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("returns the mobile dashboard to the top and respects reduced motion", () => {
    desktop = false;
    reducedMotion = true;
    setup();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile workspace" })).getByRole("link", { name: "Dashboard" }));
    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByRole("button", { name: /On this page/ })).not.toBeInTheDocument();
    expect(pageScrollTo).toHaveBeenCalledWith({ behavior: "instant", top: 0 });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("retargets rapid clicks immediately without queuing navigation", () => {
    const { navigation } = setup();
    fireEvent.click(navigation.getByRole("link", { name: "Live queue" }));
    fireEvent.click(navigation.getByRole("link", { name: "Staff performance" }));
    act(() => vi.runOnlyPendingTimers());
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(document.getElementById("team")).toHaveFocus();
  });

  it("leaves modified clicks to the browser", () => {
    const { navigation } = setup();
    fireEvent.click(navigation.getByRole("link", { name: "Live queue" }), { ctrlKey: true });
    act(() => vi.runOnlyPendingTimers());
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("keeps tenant destinations disabled until identity is verified", () => {
    setup();
    const dock = within(screen.getByRole("navigation", { name: "Mobile workspace" }));
    expect(dock.getByRole("button", { name: "Bookings" })).toBeDisabled();
    expect(dock.getByRole("button", { name: "Team" })).toBeDisabled();
    expect(dock.getByRole("button", { name: "New booking" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Your account" })).toBeDisabled();
    expect(dock.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("does not observe sections or mount section navigation while disabled", () => {
    desktop = false;
    const observe = vi.fn();
    const mutations = vi.spyOn(MutationObserver.prototype, "observe");
    vi.stubGlobal("IntersectionObserver", class {
      observe = observe;
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
    const { unmount } = setup();
    const team = document.getElementById("team")!;
    expect(observe).not.toHaveBeenCalledWith(team);
    expect(mutations.mock.calls.some(([target]) => target === screen.getByRole("main"))).toBe(false);
    expect(screen.queryByRole("button", { name: /On this page/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Jump to dashboard section" })).not.toBeInTheDocument();
    unmount();
  });

  it("passes distinct booking focus keys without selecting the action", () => {
    const onBooking = vi.fn();
    const { container } = setup({ name: "Studio", slug: "studio" }, { onBooking });
    const mobile = within(screen.getByRole("navigation", { name: "Mobile workspace" })).getByRole("button", { name: "New booking" });
    fireEvent.click(mobile);
    expect(onBooking).toHaveBeenLastCalledWith("redesign-mobile-new-booking");
    expect(mobile).not.toHaveAttribute("aria-current");
    fireEvent.click(container.querySelector('[data-catalog-focus="redesign-new-booking"]')!);
    expect(onBooking).toHaveBeenLastCalledWith("redesign-new-booking");
  });

  it("shows verified full identity, scoped account links and restores focus on dismissal", () => {
    desktop = false;
    setup({ name: "A very long studio business name", slug: "studio" }, { ownerName: "A very long verified owner name", onSignOut: vi.fn() });
    const trigger = screen.getByRole("button", { name: "Your account" });
    expect(screen.getByText("A very long verified owner name · Owner")).toBeInTheDocument();
    fireEvent.click(trigger);
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("A very long verified owner name")).toBeInTheDocument();
    expect(dialog.getByRole("link", { name: "Change password" })).toHaveAttribute("href", "/app/studio/change-password");
    fireEvent.click(dialog.getByRole("button", { name: "Close account" }));
    act(() => vi.runOnlyPendingTimers());
    expect(trigger).toHaveFocus();
  });

  it("requires confirmation, supports cancellation and retries failed sign-out", async () => {
    desktop = false;
    let rejectSignOut: (error: Error) => void = () => {};
    const onSignOut = vi.fn().mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectSignOut = reject; })).mockResolvedValueOnce(undefined);
    setup({ name: "Studio", slug: "studio" }, { ownerName: "Owner Name", onSignOut });
    fireEvent.click(screen.getByRole("button", { name: "Your account" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Sign out of this workspace?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Sign out" })[1]);
    expect(screen.getByRole("button", { name: "Signing out…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => rejectSignOut(new Error("offline")));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t sign out");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry sign out" })));
    expect(onSignOut).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Close account" }));
    act(() => vi.runOnlyPendingTimers());
  });

  it("uses verified business routes and filters workspace pages", () => {
    desktop = false;
    setup({ name: "Test Studio", slug: "test-studio" });
    const dock = within(screen.getByRole("navigation", { name: "Mobile workspace" }));
    expect(dock.getByRole("link", { name: "Bookings" })).toHaveAttribute("href", "/redesign/owner-dashboard/customers/bookings");
    expect(dock.getByRole("link", { name: "Team" })).toHaveAttribute("href", "/redesign/owner-dashboard/team/employees");
    fireEvent.click(dock.getByRole("button", { name: "Menu" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByRole("textbox", { name: "Find a workspace page" }), { target: { value: "payroll" } });
    expect(dialog.getByRole("link", { name: "Payroll" })).toHaveAttribute("href", "/redesign/owner-dashboard/team/payroll");
    expect(dialog.queryByRole("link", { name: "Services" })).not.toBeInTheDocument();
    fireEvent.change(dialog.getByRole("textbox"), { target: { value: "nonexistent" } });
    expect(dialog.getByText(/No pages match/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Close navigation" }));
    act(() => vi.runOnlyPendingTimers());
    expect(dock.getByRole("button", { name: "Menu" })).toHaveFocus();
  });
});
