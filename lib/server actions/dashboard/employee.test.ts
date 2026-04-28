import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.hoisted(() => vi.fn());
const resolveTenantActorContextMock = vi.hoisted(() => vi.fn());
const hasStaffPermissionMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  availedService: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  employee: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
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

vi.mock("@/lib/server actions/sale-event", () => ({
  getActiveSaleEvents: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

vi.mock("@/lib/utils/pricing", () => ({
  getApplicableDiscount: vi.fn().mockReturnValue(null),
  calculateBookingTotal: vi
    .fn()
    .mockImplementation(({ subtotal }) => subtotal),
}));

import {
  claimServiceAction,
  getEmployeeTodayBookingsAction,
  markEmployeeBookingPaidAction,
  unclaimServiceAction,
} from "./employee";
import { AvailedServiceStatus, BookingStatus, PaymentStatus } from "@/prisma/generated/prisma/client";
import { getActiveSaleEvents } from "@/lib/server actions/sale-event";
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

    it("blocks mark paid when actor lacks payment permission", async () => {
      hasStaffPermissionMock.mockImplementation((_ctx, permission) => {
        return permission !== "PAYMENT_COLLECT";
      });

      const result = await markEmployeeBookingPaidAction(123);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Forbidden");
    });
  });
});
