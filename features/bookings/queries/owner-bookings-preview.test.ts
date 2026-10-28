import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  business: { findFirst: vi.fn() },
  booking: { count: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
  bookingPayment: { count: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/prisma/prisma", () => ({ prisma: db }));

import { getOwnerBookingsPreviewList, getOwnerBookingsPreviewSummary } from "./owner-bookings-preview";

const actor = {
  success: true as const, actorType: "OWNER" as const, ownerId: 7,
  businessId: "business-a", businessSlug: "studio-a", userId: "owner-a",
  role: "OWNER", businessPolicy: {}, profile: null, permissions: [], employeeId: null,
};

describe("owner bookings preview read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.business.findFirst.mockResolvedValue({ id: "business-a" });
    db.booking.count.mockResolvedValue(0);
    db.booking.findMany.mockResolvedValue([]);
    db.booking.aggregate.mockResolvedValue({ _sum: { grand_total: 0, amount_paid: 0 } });
    db.bookingPayment.count.mockResolvedValue(0);
    db.bookingPayment.findFirst.mockResolvedValue(null);
  });

  it("denies revoked owners before touching booking or payment data", async () => {
    db.business.findFirst.mockResolvedValue(null);
    expect(await getOwnerBookingsPreviewSummary(actor as never, "2026-09-28")).toBeNull();
    expect(db.booking.count).not.toHaveBeenCalled();
    expect(db.bookingPayment.count).not.toHaveBeenCalled();
    expect(db.business.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "business-a", slug: "studio-a", owners: { some: expect.objectContaining({ id: 7, business_id: "business-a", user_id: "owner-a" }) },
    } }));
  });

  it("scopes and paginates the selected PH day with a narrow booking projection", async () => {
    db.booking.count.mockResolvedValue(26);
    db.booking.findMany.mockResolvedValue([{ id: 12, status: "HOLD", payment_status: "UNPAID", payment_method: "GCASH", is_anonymous_walk_in: true, customer_label: "Walk-in 3", customer: null, scheduled_at: new Date("2026-09-27T16:00:00Z"), estimated_end: null, grand_total: 450, amount_paid: 0, availed_services: [{ service: { name: "Lash lift" }, served_by: null, served_by_owner: null }], payments: [{ status: "PENDING", submitted_at: null, escalated_at: null }] }]);
    const result = await getOwnerBookingsPreviewList(actor as never, { date: "2026-09-28", status: "HOLD", q: "lash", page: 2 });
    expect(result).toMatchObject({ totalCount: 26, pageSize: 25, totalPages: 2, bookings: [{ customerName: "Walk-in: Walk-in 3", paymentStage: "AWAITING_PAYMENT", services: ["Lash lift"] }] });
    expect(db.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 25, take: 25,
      where: expect.objectContaining({ business_id: "business-a", status: "HOLD", scheduled_at: { gte: new Date("2026-09-27T16:00:00Z"), lt: new Date("2026-09-28T16:00:00Z") }, business: expect.objectContaining({ owners: { some: expect.objectContaining({ user_id: "owner-a" }) } }) }),
      select: expect.objectContaining({ customer: { select: { name: true } }, payments: expect.objectContaining({ take: 1 }) }),
    }));
    expect(JSON.stringify(result)).not.toContain("business-a");
  });

  it("lists all tenant bookings without a date while keeping newest appointments first", async () => {
    await getOwnerBookingsPreviewList(actor as never, { date: undefined, status: "ALL", q: "", page: 1 });
    expect(db.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ business_id: "business-a", business: expect.objectContaining({ owners: { some: expect.objectContaining({ user_id: "owner-a" }) } }) }),
      orderBy: [{ scheduled_at: "desc" }, { id: "desc" }],
    }));
    expect(db.booking.findMany.mock.calls[0][0].where).not.toHaveProperty("scheduled_at");
  });

  it("counts only submitted pending GCash payments on held same-tenant bookings", async () => {
    db.booking.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    db.booking.aggregate.mockResolvedValueOnce({ _sum: { amount_paid: 200 } }).mockResolvedValueOnce({ _sum: { grand_total: 800, amount_paid: 200 } });
    db.bookingPayment.count.mockResolvedValue(2);
    db.bookingPayment.findFirst.mockResolvedValue({ amount_principal: 100, escalated_at: null, booking: { id: 9, scheduled_at: null, customer: { name: "Mara" }, customer_label: null, is_anonymous_walk_in: false, availed_services: [{ service: { name: "Facial" } }] } });
    const result = await getOwnerBookingsPreviewSummary(actor as never, "2026-09-28");
    expect(result).toMatchObject({ totalBookings: 3, acceptedCount: 1, holdCount: 1, amountReceived: 200, openBalance: 600, pendingGcashCount: 2, pendingGcash: { bookingId: 9, customerName: "Mara", amount: 100 } });
    expect(db.bookingPayment.count).toHaveBeenCalledWith({ where: expect.objectContaining({ status: "PENDING", payment_method: "GCASH", submitted_at: { not: null }, booking: expect.objectContaining({ business_id: "business-a", status: "HOLD" }) }) });
    expect(JSON.stringify(result)).not.toContain("business-a");
  });
});
