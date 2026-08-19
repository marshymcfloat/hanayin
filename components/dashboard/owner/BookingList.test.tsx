import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";

const useRouterMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => useRouterMock(),
  useParams: () => ({ businessSlug: "demo" }),
}));

// Server actions imported by BookingList; mocked so the test never
// reaches them (it asserts rendering, not mutation behavior).
vi.mock("@/lib/server actions/dashboard", () => ({
  deleteBookingAction: vi.fn(),
  updateBookingStatusAction: vi.fn(),
}));

// BookingDetailsDialog (which BookingQuickPanel re-exports) imports
// other server actions through the dashboard barrel; explicit mocks
// keep the unit test isolated from those modules.
vi.mock("@/lib/server actions/dashboard/owner", () => ({
  markBookingNoShowAction: vi.fn(),
}));

vi.mock("@/lib/server actions/booking-addons", () => ({
  addBookingServiceOrCreateFollowUpAction: vi.fn(),
}));

import {
  ViewerContextProvider,
  type ViewerContextValue,
} from "@/lib/auth/viewer-context";
import { BookingList } from "./BookingList";

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
  useRouterMock.mockReturnValue({
    push: vi.fn(),
    refresh: vi.fn(),
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
