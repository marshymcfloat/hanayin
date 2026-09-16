import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  employeeFind: vi.fn(),
  leaveFind: vi.fn(),
  leaveFindMany: vi.fn(),
  leaveCreate: vi.fn(),
  leaveDelete: vi.fn(),
  leaveUpdate: vi.fn(),
  attendanceFind: vi.fn(),
  attendanceCreate: vi.fn(),
  attendanceUpdate: vi.fn(),
  transaction: vi.fn(),
  conflicts: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/prisma/prisma", () => {
  const tx = {
    leaveRequest: { update: mocks.leaveUpdate },
    employeeAttendance: {
      findFirst: mocks.attendanceFind,
      create: mocks.attendanceCreate,
      update: mocks.attendanceUpdate,
    },
  };
  mocks.transaction.mockImplementation(
    (callback: (client: typeof tx) => unknown) => callback(tx),
  );
  return {
    prisma: {
      employee: { findFirst: mocks.employeeFind },
      leaveRequest: {
        findFirst: mocks.leaveFind,
        findMany: mocks.leaveFindMany,
        create: mocks.leaveCreate,
        delete: mocks.leaveDelete,
      },
      $transaction: mocks.transaction,
    },
  };
});
vi.mock("@/lib/services/booking-conflicts", () => ({
  detectAndEmitFutureBookingConflicts: mocks.conflicts,
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn } }));

import {
  cancelTenantLeaveRequest,
  createTenantLeaveRequest,
  updateTenantLeaveRequestStatus,
} from "./leave-request";

const employeeActor = {
  businessSlug: "tenant-a",
  userId: "employee-user-1",
  role: "EMPLOYEE" as const,
};
const ownerActor = {
  businessSlug: "tenant-a",
  userId: "owner-user-1",
  role: "OWNER" as const,
};

describe("leave request tenant service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T00:00:00.000Z"));
    mocks.employeeFind.mockResolvedValue({ id: 7, business_id: "business-1" });
    mocks.leaveFindMany.mockResolvedValue([]);
    mocks.leaveCreate.mockResolvedValue({ id: 10 });
    mocks.leaveDelete.mockResolvedValue({ id: 10 });
    mocks.leaveUpdate.mockResolvedValue({ id: 10 });
    mocks.attendanceFind.mockResolvedValue(null);
    mocks.attendanceCreate.mockResolvedValue({ id: 20 });
    mocks.conflicts.mockResolvedValue(undefined);
  });

  it("scopes employee submissions to the actor, business id, and tenant slug", async () => {
    await createTenantLeaveRequest(
      {
        employee_id: 7,
        business_id: "business-1",
        businessSlug: "tenant-a",
        start_date: new Date("2026-10-01T00:00:00.000Z"),
        end_date: new Date("2026-10-02T00:00:00.000Z"),
        reason: "Vacation",
        type: "VACATION",
      },
      employeeActor,
    );

    expect(mocks.employeeFind).toHaveBeenCalledWith({
      where: {
        id: 7,
        business_id: "business-1",
        business: { slug: "tenant-a" },
        user_id: "employee-user-1",
      },
      select: { id: true, business_id: true },
    });
    expect(mocks.leaveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employee_id: 7,
          business_id: "business-1",
        }),
      }),
    );
  });

  it("does not write when the employee is outside the verified tenant", async () => {
    mocks.employeeFind.mockResolvedValue(null);

    const result = await createTenantLeaveRequest(
      {
        employee_id: 99,
        business_id: "business-2",
        businessSlug: "tenant-a",
        start_date: new Date("2026-10-01T00:00:00.000Z"),
        end_date: new Date("2026-10-02T00:00:00.000Z"),
        reason: "Vacation",
        type: "VACATION",
      },
      employeeActor,
    );

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.leaveCreate).not.toHaveBeenCalled();
  });

  it("allows cancellation only from pending and actor-scoped requests", async () => {
    mocks.leaveFind.mockResolvedValue({ id: 10, status: "APPROVED" });

    await expect(cancelTenantLeaveRequest(10, employeeActor)).resolves.toEqual({
      success: false,
      error: "Only pending leave requests can be cancelled",
    });
    expect(mocks.leaveFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 10,
          business: { slug: "tenant-a" },
          employee: { user_id: "employee-user-1" },
        }),
      }),
    );
    expect(mocks.leaveDelete).not.toHaveBeenCalled();
  });

  it("atomically approves a pending request and creates leave attendance", async () => {
    mocks.leaveFind.mockResolvedValue({
      id: 10,
      employee_id: 7,
      business_id: "business-1",
      start_date: new Date("2026-10-01T00:00:00.000Z"),
      end_date: new Date("2026-10-02T00:00:00.000Z"),
      status: "PENDING",
    });

    const result = await updateTenantLeaveRequestStatus(
      10,
      "APPROVED",
      "Approved",
      true,
      ownerActor,
    );

    expect(result).toEqual({ success: true });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.leaveUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        status: "APPROVED",
        admin_comment: "Approved",
        is_paid: true,
      },
    });
    expect(mocks.attendanceCreate).toHaveBeenCalledTimes(2);
    expect(mocks.conflicts).toHaveBeenCalledWith({
      businessId: "business-1",
      changedDate: new Date("2026-10-01T00:00:00.000Z"),
      trigger: "LEAVE_APPROVED",
    });
  });

  it("rejects a second terminal transition without starting a transaction", async () => {
    mocks.leaveFind.mockResolvedValue({
      id: 10,
      employee_id: 7,
      business_id: "business-1",
      start_date: new Date("2026-10-01T00:00:00.000Z"),
      end_date: new Date("2026-10-02T00:00:00.000Z"),
      status: "REJECTED",
    });

    await expect(
      updateTenantLeaveRequestStatus(
        10,
        "APPROVED",
        undefined,
        false,
        ownerActor,
      ),
    ).resolves.toEqual({
      success: false,
      error: "Only pending leave requests can be updated",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
