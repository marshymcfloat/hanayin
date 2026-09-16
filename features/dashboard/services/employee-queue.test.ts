import { beforeEach, describe, expect, it, vi } from "vitest";

const hasStaffPermissionMock = vi.hoisted(() => vi.fn());
const promoteBookingMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  availedService: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  booking: { update: vi.fn() },
  employee: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/staff-access", () => ({
  hasStaffPermission: hasStaffPermissionMock,
}));
vi.mock("@/lib/services/booking-status", () => ({
  promoteBookingToCompletedIfEligible: promoteBookingMock,
}));
vi.mock("@/features/catalog/actions/sale-event", () => ({
  getActiveSaleEvents: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));
vi.mock("@/lib/utils/pricing", () => ({
  getApplicableDiscount: vi.fn().mockReturnValue(null),
}));

import {
  claimEmployeeService,
  markEmployeeServiceServed,
  unserveEmployeeService,
} from "./employee-queue";
import {
  AvailedServiceStatus,
  BookingStatus,
} from "@/prisma/generated/prisma/client";
import { StaffPermission } from "@/prisma/generated/prisma/enums";

const employeeContext = {
  success: true as const,
  actorType: "EMPLOYEE" as const,
  employeeId: 101,
  permissions: [],
} as never;

describe("employee queue service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
  });

  it("prevents a self-service employee from reassigning an active service", async () => {
    hasStaffPermissionMock.mockImplementation(
      (_context, permission) =>
        permission === StaffPermission.QUEUE_CLAIM_SELF,
    );
    prismaMock.employee.findFirst.mockResolvedValue({ id: 101 });
    prismaMock.availedService.findFirst.mockResolvedValue({
      status: AvailedServiceStatus.CLAIMED,
      price: 500,
      service_id: 1,
      package_id: null,
      served_by_id: 102,
      served_by_owner_id: null,
      booking: { status: BookingStatus.ACCEPTED },
    });

    const result = await claimEmployeeService({
      businessSlug: "test-business",
      context: employeeContext,
      serviceId: 20,
      employeeId: 101,
    });

    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(prismaMock.availedService.updateMany).not.toHaveBeenCalled();
  });

  it("credits commission and completes the service in one transaction", async () => {
    hasStaffPermissionMock.mockImplementation(
      (_context, permission) =>
        permission === StaffPermission.QUEUE_SERVE_SELF,
    );
    prismaMock.availedService.findFirst.mockResolvedValue({
      commission_base: 400,
      price: 500,
      booking_id: 31,
      status: AvailedServiceStatus.CLAIMED,
      served_by_id: 101,
      served_by_owner_id: null,
      booking: { status: BookingStatus.ACCEPTED },
    });
    prismaMock.employee.findFirst.mockResolvedValue({
      commission_percentage: 25,
    });
    prismaMock.availedService.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.availedService.findUnique.mockResolvedValue({ id: 20 });

    const result = await markEmployeeServiceServed({
      businessSlug: "test-business",
      context: employeeContext,
      serviceId: 20,
      employeeId: 101,
    });

    expect(result).toEqual({ success: true, data: { id: 20 } });
    expect(prismaMock.employee.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: { salary: { increment: 100 } },
    });
    expect(promoteBookingMock).toHaveBeenCalledWith(prismaMock, 31);
  });

  it("reopens a completed booking when a completed service is reversed", async () => {
    hasStaffPermissionMock.mockReturnValue(true);
    prismaMock.availedService.findFirst.mockResolvedValue({
      commission_base: null,
      price: 300,
      served_by_id: 101,
      served_by_owner_id: null,
      booking_id: 31,
      booking: { status: BookingStatus.COMPLETED },
    });
    prismaMock.employee.findUnique.mockResolvedValue({
      commission_percentage: 10,
    });
    prismaMock.availedService.updateMany.mockResolvedValue({ count: 1 });

    const result = await unserveEmployeeService({
      businessSlug: "test-business",
      context: employeeContext,
      serviceId: 20,
    });

    expect(result).toEqual({ success: true, data: { id: 20 } });
    expect(prismaMock.employee.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: { salary: { decrement: 30 } },
    });
    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: 31 },
      data: { status: BookingStatus.ACCEPTED },
    });
  });
});
