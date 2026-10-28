import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";

const useRouterMock = vi.hoisted(() => vi.fn());
const cancellation = vi.hoisted(() => ({ action: vi.fn(), generic: vi.fn(), refresh: vi.fn(), toast: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: cancellation.toast, error: vi.fn() } }));
vi.mock("@/features/bookings/actions/booking-modify", () => ({
  cancelBookingAction: cancellation.action,
  removeBookingServiceAction: vi.fn(), swapBookingServiceAction: vi.fn(),
  rescheduleBookingAction: vi.fn(), reassignBookingStaffAction: vi.fn(),
  adjustBookingPriceAction: vi.fn(), addBookingNoteAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => useRouterMock(),
  useParams: () => ({ businessSlug: "demo" }),
}));

// Server actions imported by BookingList; mocked so the test never
// reaches them (it asserts rendering, not mutation behavior).
vi.mock("@/features/dashboard/actions", () => ({
  deleteBookingAction: vi.fn(),
  updateBookingStatusAction: cancellation.generic,
}));

// BookingDetailsDialog (which BookingQuickPanel re-exports) imports
// other server actions through the dashboard barrel; explicit mocks
// keep the unit test isolated from those modules.
vi.mock("@/features/dashboard/actions/owner", () => ({
  markBookingNoShowAction: vi.fn(),
}));

vi.mock("@/features/bookings/actions/booking-addons", () => ({
  addBookingServiceOrCreateFollowUpAction: vi.fn(),
}));

import {
  ViewerContextProvider,
  type ViewerContextValue,
} from "@/lib/auth/viewer-context";
import { BookingList } from "./BookingList";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";

const ownerViewer: ViewerContextValue = {
  actorType: "OWNER",
  role: Role.OWNER,
  staffProfile: null,
  permissions: Object.values(StaffPermission),
  businessId: "biz_1",
  businessSlug: "demo",
  userId: "user_owner",
  ownerId: 1,
  employeeId: null,
};

const managerViewer: ViewerContextValue = {
  actorType: "EMPLOYEE",
  role: Role.EMPLOYEE,
  staffProfile: StaffProfile.MANAGER,
  permissions: [
    StaffPermission.BOOKING_CREATE,
    StaffPermission.PAYMENT_COLLECT,
    StaffPermission.QUEUE_OVERRIDE_ALL,
    StaffPermission.BOOKING_MODIFY,
    StaffPermission.BOOKING_MARK_NO_SHOW,
  ],
  businessId: "biz_1",
  businessSlug: "demo",
  userId: "user_manager",
  ownerId: null,
  employeeId: 42,
};

beforeEach(() => {
  vi.clearAllMocks();
  cancellation.action.mockResolvedValue({ success: true });
  useRouterMock.mockReturnValue({
    push: vi.fn(),
    refresh: cancellation.refresh,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  });
});

function renderWithViewer(viewer: ViewerContextValue) {
  return render(
    <ViewerContextProvider value={viewer}>
      <BookingList bookings={[]} servicesCatalog={[]} />
    </ViewerContextProvider>,
  );
}

describe("<BookingList> with viewer context", () => {
  it("renders empty state for an owner without throwing", () => {
    renderWithViewer(ownerViewer);
    // Two empty-state nodes exist (mobile card + desktop table). Use
    // getAllByText so the test doesn't assume which viewport rendered.
    expect(screen.getAllByText(/no bookings found/i).length).toBeGreaterThan(0);
  });

  it("renders empty state for a manager without throwing", () => {
    renderWithViewer(managerViewer);
    expect(screen.getAllByText(/no bookings found/i).length).toBeGreaterThan(0);
  });

  it("throws when rendered outside ViewerContextProvider", () => {
    // Catches the regression where someone forgets the provider —
    // useViewer() throws a clear message instead of silently rendering
    // with the wrong permissions.
    expect(() =>
      render(<BookingList bookings={[]} servicesCatalog={[]} />),
    ).toThrow(/useViewer/);
  });
});

const factory = createSharedWorkflowFactory({ namespace: "booking-list-cancellation" });
function bookingFixture(overrides: Record<string, unknown> = {}) {
  const booking = factory.booking({ id: 20 }); const customer = factory.customer();
  return {
    id: booking.id, business_id: booking.businessId, customer_id: customer.id,
    status: booking.status, cancelled_at: null, created_at: booking.createdAt,
    scheduled_at: booking.scheduledAt, grand_total: booking.grandTotal,
    total_discount: booking.totalDiscount, payment_status: booking.paymentStatus,
    customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
    vouchers: [], payments: [], availed_services: [], ...overrides,
  } as unknown as Parameters<typeof BookingList>[0]["bookings"][number];
}
function cancellationTree(viewer: ViewerContextValue, booking = bookingFixture()) {
  return <ViewerContextProvider value={viewer}><BookingList bookings={[booking]} /></ViewerContextProvider>;
}
async function openMenu(index = 0) {
  const trigger = screen.getAllByRole("button", { name: "Open actions for booking 20" })[index];
  trigger.focus(); fireEvent.keyDown(trigger, { key: "ArrowDown" });
  await screen.findByRole("menu"); return trigger;
}
async function openCancellation(index = 0) {
  const trigger = await openMenu(index);
  fireEvent.click(screen.getByRole("menuitem", { name: "Cancel Booking" }));
  await screen.findByRole("dialog", { name: "Cancel this booking?" }); return trigger;
}

describe("BookingList canonical cancellation", () => {
  it.each([0, 1])("opens the reason-required dialog from action trigger %s without mutating", async index => {
    render(cancellationTree(ownerViewer)); await openCancellation(index);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Reason")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm cancel" })).toBeDisabled();
    expect(cancellation.action).not.toHaveBeenCalled(); expect(cancellation.generic).not.toHaveBeenCalled();
  });
  it("submits only the canonical action with booking ID and trimmed reason", async () => {
    render(cancellationTree(ownerViewer)); await openCancellation();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "  Customer requested  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));
    await waitFor(() => expect(cancellation.action).toHaveBeenCalledWith({ bookingId: 20, reason: "Customer requested" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(cancellation.generic).not.toHaveBeenCalled(); expect(cancellation.refresh).toHaveBeenCalledOnce();
    expect(cancellation.toast).toHaveBeenCalledWith("Booking cancelled");
  });
  it("keeps a denied cancellation open without refreshing or reporting success", async () => {
    cancellation.action.mockResolvedValue({ success: false, error: "Forbidden" });
    render(cancellationTree(ownerViewer)); await openCancellation();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Requested" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));
    await waitFor(() => expect(cancellation.action).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm cancel" })).not.toBeDisabled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(cancellation.refresh).not.toHaveBeenCalled(); expect(cancellation.toast).not.toHaveBeenCalled();
  });
  it.each(["STAFF", "MANAGER", "CASHIER"] as const)("hides cancellation for %s without the capability", async profile => {
    render(cancellationTree({ ...managerViewer, staffProfile: profile, permissions: [] })); await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Cancel Booking" })).not.toBeInTheDocument();
  });
  it.each(["STAFF", "MANAGER", "CASHIER"] as const)("honors the existing %s explicit cancellation grant", async profile => {
    render(cancellationTree({ ...managerViewer, staffProfile: profile, permissions: [StaffPermission.BOOKING_CANCEL] })); await openCancellation();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it.each([{ status: "HOLD" }, { status: "CANCELLED" }, { status: "COMPLETED" }, { cancelled_at: factory.booking().createdAt }])("hides the existing ACCEPTED quick action for %j", async state => {
    render(cancellationTree(ownerViewer, bookingFixture(state))); await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Cancel Booking" })).not.toBeInTheDocument();
  });
  it("updates the memoized capability after viewer changes", async () => {
    const { rerender } = render(cancellationTree({ ...managerViewer, permissions: [] })); await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Cancel Booking" })).not.toBeInTheDocument();
    rerender(cancellationTree({ ...managerViewer, permissions: [StaffPermission.BOOKING_CANCEL] }));
    expect(screen.getByRole("menuitem", { name: "Cancel Booking" })).toBeInTheDocument();
    rerender(cancellationTree({ ...managerViewer, permissions: [] }));
    expect(screen.queryByRole("menuitem", { name: "Cancel Booking" })).not.toBeInTheDocument();
  });
  it("returns focus to the invoking row action and clears the reason on reopen", async () => {
    render(cancellationTree(ownerViewer)); const trigger = await openCancellation();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Old reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Keep booking" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await openCancellation(); expect(screen.getByLabelText("Reason")).toHaveValue("");
    expect(cancellation.action).not.toHaveBeenCalled();
  });
  it("closes on capability revocation without reopening after a new grant", async () => {
    const allowed = { ...managerViewer, permissions: [StaffPermission.BOOKING_CANCEL] };
    const { rerender } = render(cancellationTree(allowed)); await openCancellation();
    rerender(cancellationTree({ ...managerViewer, permissions: [] }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    rerender(cancellationTree(allowed));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(cancellation.action).not.toHaveBeenCalled();
  });
});
