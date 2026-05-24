import { describe, expect, it, vi } from "vitest";
import { buildBookingPricingSnapshot } from "./booking-pricing";

function createMockDb() {
  return {
    business: {
      findUnique: vi.fn(),
    },
    service: {
      findMany: vi.fn(),
    },
    packageItem: {
      findMany: vi.fn(),
    },
    servicePackage: {
      findMany: vi.fn(),
    },
    saleEvent: {
      findMany: vi.fn(),
    },
    voucher: {
      findUnique: vi.fn(),
    },
  };
}

describe("buildBookingPricingSnapshot", () => {
  it("uses canonical DB prices and ignores client-tampered pricing", async () => {
    const db = createMockDb();

    db.business.findUnique.mockResolvedValue({
      id: "biz_1",
      slug: "beautyfeel",
      name: "BeautyFeel",
      commission_calculation_basis: "ORIGINAL_PRICE",
    });
    db.service.findMany.mockResolvedValue([
      { id: 1, name: "Haircut", price: 500, estimated_cost: 180, duration: 45 },
    ]);
    db.packageItem.findMany.mockResolvedValue([]);
    db.servicePackage.findMany.mockResolvedValue([]);
    db.saleEvent.findMany.mockResolvedValue([]);
    db.voucher.findUnique.mockResolvedValue(null);

    const snapshot = await buildBookingPricingSnapshot({
      db: db as never,
      businessSlug: "beautyfeel",
      scheduledAt: new Date("2026-02-10T10:00:00.000Z"),
      services: [{ id: 1, quantity: 1, price: 1 } as never],
      paymentMethod: "CASH",
      paymentType: "FULL",
    });

    expect(snapshot.services[0].originalPrice).toBe(500);
    expect(snapshot.services[0].price).toBe(500);
    expect(snapshot.services[0].estimatedCost).toBe(180);
    expect(snapshot.subtotal).toBe(500);
    expect(snapshot.grandTotal).toBe(500);
  });

  it("applies package-level flat discounts proportionally across package items", async () => {
    const db = createMockDb();

    db.business.findUnique.mockResolvedValue({
      id: "biz_1",
      slug: "beautyfeel",
      name: "BeautyFeel",
      commission_calculation_basis: "DISCOUNTED_PRICE",
    });
    db.service.findMany.mockResolvedValue([
      { id: 10, name: "Service A", price: 700, estimated_cost: 280, duration: 30 },
      { id: 11, name: "Service B", price: 300, estimated_cost: 90, duration: 30 },
    ]);
    db.packageItem.findMany.mockResolvedValue([
      { package_id: 1, service_id: 10, custom_price: 700 },
      { package_id: 1, service_id: 11, custom_price: 300 },
    ]);
    db.servicePackage.findMany.mockResolvedValue([{ id: 1, price: 1000 }]);
    db.saleEvent.findMany.mockResolvedValue([
      {
        title: "Package Promo",
        discount_type: "FLAT",
        discount_value: 200,
        applicable_services: [],
        applicable_packages: [{ id: 1 }],
      },
    ]);
    db.voucher.findUnique.mockResolvedValue(null);

    const snapshot = await buildBookingPricingSnapshot({
      db: db as never,
      businessSlug: "beautyfeel",
      scheduledAt: new Date("2026-02-10T10:00:00.000Z"),
      services: [
        { id: 10, quantity: 1, packageId: 1 },
        { id: 11, quantity: 1, packageId: 1 },
      ],
      paymentMethod: "CASH",
      paymentType: "FULL",
    });

    expect(snapshot.services[0].price).toBe(560);
    expect(snapshot.services[0].estimatedCost).toBe(280);
    expect(snapshot.services[1].price).toBe(240);
    expect(snapshot.services[1].estimatedCost).toBe(90);
    expect(snapshot.subtotal).toBe(800);
  });

  // Regression: voucher submit was failing with "Invalid or expired
  // voucher code" when the DB row was stored case-sensitively
  // ("BF-summer2026") because the snapshot upper-cased the lookup.
  // Voucher creation + verify now normalize on the way in, so the
  // snapshot's uppercase lookup is the canonical contract -- this
  // test pins it so we don't regress.
  it("looks up the voucher by uppercase code regardless of caller casing", async () => {
    const db = createMockDb();

    db.business.findUnique.mockResolvedValue({
      id: "biz_1",
      slug: "beautyfeel",
      name: "BeautyFeel",
      commission_calculation_basis: "ORIGINAL_PRICE",
    });
    db.service.findMany.mockResolvedValue([
      { id: 1, name: "Haircut", price: 500, estimated_cost: 180, duration: 45 },
    ]);
    db.packageItem.findMany.mockResolvedValue([]);
    db.servicePackage.findMany.mockResolvedValue([]);
    db.saleEvent.findMany.mockResolvedValue([]);

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    db.voucher.findUnique.mockResolvedValue({
      id: 42,
      code: "BF-SUMMER2026",
      type: "PERCENTAGE",
      value: 20,
      minimum_amount: 0,
      is_active: true,
      used_by_id: null,
      expires_at: futureDate,
      business: { slug: "beautyfeel" },
    });

    const snapshot = await buildBookingPricingSnapshot({
      db: db as never,
      businessSlug: "beautyfeel",
      scheduledAt: new Date("2026-02-10T10:00:00.000Z"),
      services: [{ id: 1, quantity: 1, price: 1 } as never],
      paymentMethod: "CASH",
      paymentType: "FULL",
      // Caller passes mixed-case; snapshot must normalize.
      voucherCode: "bf-Summer2026",
    });

    expect(db.voucher.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: "BF-SUMMER2026" } }),
    );
    expect(snapshot.voucher?.id).toBe(42);
    expect(snapshot.voucherDiscount).toBe(100); // 20% of 500
    expect(snapshot.grandTotal).toBe(400);
  });

  it("rejects voucher when DB returns null after normalize", async () => {
    const db = createMockDb();

    db.business.findUnique.mockResolvedValue({
      id: "biz_1",
      slug: "beautyfeel",
      name: "BeautyFeel",
      commission_calculation_basis: "ORIGINAL_PRICE",
    });
    db.service.findMany.mockResolvedValue([
      { id: 1, name: "Haircut", price: 500, estimated_cost: 180, duration: 45 },
    ]);
    db.packageItem.findMany.mockResolvedValue([]);
    db.servicePackage.findMany.mockResolvedValue([]);
    db.saleEvent.findMany.mockResolvedValue([]);
    db.voucher.findUnique.mockResolvedValue(null);

    await expect(
      buildBookingPricingSnapshot({
        db: db as never,
        businessSlug: "beautyfeel",
        scheduledAt: new Date("2026-02-10T10:00:00.000Z"),
        services: [{ id: 1, quantity: 1, price: 1 } as never],
        paymentMethod: "CASH",
        paymentType: "FULL",
        voucherCode: "BF-NONEXISTENT",
      }),
    ).rejects.toThrow("Invalid or expired voucher code");
  });
});
