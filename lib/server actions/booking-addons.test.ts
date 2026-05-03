import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  resolveTenantActorContext: vi.fn(),
  hasStaffPermission: vi.fn(),
  resolveAddOnMutationMode: vi.fn(),
  appendServicesToUntouchedBooking: vi.fn(),
  createFollowUpAddOnBooking: vi.fn(),
  employeeFindFirst: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/auth/staff-access", () => ({
  resolveTenantActorContext: mocks.resolveTenantActorContext,
  hasStaffPermission: mocks.hasStaffPermission,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: {
    employee: {
      findFirst: mocks.employeeFindFirst,
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/services/booking-addons", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/booking-addons")>(
    "@/lib/services/booking-addons",
  );

  return {
    ...actual,
    resolveAddOnMutationMode: mocks.resolveAddOnMutationMode,
    appendServicesToUntouchedBooking: mocks.appendServicesToUntouchedBooking,
    createFollowUpAddOnBooking: mocks.createFollowUpAddOnBooking,
  };
});

import { addBookingServiceOrCreateFollowUpAction } from "./booking-addons";
import { BookingAddOnStateRaceError } from "@/lib/services/booking-addons";

function createEmployeeContext(canBook = true) {
  return {
    success: true as const,
    businessId: "biz_1",
    businessSlug: "demo-business",
    userId: "user_1",
    actorType: "EMPLOYEE" as const,
    role: "EMPLOYEE" as const,
    employeeId: 11,
    businessPolicy: {
      structure: "OWNER_EMPLOYEE_SELF_SERVICE" as const,
      allowEmployeeSelfBooking: true,
      managerCanServe: true,
    },
    profile: "STAFF" as const,
    permissions: canBook ? ["BOOKING_CREATE"] : [],
    ownerId: null,
  };
}

describe("addBookingServiceOrCreateFollowUpAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.requireAuth.mockResolvedValue({
      success: true,
      businessSlug: "demo-business",
      session: {
        user: {
          id: "user_1",
        },
      },
    });

    mocks.resolveTenantActorContext.mockResolvedValue(createEmployeeContext());
    mocks.hasStaffPermission.mockReturnValue(true);
    mocks.resolveAddOnMutationMode.mockResolvedValue({ mode: "APPEND" });
    mocks.appendServicesToUntouchedBooking.mockResolvedValue({ bookingId: 1 });
    mocks.createFollowUpAddOnBooking.mockResolvedValue({
      bookingId: 2,
      parentBookingId: 1,
    });
  });

  it("returns APPENDED when untouched booking append succeeds", async () => {
    const result = await addBookingServiceOrCreateFollowUpAction({
      bookingId: 1,
      services: [{ id: 99, quantity: 1 }],
    });

    expect(result).toEqual({ mode: "APPENDED", bookingId: 1 });
    expect(mocks.appendServicesToUntouchedBooking).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/demo-business");
  });

  it("falls back to follow-up when append races with state changes", async () => {
    mocks.appendServicesToUntouchedBooking.mockRejectedValueOnce(
      new BookingAddOnStateRaceError(),
    );

    const result = await addBookingServiceOrCreateFollowUpAction({
      bookingId: 1,
      services: [{ id: 99, quantity: 1 }],
    });

    expect(result).toEqual({
      mode: "FOLLOW_UP_CREATED",
      bookingId: 2,
      parentBookingId: 1,
    });
    expect(mocks.createFollowUpAddOnBooking).toHaveBeenCalled();
  });

  it("creates follow-up directly when mode resolver returns FOLLOW_UP", async () => {
    mocks.resolveAddOnMutationMode.mockResolvedValueOnce({ mode: "FOLLOW_UP" });

    const result = await addBookingServiceOrCreateFollowUpAction({
      bookingId: 1,
      services: [{ id: 99, quantity: 1 }],
    });

    expect(result.mode).toBe("FOLLOW_UP_CREATED");
    expect(mocks.appendServicesToUntouchedBooking).not.toHaveBeenCalled();
  });

  it("rejects employee actors with neither BOOKING_CREATE nor BOOKING_MODIFY", async () => {
    // Both permission checks must fail. The action calls
    // hasStaffPermission twice (once per gate); set the mock to
    // always return false so both branches deny.
    mocks.resolveTenantActorContext.mockResolvedValueOnce(
      createEmployeeContext(false),
    );
    mocks.hasStaffPermission.mockReturnValue(false);

    await expect(
      addBookingServiceOrCreateFollowUpAction({
        bookingId: 1,
        services: [{ id: 99, quantity: 1 }],
      }),
    ).rejects.toThrow("Forbidden");
  });

  it("accepts an employee that has BOOKING_MODIFY but not BOOKING_CREATE", async () => {
    // First call (BOOKING_CREATE) returns false, second call
    // (BOOKING_MODIFY) returns true. The widened gate accepts either,
    // so the action proceeds with the append flow.
    mocks.hasStaffPermission
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      // Any subsequent calls (none expected on the happy path) default
      // to true to match beforeEach.
      .mockReturnValue(true);

    const result = await addBookingServiceOrCreateFollowUpAction({
      bookingId: 1,
      services: [{ id: 99, quantity: 1 }],
    });

    expect(result).toEqual({ mode: "APPENDED", bookingId: 1 });
    expect(mocks.appendServicesToUntouchedBooking).toHaveBeenCalled();
  });
});