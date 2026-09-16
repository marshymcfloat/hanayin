import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/prisma/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: mocks.findMany,
    },
  },
}));

import { findEntityAuditPage } from "@/features/platform/audit/repository";

describe("findEntityAuditPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findMany.mockResolvedValue([]);
  });

  it("filters by verified tenant and entity while selecting only safe fields", async () => {
    await findEntityAuditPage({
      businessId: "business-1",
      entityType: "Booking",
      entityId: "booking-1",
      limit: 25,
    });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        business_id: "business-1",
        entity_type: "Booking",
        entity_id: "booking-1",
      },
      select: {
        id: true,
        entity_type: true,
        entity_id: true,
        action: true,
        actor_id: true,
        actor_type: true,
        changes: true,
        created_at: true,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 25,
    });
  });

  it("uses an exclusive cursor for stable pagination", async () => {
    await findEntityAuditPage({
      businessId: "business-1",
      entityType: "Booking",
      entityId: "booking-1",
      limit: 10,
      cursor: "audit-20",
    });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "audit-20" },
        skip: 1,
        take: 10,
      }),
    );
  });

  it("maps persistence rows to the public DTO without tenant fields", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "audit-1",
        entity_type: "Booking",
        entity_id: "booking-1",
        action: "UPDATED",
        actor_id: "user-1",
        actor_type: "USER",
        changes: { before: { status: "HOLD" } },
        created_at: new Date("2026-09-16T00:00:00.000Z"),
      },
    ]);

    await expect(
      findEntityAuditPage({
        businessId: "business-1",
        entityType: "Booking",
        entityId: "booking-1",
        limit: 25,
      }),
    ).resolves.toEqual([
      {
        id: "audit-1",
        entityType: "Booking",
        entityId: "booking-1",
        action: "UPDATED",
        actorId: "user-1",
        actorType: "USER",
        changes: { before: { status: "HOLD" } },
        createdAt: "2026-09-16T00:00:00.000Z",
      },
    ]);
  });
});
