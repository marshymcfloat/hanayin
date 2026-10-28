import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessStructure, Role, StaffProfile } from "@/prisma/generated/prisma/enums";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), booking: vi.fn(), business: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/prisma/prisma", () => ({ prisma: {
  booking: { findFirst: mocks.booking }, business: { findUnique: mocks.business }, user: { findUnique: mocks.user },
} }));
import { getBookingDetailAction } from "./booking-detail";

const created = new Date("2026-09-16T02:00:00.000Z");
const scheduled = new Date("2026-09-16T03:00:00.000Z");
function fixture() {
  return {
    id: 12, status: "ACCEPTED", business_id: "biz_a",
    customer: { id: "customer_a", name: "Customer", email: "customer@example.test", phone: "09000000000", trust_tier: "TRUSTED", no_show_count: 1, business_id: "biz_a", internal: "omit" },
    is_anonymous_walk_in: false, customer_label: "Counter customer", payment_method: "GCASH", payment_status: "PARTIALLY_PAID",
    amount_paid: 100, grand_total: 500, total_discount: 10, downpayment: 100, downpayment_status: "ACCEPTED",
    created_at: created, scheduled_at: scheduled, estimated_end: new Date("2026-09-16T04:00:00.000Z"), hold_expires_at: new Date("2026-09-16T05:00:00.000Z"), cancelled_at: null,
    payments: [{ id: 32, type: "DOWNPAYMENT", status: "PENDING", payment_method: "GCASH", amount_principal: 100, payer_name: "Payer", provider_reference: "ref", submitted_at: null, verified_at: null, verified_by: null, paid_at: null, escalated_at: null, escalation_reason: null, rejection_reason: null, resolution_outcome: null, resolution_note: null, void_reason: null, metadata: { secret: "omit" } }],
    vouchers: [{ id: 1, code: "SAVE", value: 10, business_id: "biz_a" }],
    availed_services: [
      { id: 21, served_by_id: 7, service: { id: 5, name: "Cut", category: "Hair", business_id: "biz_a", estimated_cost: 100 }, served_by: { id: 7, user: { name: "Employee", password: "omit", contact_number: "omit" } }, served_by_owner: null, final_price: 490, discount: 10, price: 500, status: "SERVING", internal: "omit" },
      { id: 22, served_by_id: null, service: { id: 6, name: "Style", category: "Hair" }, served_by: null, served_by_owner: { id: 8, user: { name: "Owner", password: "omit" } }, final_price: 0, discount: 0, price: 0, status: "PENDING" },
    ], private_field: "omit",
  };
}

describe("booking detail read boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "user_a" } } });
    mocks.actor.mockResolvedValue({ success: true, businessId: "biz_a", businessSlug: "tenant-a", userId: "user_a", actorType: "OWNER", ownerId: 8 });
    mocks.booking.mockResolvedValue(fixture());
  });

  it("preserves lazy-panel detail mapping and excludes internal nested fields", async () => {
    expect(await getBookingDetailAction(12)).toEqual({ success: true, booking: {
      id: 12, status: "ACCEPTED", business_id: "biz_a",
      customer: { id: "customer_a", name: "Customer", email: "customer@example.test", phone: "09000000000", trust_tier: "TRUSTED", no_show_count: 1 },
      is_anonymous_walk_in: false, customer_label: "Counter customer", payment_method: "GCASH", payment_status: "PARTIALLY_PAID",
      amount_paid: 100, grand_total: 500, total_discount: 10, downpayment: 100, downpayment_status: "ACCEPTED",
      created_at: "2026-09-16T02:00:00.000Z", scheduled_at: "2026-09-16T03:00:00.000Z", estimated_end: "2026-09-16T04:00:00.000Z",
      hold_expires_at: "2026-09-16T05:00:00.000Z", cancelled_at: null,
      payments: [{ id: 32, type: "DOWNPAYMENT", status: "PENDING", payment_method: "GCASH", amount_principal: 100, payer_name: "Payer", provider_reference: "ref", submitted_at: null, verified_at: null, verified_by: null, paid_at: null, escalated_at: null, escalation_reason: null, rejection_reason: null, resolution_outcome: null, resolution_note: null, void_reason: null }],
      vouchers: [{ id: 1, code: "SAVE" }],
      availed_services: [
        { id: 21, served_by_id: 7, service: { id: 5, name: "Cut", category: "Hair" }, served_by: { id: 7, user: { name: "Employee" } }, served_by_owner: null, final_price: 490, discount: 10, price: 500, status: "SERVING" },
        { id: 22, served_by_id: null, service: { id: 6, name: "Style", category: "Hair" }, served_by: null, served_by_owner: { id: 8, user: { name: "Owner" } }, final_price: 0, discount: 0, price: 0, status: "PENDING" },
      ],
    } });
  });

  it("preserves null dates, customer, assignments and empty collections", async () => {
    mocks.booking.mockResolvedValue({ ...fixture(), customer: null, scheduled_at: null, estimated_end: null, hold_expires_at: null, cancelled_at: null, payments: [], vouchers: [], availed_services: [], is_anonymous_walk_in: true, customer_label: null, downpayment: null, downpayment_status: null });
    expect(await getBookingDetailAction(12)).toEqual({ success: true, booking: expect.objectContaining({ customer: null, scheduled_at: null, estimated_end: null, hold_expires_at: null, cancelled_at: null, payments: [], vouchers: [], availed_services: [], is_anonymous_walk_in: true, customer_label: null, downpayment: null, downpayment_status: null }) });
  });

  it("returns not found for another tenant's booking ID", async () => {
    mocks.booking.mockResolvedValue(null);
    expect(await getBookingDetailAction(12)).toEqual({ success: false, error: "Booking not found" });
    expect(mocks.booking).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 12, business_id: "biz_a" } }));
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, 2147483648, "12", null, undefined])("rejects invalid ID %s before authentication", async bookingId => {
    expect(await getBookingDetailAction(bookingId as number)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.booking).not.toHaveBeenCalled();
  });

  it("accepts the maximum positive 32-bit ID and uses only verified tenant identity", async () => {
    await getBookingDetailAction(2147483647);
    expect(mocks.actor).toHaveBeenCalledExactlyOnceWith("tenant-a", "user_a");
    expect(mocks.booking).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2147483647, business_id: "biz_a" } }));
    expect(mocks.auth).toHaveBeenCalledWith();
  });

  it.each(["Unauthorized", "Forbidden"])("preserves safe authentication denial %s without queries", async error => {
    mocks.auth.mockResolvedValue({ success: false, error });
    expect(await getBookingDetailAction(12)).toEqual({ success: false, error });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.booking).not.toHaveBeenCalled();
  });

  it.each(["Unauthorized", "Forbidden"])("preserves current actor denial %s without booking queries", async error => {
    mocks.actor.mockResolvedValue({ success: false, error });
    expect(await getBookingDetailAction(12)).toEqual({ success: false, error });
    expect(mocks.booking).not.toHaveBeenCalled();
  });

  it.each([
    { stage: "authentication", mock: mocks.auth },
    { stage: "actor resolution", mock: mocks.actor },
    { stage: "booking persistence", mock: mocks.booking },
  ])("returns a safe error on $stage failure", async ({ mock }) => {
    mock.mockRejectedValue(new Error("private sql/connection details"));
    expect(await getBookingDetailAction(12)).toEqual({ success: false, error: "Failed to fetch booking details" });
  });

  it("returns a safe mapping error instead of exposing a date failure", async () => {
    mocks.booking.mockResolvedValue({ ...fixture(), created_at: new Date("invalid") });
    expect(await getBookingDetailAction(12)).toEqual({ success: false, error: "Failed to fetch booking details" });
  });

  it("requests exactly the panel fields, never complete user records", async () => {
    await getBookingDetailAction(12);
    expect(mocks.booking).toHaveBeenCalledExactlyOnceWith({
      where: { id: 12, business_id: "biz_a" },
      select: {
        id: true, status: true, business_id: true,
        customer: { select: { id: true, name: true, email: true, phone: true, trust_tier: true, no_show_count: true } },
        is_anonymous_walk_in: true, customer_label: true, payment_method: true,
        payment_status: true, amount_paid: true, grand_total: true, total_discount: true,
        downpayment: true, downpayment_status: true, scheduled_at: true,
        estimated_end: true, created_at: true, hold_expires_at: true, cancelled_at: true,
        vouchers: { select: { id: true, code: true } },
        payments: { orderBy: { created_at: "desc" }, select: { id: true, type: true, status: true, payment_method: true, amount_principal: true, payer_name: true, provider_reference: true, submitted_at: true, verified_at: true, paid_at: true, escalated_at: true, escalation_reason: true, rejection_reason: true, resolution_outcome: true, resolution_note: true, void_reason: true, verified_by: { select: { name: true } } } },
        availed_services: { select: {
          id: true, served_by_id: true, final_price: true, discount: true, price: true, status: true,
          service: { select: { id: true, name: true, category: true } },
          served_by: { select: { id: true, user: { select: { name: true } } } },
          served_by_owner: { select: { id: true, user: { select: { name: true } } } },
        } },
      },
    });
  });

  describe("real current actor resolution", () => {
    beforeEach(async () => {
      const actual = await vi.importActual<typeof import("@/lib/auth/staff-access")>("@/lib/auth/staff-access");
      mocks.actor.mockImplementation(actual.resolveTenantActorContext);
      mocks.business.mockResolvedValue({ id: "biz_a", slug: "tenant-a", structure: BusinessStructure.MANAGER_LED, allow_employee_self_booking: false, manager_can_serve: false });
      mocks.user.mockResolvedValue({ id: "user_a", role: Role.OWNER, owner: { id: 8, business_id: "biz_a" }, employee: null });
    });

    it("permits a current owner and does not add a subscription write gate", async () => {
      expect((await getBookingDetailAction(12)).success).toBe(true);
      expect(mocks.auth).toHaveBeenCalledExactlyOnceWith();
    });

    it.each([StaffProfile.STAFF, StaffProfile.MANAGER, StaffProfile.CASHIER])("permits a current %s employee without new operational permission requirements", async profile => {
      mocks.user.mockResolvedValue({ id: "user_a", role: Role.EMPLOYEE, owner: null, employee: { id: 7, business_id: "biz_a", profile, permissions: [] } });
      expect((await getBookingDetailAction(12)).success).toBe(true);
      expect(mocks.booking).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 12, business_id: "biz_a" } }));
    });

    it("rejects platform administrators even if a stale tenant slug or owner row remains", async () => {
      mocks.user.mockResolvedValue({ id: "user_a", role: Role.PLATFORM_ADMIN, owner: { id: 8, business_id: "biz_a" }, employee: null });
      expect(await getBookingDetailAction(12)).toEqual({ success: false, error: "Forbidden" });
      expect(mocks.booking).not.toHaveBeenCalled();
    });

    it.each(["business", "user"])("rejects a missing current %s", async source => {
      (source === "business" ? mocks.business : mocks.user).mockResolvedValue(null);
      expect(await getBookingDetailAction(12)).toEqual({ success: false, error: "Unauthorized" });
      expect(mocks.booking).not.toHaveBeenCalled();
    });

    it.each([
      { label: "removed owner membership", role: Role.OWNER, owner: null, employee: null },
      { label: "foreign owner membership", role: Role.OWNER, owner: { id: 8, business_id: "biz_b" }, employee: null },
      { label: "removed employee membership", role: Role.EMPLOYEE, owner: null, employee: null },
      { label: "foreign employee membership", role: Role.EMPLOYEE, owner: null, employee: { id: 7, business_id: "biz_b", profile: StaffProfile.STAFF, permissions: [] } },
      { label: "stale owner role", role: Role.EMPLOYEE, owner: { id: 8, business_id: "biz_a" }, employee: null },
    ])("rejects $label before the booking read", async user => {
      mocks.user.mockResolvedValue({ id: "user_a", ...user });
      expect(await getBookingDetailAction(12)).toEqual({ success: false, error: "Forbidden" });
      expect(mocks.booking).not.toHaveBeenCalled();
    });
  });
});
