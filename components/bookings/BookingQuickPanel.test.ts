import {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";
import type { ViewerContextValue } from "@/lib/auth/viewer-context";

import {
  deriveBookingViewerContext,
  deriveViewerContext,
} from "./BookingQuickPanel";

function viewer(input: Partial<ViewerContextValue>): ViewerContextValue {
  return {
    actorType: "EMPLOYEE",
    role: Role.EMPLOYEE,
    staffProfile: StaffProfile.STAFF,
    permissions: [],
    businessId: "biz_1",
    businessSlug: "demo",
    userId: "u",
    ownerId: null,
    employeeId: 1,
    ...input,
  };
}

describe("deriveBookingViewerContext (preferred)", () => {
  it("OWNER gets every flag", () => {
    const ctx = deriveBookingViewerContext(
      viewer({ actorType: "OWNER", role: Role.OWNER, staffProfile: null, ownerId: 1, employeeId: null }),
    );
    expect(ctx).toEqual({
      role: "OWNER",
      canAddService: true,
      canMarkPaid: true,
      canMarkNoShow: true,
      canDelete: true,
    });
  });

  it("MANAGER with QUEUE_OVERRIDE_ALL gets the manager flag set", () => {
    const ctx = deriveBookingViewerContext(
      viewer({
        staffProfile: StaffProfile.MANAGER,
        permissions: [
          StaffPermission.BOOKING_CREATE,
          StaffPermission.PAYMENT_COLLECT,
          StaffPermission.QUEUE_OVERRIDE_ALL,
        ],
      }),
    );
    expect(ctx).toEqual({
      role: "MANAGER",
      canAddService: true,
      canMarkPaid: true,
      canMarkNoShow: true,
      canDelete: false,
    });
  });

  it("CASHIER without QUEUE_OVERRIDE_ALL cannot mark no-show or delete", () => {
    const ctx = deriveBookingViewerContext(
      viewer({
        staffProfile: StaffProfile.CASHIER,
        permissions: [
          StaffPermission.BOOKING_CREATE,
          StaffPermission.PAYMENT_COLLECT,
        ],
      }),
    );
    expect(ctx).toEqual({
      role: "CASHIER",
      canAddService: true,
      canMarkPaid: true,
      canMarkNoShow: false,
      canDelete: false,
    });
  });

  it("STAFF defaults to read-mostly", () => {
    const ctx = deriveBookingViewerContext(
      viewer({
        staffProfile: StaffProfile.STAFF,
        permissions: [StaffPermission.PAYMENT_COLLECT],
      }),
    );
    expect(ctx).toEqual({
      role: "STAFF",
      canAddService: false,
      canMarkPaid: true,
      canMarkNoShow: false,
      canDelete: false,
    });
  });
});

describe("deriveViewerContext (legacy API still works)", () => {
  it("MANAGER without override but with BOOKING_CREATE can still add services", () => {
    expect(
      deriveViewerContext({
        role: "EMPLOYEE",
        staffProfile: "MANAGER",
        permissions: ["BOOKING_CREATE"],
      }),
    ).toMatchObject({ role: "MANAGER", canAddService: true, canMarkNoShow: false });
  });

  it("STAFF with no permissions sees no actions", () => {
    expect(
      deriveViewerContext({
        role: "EMPLOYEE",
        staffProfile: "STAFF",
        permissions: [],
      }),
    ).toEqual({
      role: "STAFF",
      canAddService: false,
      canMarkPaid: false,
      canMarkNoShow: false,
      canDelete: false,
    });
  });
});
