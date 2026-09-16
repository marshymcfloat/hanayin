import { beforeEach, describe, expect, it, vi } from "vitest";

const conflictMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  employee: { findFirst: vi.fn() },
  employeeAttendance: { upsert: vi.fn() },
  availedService: { findMany: vi.fn() },
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/booking-conflicts", () => ({
  detectAndEmitFutureBookingConflicts: conflictMock,
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

import {
  previewTenantAttendanceImpact,
  updateTenantAttendanceStatus,
} from "./attendance-admin";

describe("attendance admin service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    conflictMock.mockResolvedValue(undefined);
  });

  it("scopes employee mutation lookup to the authenticated tenant", async () => {
    prismaMock.employee.findFirst.mockResolvedValue(null);

    await expect(
      updateTenantAttendanceStatus(
        "tenant-a",
        9,
        new Date("2026-09-16T00:00:00.000Z"),
        "ABSENT",
      ),
    ).resolves.toEqual({ success: false, error: "Unauthorized" });
    expect(prismaMock.employee.findFirst).toHaveBeenCalledWith({
      where: { id: 9, business: { slug: "tenant-a" } },
      select: { id: true, business_id: true },
    });
    expect(prismaMock.employeeAttendance.upsert).not.toHaveBeenCalled();
  });

  it("preserves the clean concurrency error for a P2002 upsert race", async () => {
    prismaMock.employee.findFirst.mockResolvedValue({
      id: 9,
      business_id: "biz-a",
    });
    prismaMock.employeeAttendance.upsert.mockRejectedValue({ code: "P2002" });

    await expect(
      updateTenantAttendanceStatus(
        "tenant-a",
        9,
        new Date("2026-09-16T00:00:00.000Z"),
        "ABSENT",
      ),
    ).resolves.toEqual({
      success: false,
      error: "Another change landed at the same time. Refresh and try again.",
    });
  });

  it("de-duplicates booking impact while preserving customer fallback data", async () => {
    prismaMock.employee.findFirst.mockResolvedValue({
      id: 9,
      business_id: "biz-a",
    });
    const booking = {
      id: 101,
      scheduled_at: new Date("2026-09-16T01:00:00.000Z"),
      estimated_end: null,
      grand_total: 250,
      payment_status: "UNPAID",
      customer_label: "Walk-in",
      customer: null,
      availed_services: [{ service: { name: "Haircut" } }, { service: null }],
    };
    prismaMock.availedService.findMany.mockResolvedValue([
      { booking_id: 101, booking },
      { booking_id: 101, booking },
    ]);

    await expect(
      previewTenantAttendanceImpact(
        "tenant-a",
        9,
        new Date("2026-09-16T00:00:00.000Z"),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        bookingId: 101,
        customerName: "Walk-in",
        serviceNames: ["Haircut"],
      }),
    ]);
    expect(prismaMock.availedService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          served_by_id: 9,
          served_by: { business_id: "biz-a" },
        }),
      }),
    );
  });
});
