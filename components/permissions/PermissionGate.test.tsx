import { render, screen } from "@testing-library/react";
import {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";

import {
  ViewerContextProvider,
  type ViewerContextValue,
} from "@/lib/auth/viewer-context";
import { PermissionGate } from "./PermissionGate";

const baseManager: ViewerContextValue = {
  actorType: "EMPLOYEE",
  role: Role.EMPLOYEE,
  staffProfile: StaffProfile.MANAGER,
  permissions: [
    StaffPermission.BOOKING_CREATE,
    StaffPermission.PAYMENT_COLLECT,
    StaffPermission.QUEUE_OVERRIDE_ALL,
  ],
  businessId: "biz_1",
  businessSlug: "demo",
  userId: "user_manager",
  ownerId: null,
  employeeId: 1,
};

const baseOwner: ViewerContextValue = {
  ...baseManager,
  actorType: "OWNER",
  role: Role.OWNER,
  staffProfile: null,
  permissions: Object.values(StaffPermission),
  ownerId: 1,
  employeeId: null,
};

const baseStaff: ViewerContextValue = {
  ...baseManager,
  staffProfile: StaffProfile.STAFF,
  permissions: [StaffPermission.BOOKING_CREATE],
};

function renderWith(value: ViewerContextValue, children: React.ReactNode) {
  return render(
    <ViewerContextProvider value={value}>{children}</ViewerContextProvider>,
  );
}

describe("<PermissionGate>", () => {
  it("renders children when require is satisfied", () => {
    renderWith(
      baseManager,
      <PermissionGate require="QUEUE_OVERRIDE_ALL">
        <span>visible</span>
      </PermissionGate>,
    );
    expect(screen.getByText("visible")).toBeInTheDocument();
  });

  it("hides children when require is not satisfied (default)", () => {
    renderWith(
      baseStaff,
      <PermissionGate require="QUEUE_OVERRIDE_ALL">
        <span>secret</span>
      </PermissionGate>,
    );
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("OWNER short-circuits and always passes", () => {
    renderWith(
      baseOwner,
      <PermissionGate require="CATALOG_MANAGE">
        <span>owner-sees</span>
      </PermissionGate>,
    );
    expect(screen.getByText("owner-sees")).toBeInTheDocument();
  });

  it("renders fallback when provided and gate fails", () => {
    renderWith(
      baseStaff,
      <PermissionGate require="CATALOG_MANAGE" fallback={<span>fb</span>}>
        <span>secret</span>
      </PermissionGate>,
    );
    expect(screen.getByText("fb")).toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("renders disabledFallback when gate fails", () => {
    renderWith(
      baseStaff,
      <PermissionGate
        require="CATALOG_MANAGE"
        disabledFallback={<button>Click</button>}
      >
        <button>Click</button>
      </PermissionGate>,
    );
    const btn = screen.getByText("Click");
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).toHaveAttribute("data-permission-denied");
  });

  it("requireAny passes if any permission matches", () => {
    renderWith(
      baseManager,
      <PermissionGate
        requireAny={["CATALOG_MANAGE", "BOOKING_CREATE"]}
      >
        <span>maybe</span>
      </PermissionGate>,
    );
    expect(screen.getByText("maybe")).toBeInTheDocument();
  });

  it("requireAny fails when none match", () => {
    renderWith(
      baseStaff,
      <PermissionGate
        requireAny={["CATALOG_MANAGE", "QUEUE_OVERRIDE_ALL"]}
      >
        <span>nope</span>
      </PermissionGate>,
    );
    expect(screen.queryByText("nope")).not.toBeInTheDocument();
  });

  it("require accepts an array (treated as AND)", () => {
    renderWith(
      baseManager,
      <PermissionGate
        require={["BOOKING_CREATE", "PAYMENT_COLLECT"]}
      >
        <span>and-yes</span>
      </PermissionGate>,
    );
    expect(screen.getByText("and-yes")).toBeInTheDocument();

    renderWith(
      baseManager,
      <PermissionGate
        require={["BOOKING_CREATE", "CATALOG_MANAGE"]}
        fallback={<span>and-no</span>}
      >
        <span>and-yes</span>
      </PermissionGate>,
    );
    expect(screen.getByText("and-no")).toBeInTheDocument();
  });
});
