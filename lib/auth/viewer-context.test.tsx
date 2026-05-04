import { render, renderHook } from "@testing-library/react";
import {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";

import {
  hasViewerPermission,
  useOptionalViewer,
  usePermission,
  useViewer,
  ViewerContextProvider,
  type ViewerContextValue,
} from "./viewer-context";

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
  ],
  businessId: "biz_1",
  businessSlug: "demo",
  userId: "user_manager",
  ownerId: null,
  employeeId: 42,
};

function wrapper(value: ViewerContextValue) {
  function ViewerWrapper({ children }: { children: React.ReactNode }) {
    return (
      <ViewerContextProvider value={value}>{children}</ViewerContextProvider>
    );
  }
  ViewerWrapper.displayName = "ViewerWrapper";
  return ViewerWrapper;
}

describe("ViewerContext provider + hooks", () => {
  it("useViewer returns the provided value", () => {
    const { result } = renderHook(() => useViewer(), {
      wrapper: wrapper(ownerViewer),
    });
    expect(result.current).toMatchObject({
      actorType: "OWNER",
      businessSlug: "demo",
    });
  });

  it("useViewer throws when no provider is present", () => {
    // renderHook surfaces the error via result.error in older RTL versions;
    // here we render a component that calls useViewer() and assert console
    // catches the error.
    expect(() => renderHook(() => useViewer())).toThrow(
      /useViewer must be used inside <ViewerContextProvider>/,
    );
  });

  it("useOptionalViewer returns null when no provider is present", () => {
    const { result } = renderHook(() => useOptionalViewer());
    expect(result.current).toBeNull();
  });
});

describe("hasViewerPermission", () => {
  it("OWNER passes regardless of permission list", () => {
    expect(
      hasViewerPermission(ownerViewer, StaffPermission.QUEUE_OVERRIDE_ALL),
    ).toBe(true);
    expect(
      hasViewerPermission(ownerViewer, [StaffPermission.CATALOG_MANAGE]),
    ).toBe(true);
  });

  it("MANAGER passes when permission is owned", () => {
    expect(
      hasViewerPermission(managerViewer, StaffPermission.QUEUE_OVERRIDE_ALL),
    ).toBe(true);
  });

  it("MANAGER fails when permission is missing", () => {
    expect(
      hasViewerPermission(managerViewer, StaffPermission.CATALOG_MANAGE),
    ).toBe(false);
  });

  it("array + mode 'all' requires every permission", () => {
    expect(
      hasViewerPermission(
        managerViewer,
        [StaffPermission.BOOKING_CREATE, StaffPermission.PAYMENT_COLLECT],
        "all",
      ),
    ).toBe(true);
    expect(
      hasViewerPermission(
        managerViewer,
        [StaffPermission.BOOKING_CREATE, StaffPermission.CATALOG_MANAGE],
        "all",
      ),
    ).toBe(false);
  });

  it("array + mode 'any' requires at least one permission", () => {
    expect(
      hasViewerPermission(
        managerViewer,
        [StaffPermission.CATALOG_MANAGE, StaffPermission.PAYMENT_COLLECT],
        "any",
      ),
    ).toBe(true);
    expect(
      hasViewerPermission(
        managerViewer,
        [StaffPermission.CATALOG_MANAGE],
        "any",
      ),
    ).toBe(false);
  });

  it("empty array is trivially true", () => {
    expect(hasViewerPermission(managerViewer, [], "all")).toBe(true);
    expect(hasViewerPermission(managerViewer, [], "any")).toBe(true);
  });
});

describe("usePermission", () => {
  it("returns true for an owner regardless of permission", () => {
    const { result } = renderHook(
      () => usePermission(StaffPermission.QUEUE_OVERRIDE_ALL),
      { wrapper: wrapper(ownerViewer) },
    );
    expect(result.current).toBe(true);
  });

  it("returns true for a manager with the permission", () => {
    const { result } = renderHook(
      () => usePermission(StaffPermission.PAYMENT_COLLECT),
      { wrapper: wrapper(managerViewer) },
    );
    expect(result.current).toBe(true);
  });

  it("returns false for a manager missing the permission", () => {
    const { result } = renderHook(
      () => usePermission(StaffPermission.CATALOG_MANAGE),
      { wrapper: wrapper(managerViewer) },
    );
    expect(result.current).toBe(false);
  });

  it("supports mode: 'any' over a list", () => {
    const { result } = renderHook(
      () =>
        usePermission(
          [StaffPermission.CATALOG_MANAGE, StaffPermission.BOOKING_CREATE],
          { mode: "any" },
        ),
      { wrapper: wrapper(managerViewer) },
    );
    expect(result.current).toBe(true);
  });
});

describe("ViewerContextProvider rendering", () => {
  it("renders children", () => {
    const { getByText } = render(
      <ViewerContextProvider value={ownerViewer}>
        <span>hello</span>
      </ViewerContextProvider>,
    );
    expect(getByText("hello")).toBeInTheDocument();
  });
});
