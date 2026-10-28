import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantActorContext } from "@/lib/auth/staff-access";

const resolveContext = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/staff-access", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/auth/staff-access")>();
  return { ...original, resolveTenantActorContext: resolveContext };
});

import {
  getOwnerCatalogPreviewReadModel,
  resolveOwnerCatalogPreviewReadModel,
} from "./owner-catalog-preview";

const context = {
  success: true,
  businessId: "business-a",
  businessSlug: "beautyfeel",
  userId: "owner-user-a",
  actorType: "OWNER",
  role: "OWNER",
  ownerId: 7,
  employeeId: null,
  profile: null,
  permissions: [],
  businessPolicy: {
    structure: "OWNER_EMPLOYEE_SELF_SERVICE",
    allowEmployeeSelfBooking: true,
    managerCanServe: true,
  },
} as Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;

function createDatabase() {
  return {
    business: { findFirst: vi.fn() },
    service: { findMany: vi.fn() },
    servicePackage: { findMany: vi.fn() },
    voucher: { findMany: vi.fn() },
    giftCard: { findMany: vi.fn() },
  };
}

function approveBusiness(db: ReturnType<typeof createDatabase>) {
  db.business.findFirst.mockResolvedValue({
    slug: "beautyfeel",
    name: "BeautyFeel",
    initials: "BF",
  });
}

describe("owner catalog preview read contracts", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects malformed requests and non-owner actors before querying catalog data", async () => {
    await expect(
      resolveOwnerCatalogPreviewReadModel(
        "services",
        "../beautyfeel",
        "owner-user-a",
      ),
    ).resolves.toBeNull();
    expect(resolveContext).not.toHaveBeenCalled();

    resolveContext.mockResolvedValue({
      success: true,
      actorType: "EMPLOYEE",
    });
    await expect(
      resolveOwnerCatalogPreviewReadModel(
        "services",
        "beautyfeel",
        "employee-user-a",
      ),
    ).resolves.toBeNull();
  });

  it("fails closed when the current owner membership no longer exists", async () => {
    const db = createDatabase();
    db.business.findFirst.mockResolvedValue(null);

    await expect(
      getOwnerCatalogPreviewReadModel(context, "services", {
        db: db as never,
        now: new Date("2026-09-23T04:00:00.000Z"),
      }),
    ).resolves.toBeNull();

    expect(db.business.findFirst).toHaveBeenCalledWith({
      where: {
        id: context.businessId,
        slug: context.businessSlug,
        owners: {
          some: {
            id: context.ownerId,
            business_id: context.businessId,
            user_id: context.userId,
            user: { role: "OWNER" },
          },
        },
      },
      select: { slug: true, name: true, initials: true },
    });
    expect(db.service.findMany).not.toHaveBeenCalled();
  });

  it("maps service metrics and scopes both catalog and booking history to the owner tenant", async () => {
    const db = createDatabase();
    approveBusiness(db);
    db.service.findMany.mockResolvedValue([
      {
        id: 1,
        name: "Haircut",
        description: "Cut and finish",
        category: "Hair",
        price: 1000,
        estimated_cost: 250,
        duration: 60,
        availed_services: [{ id: 10 }, { id: 11 }],
      },
      {
        id: 2,
        name: "Consultation",
        description: null,
        category: "Hair",
        price: 0,
        estimated_cost: 0,
        duration: null,
        availed_services: [],
      },
    ]);

    const result = await getOwnerCatalogPreviewReadModel(context, "services", {
      db: db as never,
      now: new Date("2026-09-23T04:00:00.000Z"),
    });

    expect(result).toMatchObject({
      section: "services",
      business: { slug: "beautyfeel", name: "BeautyFeel", initials: "BF" },
      categories: ["Hair"],
      metrics: {
        totalServices: 2,
        monthlyBookings: 2,
        averageMarginPercent: 37.5,
        averageDurationMinutes: 60,
      },
    });
    expect(db.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          business_id: context.businessId,
          business: {
            owners: {
              some: expect.objectContaining({ user_id: context.userId }),
            },
          },
        }),
        select: expect.objectContaining({
          availed_services: {
            where: expect.objectContaining({
              booking: {
                business_id: context.businessId,
                status: { in: ["ACCEPTED", "COMPLETED"] },
              },
            }),
            select: { id: true },
          },
        }),
      }),
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("derives package pricing and unique monthly sales from tenant-owned rows", async () => {
    const db = createDatabase();
    approveBusiness(db);
    db.service.findMany.mockResolvedValue([
      {
        id: 1,
        name: "Haircut",
        description: null,
        category: "Hair",
        price: 1000,
        estimated_cost: 200,
        duration: 60,
        availed_services: [],
      },
    ]);
    db.servicePackage.findMany.mockResolvedValue([
      {
        id: 20,
        name: "Hair Pair",
        description: "Two services",
        category: "Hair",
        price: 1500,
        duration: 90,
        items: [
          {
            custom_price: 800,
            service: {
              id: 1,
              name: "Haircut",
              category: "Hair",
              duration: 60,
              price: 1000,
            },
          },
          {
            custom_price: 900,
            service: {
              id: 2,
              name: "Treatment",
              category: "Hair",
              duration: 30,
              price: 1000,
            },
          },
        ],
        availed_services: [
          { booking_id: 1 },
          { booking_id: 1 },
          { booking_id: 2 },
        ],
      },
    ]);

    const result = await getOwnerCatalogPreviewReadModel(context, "packages", {
      db: db as never,
      now: new Date("2026-09-23T04:00:00.000Z"),
    });

    expect(result).toMatchObject({
      section: "packages",
      metrics: {
        totalPackages: 1,
        monthlySales: 2,
        monthlyRevenue: 3000,
        averageSavingsPercent: 25,
      },
      packages: [
        {
          id: 20,
          originalPrice: 2000,
          monthlySales: 2,
          services: [
            expect.objectContaining({ id: 1, packageItemPrice: 800 }),
            expect.objectContaining({ id: 2, packageItemPrice: 900 }),
          ],
        },
      ],
    });
    expect(
      db.servicePackage.findMany.mock.calls[0][0].select.items.where.service
        .business_id,
    ).toBe(context.businessId);
  });

  it("maps voucher and gift-card lifecycle without inventing unsupported balances", async () => {
    const db = createDatabase();
    approveBusiness(db);
    const now = new Date("2026-09-23T04:00:00.000Z");
    db.voucher.findMany.mockResolvedValue([
      {
        id: 1,
        code: "ACTIVE",
        type: "PERCENTAGE",
        value: 10,
        minimum_amount: 100,
        expires_at: new Date("2026-10-01T00:00:00.000Z"),
        is_active: true,
        used_by_id: null,
      },
      {
        id: 2,
        code: "ARCHIVED",
        type: "FLAT",
        value: 50,
        minimum_amount: 0,
        expires_at: new Date("2026-10-01T00:00:00.000Z"),
        is_active: false,
        used_by_id: null,
      },
      {
        id: 3,
        code: "USED",
        type: "FLAT",
        value: 50,
        minimum_amount: 0,
        expires_at: new Date("2026-10-01T00:00:00.000Z"),
        is_active: true,
        used_by_id: 99,
      },
    ]);

    const vouchers = await getOwnerCatalogPreviewReadModel(
      context,
      "vouchers",
      { db: db as never, now },
    );
    expect(vouchers).toMatchObject({
      section: "vouchers",
      metrics: { activeVouchers: 1, redemptions: 1, archivedVouchers: 1 },
      vouchers: [
        { code: "ACTIVE", status: "active" },
        { code: "ARCHIVED", status: "archived" },
        { code: "USED", status: "used" },
      ],
    });

    db.giftCard.findMany.mockResolvedValue([
      {
        id: 10,
        code: "BF-ABCDE",
        customer_name: "Ana",
        customer_email: "ana@example.com",
        customer_phone: null,
        expires_at: new Date("2026-10-01T00:00:00.000Z"),
        is_claimed: false,
        claimed_at: null,
        included_services: [{ service: { id: 1, name: "Haircut" } }],
        included_packages: [{ package: { id: 2, name: "Hair Pair" } }],
      },
    ]);
    db.service.findMany.mockResolvedValue([
      { id: 1, name: "Haircut", category: "Hair" },
    ]);
    db.servicePackage.findMany.mockResolvedValue([
      { id: 2, name: "Hair Pair", category: "Hair" },
    ]);

    const giftCards = await getOwnerCatalogPreviewReadModel(
      context,
      "gift-cards",
      { db: db as never, now },
    );
    expect(giftCards).toMatchObject({
      section: "gift-cards",
      metrics: {
        totalGiftCards: 1,
        activeGiftCards: 1,
        claimedGiftCards: 0,
        expiredGiftCards: 0,
      },
      giftCards: [
        {
          code: "BF-ABCDE",
          recipientName: "Ana",
          status: "active",
          includedServices: [{ id: 1, name: "Haircut" }],
          includedPackages: [{ id: 2, name: "Hair Pair" }],
        },
      ],
    });
    expect(JSON.stringify(giftCards)).not.toContain("balance");
    expect(JSON.stringify(giftCards)).not.toContain("sender");
  });
});
