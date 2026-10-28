import { beforeEach, describe, expect, it, vi } from "vitest";

const hasStaffPermissionMock = vi.hoisted(() => vi.fn());
const promoteBookingMock = vi.hoisted(() => vi.fn());
const getActiveSaleEventsMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  availedService: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  booking: { updateMany: vi.fn() },
  employee: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
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
  getActiveSaleEvents: getActiveSaleEventsMock,
}));
vi.mock("@/lib/utils/pricing", () => ({
  getApplicableDiscount: vi.fn().mockReturnValue(null),
}));
vi.mock("@/features/bookings/services/availed-service-overlap", () => ({
  findAvailedServiceScheduleConflict: vi.fn().mockResolvedValue(null),
  isAvailedServiceOverlapViolation: vi.fn().mockReturnValue(false),
  scheduleConflictResult: vi.fn(),
}));

import {
  claimEmployeeService,
  markEmployeeServiceServed,
  unclaimEmployeeService,
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
    getActiveSaleEventsMock.mockResolvedValue({ success: true, data: [] });
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.employee.updateMany.mockResolvedValue({ count: 1 });
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
      served_by_type: null,
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

  it("does not write a foreign-tenant service", async () => {
    hasStaffPermissionMock.mockReturnValue(true);
    prismaMock.employee.findFirst.mockResolvedValue({ id: 101 });
    prismaMock.availedService.findFirst.mockResolvedValue(null);
    const result = await claimEmployeeService({ businessSlug: "test-business", context: employeeContext, serviceId: 20, employeeId: 101 });
    expect(result.success).toBe(false);
    expect(prismaMock.availedService.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 20, booking: { business: { slug: "test-business" } } },
    }));
    expect(prismaMock.availedService.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a concurrent claim without overwriting the first assignee", async () => {
    hasStaffPermissionMock.mockImplementation((_context, permission) => permission === StaffPermission.QUEUE_CLAIM_SELF);
    prismaMock.employee.findFirst.mockResolvedValue({ id: 101 });
    prismaMock.availedService.findFirst.mockResolvedValue({
      status: AvailedServiceStatus.PENDING, price: 500, service_id: 1, package_id: null,
      served_by_id: null, served_by_owner_id: null, served_by_type: null,
      booking: { status: BookingStatus.ACCEPTED },
    });
    prismaMock.availedService.updateMany.mockResolvedValue({ count: 0 });

    const result = await claimEmployeeService({ businessSlug: "test-business", context: employeeContext, serviceId: 20, employeeId: 101 });
    expect(result.success).toBe(false);
    expect(prismaMock.availedService.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 20, status: AvailedServiceStatus.PENDING,
        served_by_id: null, served_by_owner_id: null, served_by_type: null,
        booking: { business: { slug: "test-business" }, status: BookingStatus.ACCEPTED },
      }),
    }));
  });

  it("allows a manager override only against the assignee read in its snapshot", async () => {
    hasStaffPermissionMock.mockImplementation((_context, permission) => permission === StaffPermission.QUEUE_OVERRIDE_ALL);
    prismaMock.employee.findFirst.mockResolvedValue({ id: 102 });
    prismaMock.availedService.findFirst.mockResolvedValue({
      status: AvailedServiceStatus.CLAIMED, price: 500, service_id: 1, package_id: null,
      served_by_id: 101, served_by_owner_id: null, served_by_type: "EMPLOYEE",
      booking: { status: BookingStatus.ACCEPTED },
    });
    prismaMock.availedService.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.availedService.findUnique.mockResolvedValue({ id: 20 });

    const result = await claimEmployeeService({ businessSlug: "test-business", context: employeeContext, serviceId: 20, employeeId: 102 });
    expect(result.success).toBe(true);
    expect(prismaMock.availedService.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: AvailedServiceStatus.CLAIMED, served_by_id: 101, served_by_owner_id: null, served_by_type: "EMPLOYEE" }),
    }));
  });

  it("does not unclaim a provider changed after the self-service read", async () => {
    hasStaffPermissionMock.mockImplementation((_context, permission) => permission === StaffPermission.QUEUE_CLAIM_SELF);
    prismaMock.availedService.findFirst.mockResolvedValue({
      price: 500, status: AvailedServiceStatus.CLAIMED, served_by_id: 101,
      served_by_owner_id: null, served_by_type: "EMPLOYEE",
    });
    prismaMock.availedService.updateMany.mockResolvedValue({ count: 0 });
    const result = await unclaimEmployeeService({ businessSlug: "test-business", context: employeeContext, serviceId: 20 });
    expect(result.success).toBe(false);
    expect(prismaMock.availedService.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: AvailedServiceStatus.CLAIMED, served_by_id: 101, served_by_owner_id: null, served_by_type: "EMPLOYEE" }),
    }));
  });

  it("completes work without maintaining a second mutable salary balance", async () => {
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
      served_by_type: "EMPLOYEE",
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
    expect(prismaMock.employee.updateMany).not.toHaveBeenCalled();
    expect(promoteBookingMock).toHaveBeenCalledWith(prismaMock, 31);
    expect(prismaMock.availedService.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: AvailedServiceStatus.CLAIMED, served_by_id: 101, served_by_owner_id: null, served_by_type: "EMPLOYEE" }),
    }));
  });

  it("aborts completion when its assignee snapshot loses the compare-and-swap", async () => {
    hasStaffPermissionMock.mockImplementation((_context, permission) => permission === StaffPermission.QUEUE_SERVE_SELF);
    prismaMock.availedService.findFirst.mockResolvedValue({
      commission_base: 400, price: 500, booking_id: 31, status: AvailedServiceStatus.CLAIMED,
      served_by_id: 101, served_by_owner_id: null, served_by_type: "EMPLOYEE",
      booking: { status: BookingStatus.ACCEPTED },
    });
    prismaMock.employee.findFirst.mockResolvedValue({ commission_percentage: 25 });
    prismaMock.availedService.updateMany.mockResolvedValue({ count: 0 });
    const result = await markEmployeeServiceServed({ businessSlug: "test-business", context: employeeContext, serviceId: 20, employeeId: 101 });
    expect(result.success).toBe(false);
    expect(promoteBookingMock).not.toHaveBeenCalled();
    expect(prismaMock.availedService.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: AvailedServiceStatus.CLAIMED, served_by_id: 101, served_by_owner_id: null, served_by_type: "EMPLOYEE" }),
    }));
  });

  it("does not increment salary when the service is outside the tenant", async () => {
    hasStaffPermissionMock.mockReturnValue(true);
    prismaMock.availedService.findFirst.mockResolvedValue(null);
    const result = await markEmployeeServiceServed({ businessSlug: "test-business", context: employeeContext, serviceId: 20, employeeId: 101 });
    expect(result.success).toBe(false);
    expect(prismaMock.employee.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.availedService.updateMany).not.toHaveBeenCalled();
  });

  it("reopens a completed booking when a completed service is reversed", async () => {
    hasStaffPermissionMock.mockReturnValue(true);
    prismaMock.availedService.findFirst.mockResolvedValue({
      commission_base: null,
      price: 300,
      served_by_id: 101,
      served_by_owner_id: null,
      served_by_type: "EMPLOYEE",
      status: AvailedServiceStatus.COMPLETED,
      booking_id: 31,
      booking: { status: BookingStatus.COMPLETED },
    });
    prismaMock.employee.findFirst.mockResolvedValue({
      commission_percentage: 10,
    });
    prismaMock.availedService.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });

    const result = await unserveEmployeeService({
      businessSlug: "test-business",
      context: employeeContext,
      serviceId: 20,
    });

    expect(result).toEqual({ success: true, data: { id: 20 } });
    expect(prismaMock.employee.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 31, status: BookingStatus.COMPLETED, business: { slug: "test-business" } },
      data: { status: BookingStatus.ACCEPTED },
    });
  });

  it("does not debit a malformed foreign-tenant employee backlink", async () => {
    hasStaffPermissionMock.mockReturnValue(true);
    prismaMock.availedService.findFirst.mockResolvedValue({
      commission_base: 300, price: 300, served_by_id: 999,
      served_by_owner_id: null, served_by_type: "EMPLOYEE",
      status: AvailedServiceStatus.COMPLETED, booking_id: 31,
      booking: { status: BookingStatus.COMPLETED },
    });
    prismaMock.employee.findFirst.mockResolvedValue(null);

    const result = await unserveEmployeeService({
      businessSlug: "test-business", context: employeeContext, serviceId: 20,
    });

    expect(result.success).toBe(false);
    expect(prismaMock.employee.findFirst).toHaveBeenCalledWith({
      where: { id: 999, business: { slug: "test-business" } },
      select: { commission_percentage: true },
    });
    expect(prismaMock.employee.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.availedService.updateMany).not.toHaveBeenCalled();
  });
});
