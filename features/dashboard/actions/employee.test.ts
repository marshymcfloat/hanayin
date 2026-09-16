// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.hoisted(() => vi.fn());
const resolveTenantActorContextMock = vi.hoisted(() => vi.fn());
const hasStaffPermissionMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  availedService: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  employee: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  booking: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/auth/staff-access", () => ({
  resolveTenantActorContext: resolveTenantActorContextMock,
  hasStaffPermission: hasStaffPermissionMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/catalog/actions/sale-event", () => ({
  getActiveSaleEvents: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

vi.mock("@/lib/utils/pricing", () => ({
  getApplicableDiscount: vi.fn().mockReturnValue(null),
  calculateBookingTotal: vi.fn().mockImplementation(({ subtotal }) => subtotal),
}));

import {
  claimServiceAction,
  getEmployeeServiceWorkAction,
  getEmployeeTodayBookingsAction,
  markServiceServedAction,
  unclaimServiceAction,
} from "./employee";
import {
  AvailedServiceStatus,
  BookingStatus,
  PaymentStatus,
} from "@/prisma/generated/prisma/client";
import { getActiveSaleEvents } from "@/features/catalog/actions/sale-event";
import { getApplicableDiscount } from "@/lib/utils/pricing";

describe("Employee Dashboard Actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getActiveSaleEvents).mockResolvedValue({
      success: true,
      data: [],
    } as never);
    vi.mocked(getApplicableDiscount).mockReturnValue(null);
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "test-business",
      session: {
        user: {
          id: "employee-user-1",
        },
      },
    });
    resolveTenantActorContextMock.mockResolvedValue({
      success: true,
      actorType: "EMPLOYEE",
      businessId: "biz-1",
      businessSlug: "test-business",
      userId: "employee-user-1",
      role: "EMPLOYEE",
      employeeId: 101,
      ownerId: null,
      businessPolicy: {
        structure: "OWNER_EMPLOYEE_SELF_SERVICE",
        allowEmployeeSelfBooking: true,
        managerCanServe: true,
      },
      profile: "STAFF",
      permissions: [
        "BOOKING_CREATE",
        "PAYMENT_COLLECT",
        "QUEUE_CLAIM_SELF",
        "QUEUE_SERVE_SELF",
      ],
    });
    hasStaffPermissionMock.mockReturnValue(true);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
  });

  describe("claimServiceAction", () => {
    it("returns error for invalid input", async () => {
      const result = await claimServiceAction(-1, 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid input");
    });

    it("claims pending service successfully", async () => {
      prismaMock.employee.findFirst.mockResolvedValue({ id: 101 });
      prismaMock.availedService.findFirst.mockResolvedValue({
        status: AvailedServiceStatus.PENDING,
        price: 100,
        service_id: 1,
        package_id: null,
        served_by_id: null,
        served_by_owner_id: null,
        booking: { status: "ACCEPTED" },
      });
      prismaMock.availedService.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.availedService.findUnique.mockResolvedValue({
        id: 1,
        status: AvailedServiceStatus.CLAIMED,
        served_by_id: 101,
        price: 100,
      });

      const result = await claimServiceAction(1, 101);

      expect(result.success).toBe(true);
      expect(prismaMock.availedService.updateMany).toHaveBeenCalled();
    });

    it("rejects claiming a service from an unconfirmed hold", async () => {
      prismaMock.employee.findFirst.mockResolvedValue({ id: 101 });
      prismaMock.availedService.findFirst.mockResolvedValue({
        status: AvailedServiceStatus.PENDING,
        price: 100,
        service_id: 1,
        package_id: null,
        served_by_id: null,
        served_by_owner_id: null,
        booking: { status: "HOLD" },
      });

      const result = await claimServiceAction(1, 101);

      expect(result).toMatchObject({ success: false });
      expect(prismaMock.availedService.updateMany).not.toHaveBeenCalled();
    });

    it("returns a structured schedule conflict before claiming", async () => {
      const targetStart = new Date("2026-08-29T09:30:00+08:00");
      const targetEnd = new Date("2026-08-29T10:30:00+08:00");
      const conflictStart = new Date("2026-08-29T09:00:00+08:00");

      prismaMock.employee.findFirst.mockResolvedValue({ id: 101 });
      prismaMock.availedService.findFirst
        .mockResolvedValueOnce({
          status: AvailedServiceStatus.PENDING,
          price: 100,
          service_id: 1,
          package_id: null,
          served_by_id: null,
          served_by_owner_id: null,
          booking: { status: BookingStatus.ACCEPTED },
        })
        .mockResolvedValueOnce({
          scheduled_at: targetStart,
          estimated_end: targetEnd,
        })
        .mockResolvedValueOnce({
          scheduled_at: conflictStart,
          service: { name: "Hair color" },
        });

      const result = await claimServiceAction(1, 101);

      expect(result).toEqual({
        success: false,
        code: "SCHEDULE_CONFLICT",
        error: "You already have another service scheduled during this time.",
        conflict: {
          serviceName: "Hair color",
          scheduledAt: conflictStart.toISOString(),
        },
      });
      expect(prismaMock.availedService.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.availedService.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            served_by_id: 101,
            cancelled_at: null,
            scheduled_at: { lt: targetEnd },
            estimated_end: { gt: targetStart },
          }),
        }),
      );
    });
  });

  describe("getEmployeeServiceWorkAction", () => {
    it("returns pending, active, and completed lists from one refresh", async () => {
      prismaMock.employee.findUnique.mockResolvedValue({
        id: 101,
        specialties: ["Nails"],
      });
      prismaMock.availedService.findMany
        .mockResolvedValueOnce([{ id: 1, status: "PENDING" }])
        .mockResolvedValueOnce([{ id: 2, status: "CLAIMED" }])
        .mockResolvedValueOnce([{ id: 3, status: "COMPLETED" }]);

      const result = await getEmployeeServiceWorkAction();

      expect(result).toEqual({
        success: true,
        data: {
          pending: [{ id: 1, status: "PENDING" }],
          active: [{ id: 2, status: "CLAIMED" }],
          completed: [{ id: 3, status: "COMPLETED" }],
        },
      });
      expect(prismaMock.availedService.findMany).toHaveBeenCalledTimes(3);
    });
  });

  describe("unclaimServiceAction", () => {
    it("returns error for invalid input", async () => {
      const result = await unclaimServiceAction(-1);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid input");
    });

    it("unclaims service successfully", async () => {
      prismaMock.availedService.findFirst.mockResolvedValue({
        price: 100,
        served_by_id: 101,
        served_by_owner_id: null,
      });
      prismaMock.availedService.updateMany.mockResolvedValue({ count: 1 });

      const result = await unclaimServiceAction(1);

      expect(result.success).toBe(true);
      expect(prismaMock.availedService.updateMany).toHaveBeenCalled();
    });
  });

  describe("markServiceServedAction", () => {
    it("rejects serving a service from an unconfirmed hold", async () => {
      prismaMock.availedService.findFirst.mockResolvedValue({
        commission_base: 100,
        price: 100,
        booking_id: 1,
        status: AvailedServiceStatus.CLAIMED,
        served_by_id: 101,
        served_by_owner_id: null,
        booking: { status: "HOLD" },
      });

      const result = await markServiceServedAction(1, 101);

      expect(result).toMatchObject({ success: false });
      expect(prismaMock.employee.update).not.toHaveBeenCalled();
      expect(prismaMock.availedService.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("employee payment actions", () => {
    it("returns empty array when actor context is non-employee", async () => {
      resolveTenantActorContextMock.mockResolvedValue({
        success: true,
        actorType: "OWNER",
        businessId: "biz-1",
        businessSlug: "test-business",
        userId: "owner-1",
        role: "OWNER",
        ownerId: 55,
        employeeId: null,
        businessPolicy: {
          structure: "OWNER_EMPLOYEE_SELF_SERVICE",
          allowEmployeeSelfBooking: true,
          managerCanServe: true,
        },
        profile: null,
        permissions: [],
      });

      const result = await getEmployeeTodayBookingsAction();

      expect(result).toEqual([]);
      expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
    });

    it("returns today bookings for authorized employee", async () => {
      prismaMock.employee.findUnique.mockResolvedValue({
        id: 101,
        specialties: [],
      });
      prismaMock.booking.findMany.mockResolvedValue([
        {
          id: 1,
          status: BookingStatus.ACCEPTED,
          payment_status: PaymentStatus.UNPAID,
          payment_method: "CASH",
          grand_total: 1000,
          amount_paid: 0,
          created_at: new Date(),
          scheduled_at: null,
          customer: { name: "Jane", email: "jane@example.com" },
          availed_services: [
            {
              id: 10,
              service: {
                name: "Haircut",
                category: "hair",
              },
            },
          ],
        },
      ]);

      const result = await getEmployeeTodayBookingsAction();

      expect(result).toHaveLength(1);
      expect(prismaMock.booking.findMany).toHaveBeenCalled();
    });

  });
});
