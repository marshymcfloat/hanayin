import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { prisma } from "@/prisma/prisma";
import { createBookingInDb, type BookingServiceParams } from "@/features/bookings/services/booking-persistence";
import { createOtpVerificationProof } from "@/features/bookings/services/otp-proof";
import { createBookingSuccessToken } from "@/lib/security/booking-success-token";
import { requireAuth } from "@/lib/auth/guards";
import { cancelBookingAction, rescheduleBookingAction } from "@/features/bookings/actions/booking-modify";
import { cancelBookingByCustomerAction, rescheduleBookingByCustomerAction } from "@/features/bookings/actions/booking-self-serve";

const failure = vi.hoisted(() => ({ event: "", reached: false }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/data/cached", () => ({
  getCachedBusinessWithHoursAndEmployees: vi.fn(() => {
    throw new Error("Fixture must use the real transaction-local availability query");
  }),
}));
vi.mock("@/lib/services/sms-otp", async original => ({
  ...await original<typeof import("@/lib/services/sms-otp")>(),
  sendSemaphoreOtp: vi.fn(() => { throw new Error("Live SMS forbidden"); }),
}));
vi.mock("@/lib/services/outbox", async original => {
  const actual = await original<typeof import("@/lib/services/outbox")>();
  return { ...actual, publishEvent: async (...args: Parameters<typeof actual.publishEvent>) => {
    const result = await actual.publishEvent(...args);
    if (args[1].type === failure.event) {
      failure.reached = true;
      throw new Error("Fixture failure after real outbox insertion");
    }
    return result;
  } };
});

requireTestDatabase();
const now = new Date("2030-01-15T01:00:00.000Z");
const scheduledAt = new Date("2030-01-17T01:00:00.000Z");
const newScheduledAt = new Date("2030-01-18T02:00:00.000Z");
const namespace = `integration-booking-core-${randomUUID()}`;
const factory = createSharedWorkflowFactory({ namespace, now });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const tenants = [business.id, foreign.id];
const owner = factory.user({ contactNumber: `${namespace}-owner` });
const staff = factory.user({ id: `${namespace}-staff`, contactNumber: `${namespace}-staff`, role: "EMPLOYEE" });
const customer = factory.customer({ phone: "639171234567", email: `${namespace}@example.test` });
const foreignCustomer = factory.customer({ id: `${customer.id}-foreign`, businessId: foreign.id, phone: customer.phone });
let serviceId: number;
let foreignServiceId: number;
let employeeId: number;
let bookingId: number;
let lineId: number;
let voucherId: number;
let otpId: number;

async function cleanup() {
  try {
    await prisma.auditLog.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.outboxMessage.deleteMany({ where: { business_id: { in: tenants } } });
  }
  finally {
    try { await prisma.business.deleteMany({ where: { id: { in: tenants } } }); }
    finally { await prisma.user.deleteMany({ where: { id: { in: [owner.id, staff.id] } } }); }
  }
}
function creation(overrides: Partial<BookingServiceParams> = {}): BookingServiceParams {
  return {
    businessSlug: business.slug, customerId: customer.id, customerName: customer.name,
    services: [{ id: serviceId, quantity: 1, price: 1, duration: 1 }],
    scheduledAt, estimatedEnd: new Date(scheduledAt.getTime() + 60_000),
    paymentMethod: "CASH", paymentType: "FULL", ...overrides,
  };
}
function manageInput(purpose: "manage" | "details" = "manage", ttlSeconds?: number) {
  return {
    bookingId, businessSlug: business.slug,
    token: createBookingSuccessToken({ bookingId, businessSlug: business.slug, purpose, ttlSeconds }),
  };
}
function authenticated(userId = owner.id) {
  vi.mocked(requireAuth).mockResolvedValue({
    success: true, businessSlug: business.slug,
    session: { expires: "2030-02-01T00:00:00Z", user: { id: userId, role: userId === owner.id ? "OWNER" : "EMPLOYEE", businessSlug: business.slug } },
  });
}
const target = () => prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
const lines = () => prisma.availedService.findMany({ where: { booking_id: bookingId }, orderBy: { id: "asc" } });
const voucher = () => prisma.voucher.findUniqueOrThrow({ where: { id: voucherId } });
const events = () => prisma.outboxMessage.findMany({ where: { business_id: { in: tenants } }, orderBy: { id: "asc" } });
const audits = () => prisma.auditLog.findMany({ where: { business_id: { in: tenants } }, orderBy: { id: "asc" } });
async function snapshot() { return { booking: await target(), lines: await lines(), voucher: await voucher(), events: await events(), audits: await audits() }; }

describe("original booking workflows on guarded disposable PostgreSQL", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    vi.stubEnv("BOOKING_SUCCESS_TOKEN_SECRET", "booking-core-integration-fixture-secret");
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Live provider network forbidden"); }));
    try {
      for (const tenant of [business, foreign]) await prisma.business.create({ data: {
        id: tenant.id, slug: tenant.slug, name: tenant.name, initials: tenant.initials,
        booking_horizon_days: 30, booking_min_lead_minutes: 30, booking_slot_interval_minutes: 30,
        timezone: "Asia/Manila", gcash_account_name: "Fixture account", gcash_mobile_number: "09170000000",
        business_hours: { create: Array.from({ length: 7 }, (_, day) => ({ day_of_week: day, category: "GENERAL", open_time: "09:00", close_time: "18:00" })) },
      } });
      for (const user of [owner, staff]) await prisma.user.create({ data: {
        id: user.id, name: user.name, contact_number: user.contactNumber, role: user.role, hashed_password: user.hashedPassword,
      } });
      await prisma.owner.create({ data: { user_id: owner.id, business_id: business.id } });
      employeeId = (await prisma.employee.create({ data: { user_id: staff.id, business_id: business.id, salary: 0, profile: "STAFF", specialties: ["GENERAL"] } })).id;
      for (const record of [customer, foreignCustomer]) await prisma.customer.create({ data: {
        id: record.id, business_id: record.businessId, name: record.name, email: record.email, phone: record.phone,
      } });
      const service = factory.service({ duration: 30, price: 500 });
      for (const tenant of [business, foreign]) {
        const record = await prisma.service.create({ data: { business_id: tenant.id, name: service.name, category: service.category, duration: service.duration, price: service.price, estimated_cost: 100 } });
        if (tenant.id === business.id) serviceId = record.id; else foreignServiceId = record.id;
      }
    } catch (error) { await cleanup(); throw error; }
  });
  beforeEach(async () => {
    failure.event = ""; failure.reached = false;
    authenticated();
    await prisma.auditLog.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.outboxMessage.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.voucher.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.booking.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.bookingOtpCode.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.customer.deleteMany({ where: { business_id: business.id, id: { not: customer.id } } });
    await prisma.customer.update({ where: { id: customer.id }, data: { name: customer.name, email: customer.email, phone: customer.phone } });
    await prisma.user.update({ where: { id: owner.id }, data: { role: "OWNER" } });
    await prisma.user.update({ where: { id: staff.id }, data: { role: "EMPLOYEE" } });
    await prisma.employee.update({ where: { id: employeeId }, data: { business_id: business.id, profile: "STAFF", permissions: ["BOOKING_MODIFY", "BOOKING_CANCEL"] } });
    await prisma.businessHours.updateMany({ where: { business_id: business.id }, data: { is_closed: false } });
    bookingId = (await prisma.booking.create({ data: {
      business_id: business.id, customer_id: customer.id, status: "ACCEPTED", grand_total: 500, total_discount: 0,
      scheduled_at: scheduledAt, estimated_end: new Date(scheduledAt.getTime() + 30 * 60_000),
      reminder_sent: true, reminder_sent_at: now, reminder_attempts: 2,
    } })).id;
    lineId = (await prisma.availedService.create({ data: {
      booking_id: bookingId, service_id: serviceId, status: "CLAIMED", served_by_id: employeeId, served_by_type: "EMPLOYEE", claimed_at: now,
      price: 500, final_price: 500, commission_base: 500,
      scheduled_at: scheduledAt, estimated_end: new Date(scheduledAt.getTime() + 30 * 60_000),
    } })).id;
    voucherId = (await prisma.voucher.create({ data: {
      business_id: business.id, code: namespace.toUpperCase(), type: "FLAT", value: 50,
      expires_at: new Date("2030-02-01T00:00:00Z"), used_by_id: bookingId, is_active: false,
    } })).id;
    otpId = (await prisma.bookingOtpCode.create({ data: {
      business_id: business.id, phone: customer.phone, code: "123456", verified: true, used: false,
      expires_at: new Date(now.getTime() + 10 * 60_000),
    } })).id;
  });
  afterAll(async () => {
    failure.event = "";
    try { await cleanup(); }
    finally { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); await prisma.$disconnect(); }
  });

  it("persists canonical prices, quantity-derived service times and exactly one creation outbox event", async () => {
    const start = newScheduledAt;
    const record = await createBookingInDb(creation({ scheduledAt: start, services: [{ id: serviceId, quantity: 2, price: 1, duration: 1 }] }));
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ business_id: business.id, customer_id: customer.id, status: "ACCEPTED", grand_total: 1000, amount_paid: 0, payment_status: "UNPAID", estimated_end: new Date(start.getTime() + 60 * 60_000) });
    expect(await prisma.availedService.findMany({ where: { booking_id: record.id } })).toMatchObject([{ service_id: serviceId, status: "PENDING", price: 500, final_price: 500, estimated_cost: 100, scheduled_at: start, estimated_end: new Date(start.getTime() + 60 * 60_000) }]);
    expect(await events()).toMatchObject([{ event_type: "BOOKING_CREATED", business_id: business.id, aggregate_id: String(record.id) }]);
    expect(await prisma.bookingPayment.count({ where: { booking_id: record.id } })).toBe(0);
  });
  it.each(["foreign", "missing"])("rejects a staff-supplied %s customer before any profile or booking writes", async kind => {
    const previous = await prisma.customer.findUniqueOrThrow({ where: { id: foreignCustomer.id } });
    const before = await snapshot();
    await expect(createBookingInDb(creation({
      customerId: kind === "foreign" ? foreignCustomer.id : `${namespace}-missing-customer`, scheduledAt: newScheduledAt,
      email: "must-not-update@example.test", phone: "639171234568",
    }))).rejects.toThrow("CUSTOMER_NOT_FOUND");
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: foreignCustomer.id } })).toEqual(previous);
    expect(await snapshot()).toEqual(before);
    expect(await prisma.booking.count({ where: { business_id: business.id } })).toBe(1);
  });
  it("commits public OTP claim, tenant phone identity, HOLD payment and voucher reservation together", async () => {
    await prisma.voucher.update({ where: { id: voucherId }, data: { used_by_id: null, is_active: true } });
    const record = await createBookingInDb(creation({
      scheduledAt: newScheduledAt, isPublicBooking: true, paymentMethod: "ONLINE", paymentType: "DOWNPAYMENT",
      customerId: foreignCustomer.id, customerName: "Editable public name", phone: "09171234567",
      otpVerificationId: otpId, otpVerificationToken: createOtpVerificationProof(otpId, "09171234567", business.id), voucherCode: namespace,
    }));
    expect(record).toMatchObject({ customer_id: customer.id, status: "HOLD", grand_total: 450, total_discount: 50, downpayment: 90, amount_paid: 0, payment_status: "UNPAID", hold_expires_at: new Date(now.getTime() + 30 * 60_000) });
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({ name: "Editable public name", phone: customer.phone });
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: foreignCustomer.id } })).toMatchObject({ business_id: foreign.id, name: foreignCustomer.name });
    expect(await prisma.bookingOtpCode.findUniqueOrThrow({ where: { id: otpId } })).toMatchObject({ used: true });
    expect(await voucher()).toMatchObject({ used_by_id: record.id, is_active: false });
    expect(await prisma.bookingPayment.findMany({ where: { booking_id: record.id } })).toMatchObject([{ status: "PENDING", type: "DOWNPAYMENT", amount_principal: 90, expires_at: record.hold_expires_at }]);
    expect(await events()).toMatchObject([{ event_type: "BOOKING_CREATED", aggregate_id: String(record.id) }]);
  });
  it("rolls back new customer, OTP, voucher, payment and outbox after dependent creation failure, permitting retry", async () => {
    await prisma.voucher.update({ where: { id: voucherId }, data: { used_by_id: null, is_active: true } });
    await prisma.bookingOtpCode.update({ where: { id: otpId }, data: { phone: "639171234568" } });
    const input = creation({ scheduledAt: newScheduledAt, customerId: undefined, isPublicBooking: true, paymentMethod: "ONLINE", paymentType: "DOWNPAYMENT", phone: "09171234568", otpVerificationId: otpId, otpVerificationToken: createOtpVerificationProof(otpId, "09171234568", business.id), voucherCode: namespace });
    let reached = false;
    await expect(createBookingInDb(input, { afterCreate: async (tx, created) => {
      expect(await tx.bookingPayment.count({ where: { booking_id: created.id } })).toBe(1);
      expect(await tx.outboxMessage.count({ where: { business_id: business.id } })).toBe(1);
      reached = true; throw new Error("Fixture dependent write failed");
    } })).rejects.toThrow("Fixture dependent write failed");
    expect(reached).toBe(true);
    expect(await prisma.booking.count({ where: { business_id: business.id } })).toBe(1);
    expect(await prisma.customer.count({ where: { business_id: business.id } })).toBe(1);
    expect(await prisma.bookingPayment.count({ where: { booking: { business_id: business.id } } })).toBe(0);
    expect(await events()).toEqual([]);
    expect(await voucher()).toMatchObject({ used_by_id: null, is_active: true });
    expect(await prisma.bookingOtpCode.findUniqueOrThrow({ where: { id: otpId } })).toMatchObject({ used: false });
    expect((await createBookingInDb(input)).status).toBe("HOLD");
  });
  it.each(["tenant", "phone", "proof", "expired", "unverified", "used"])("rejects %s OTP without booking, payment, identity or event writes", async invalid => {
    const before = await snapshot();
    if (invalid === "expired") await prisma.bookingOtpCode.update({ where: { id: otpId }, data: { expires_at: now } });
    if (invalid === "unverified") await prisma.bookingOtpCode.update({ where: { id: otpId }, data: { verified: false } });
    if (invalid === "used") await prisma.bookingOtpCode.update({ where: { id: otpId }, data: { used: true } });
    const otpBefore = await prisma.bookingOtpCode.findUniqueOrThrow({ where: { id: otpId } });
    await expect(createBookingInDb(creation({ scheduledAt: newScheduledAt, isPublicBooking: true, phone: invalid === "phone" ? "09171234568" : "09171234567", otpVerificationId: otpId, otpVerificationToken: invalid === "proof" ? "invalid" : createOtpVerificationProof(otpId, "09171234567", invalid === "tenant" ? foreign.id : business.id) }))).rejects.toThrow("OTP_INVALID_OR_EXPIRED");
    expect(await snapshot()).toEqual(before);
    expect(await prisma.bookingOtpCode.findUniqueOrThrow({ where: { id: otpId } })).toEqual(otpBefore);
    expect(await prisma.booking.count({ where: { business_id: business.id } })).toBe(1);
    expect(await prisma.customer.count({ where: { business_id: business.id } })).toBe(1);
  });
  it("rejects a foreign tenant service before customer or booking persistence", async () => {
    const before = await snapshot();
    await expect(createBookingInDb(creation({ scheduledAt: newScheduledAt, services: [{ id: foreignServiceId, quantity: 1 }] }))).rejects.toThrow("selected services are invalid");
    expect(await snapshot()).toEqual(before);
  });
  it("requires an OTP proof before public customer, payment or booking writes", async () => {
    const before = await snapshot();
    await expect(createBookingInDb(creation({ scheduledAt: newScheduledAt, isPublicBooking: true, phone: customer.phone }))).rejects.toThrow("OTP_REQUIRED");
    expect(await snapshot()).toEqual(before);
    expect(await prisma.booking.count({ where: { business_id: business.id } })).toBe(1);
    expect(await prisma.bookingPayment.count({ where: { booking: { business_id: business.id } } })).toBe(0);
  });

  it("authenticated cancellation commits parent, trimmed reason, audit and outbox without changing payment or service history", async () => {
    const before = await snapshot();
    expect(await cancelBookingAction({ bookingId, reason: "  Customer called  " })).toMatchObject({ success: true, bookingId });
    expect(await target()).toMatchObject({ status: "CANCELLED", cancelled_by_id: owner.id, cancellation_reason: "Customer called", cancelled_at: now, grand_total: before.booking.grand_total, amount_paid: before.booking.amount_paid });
    expect(await lines()).toEqual(before.lines); expect(await voucher()).toEqual(before.voucher);
    expect(await audits()).toMatchObject([{ actor_id: owner.id, business_id: business.id, action: "CANCELLED" }]);
    expect(await events()).toMatchObject([{ event_type: "BOOKING_CANCELLED", business_id: business.id }]);
    expect((await cancelBookingAction({ bookingId, reason: "again" })).success).toBe(false);
    expect(await audits()).toHaveLength(1); expect(await events()).toHaveLength(1);
  });
  it("authenticated rescheduling shifts real child timestamps and resets reminders without repricing", async () => {
    const before = await snapshot();
    expect(await rescheduleBookingAction({ bookingId, newScheduledAt })).toMatchObject({ success: true, bookingId });
    expect(await target()).toMatchObject({ scheduled_at: newScheduledAt, estimated_end: new Date(newScheduledAt.getTime() + 30 * 60_000), grand_total: 500, reminder_sent: false, reminder_sent_at: null, reminder_attempts: 0 });
    expect(await lines()).toMatchObject(before.lines.map(line => ({
      id: line.id, service_id: line.service_id, status: line.status, price: line.price,
      final_price: line.final_price, discount: line.discount, commission_base: line.commission_base,
      served_by_id: line.served_by_id, claimed_at: line.claimed_at,
      scheduled_at: newScheduledAt, estimated_end: new Date(newScheduledAt.getTime() + 30 * 60_000),
    })));
    expect(await audits()).toMatchObject([{ actor_id: owner.id, action: "UPDATED", business_id: business.id }]);
    expect(await events()).toMatchObject([{ event_type: "BOOKING_RESCHEDULED", business_id: business.id }]);
  });
  it.each(["cancel", "reschedule"] as const)("denies unauthenticated %s without SQL mutation", async action => {
    vi.mocked(requireAuth).mockResolvedValue({ success: false, error: "Unauthorized" });
    const before = await snapshot();
    const result = action === "cancel" ? await cancelBookingAction({ bookingId, reason: "requested" }) : await rescheduleBookingAction({ bookingId, newScheduledAt });
    expect(result.success).toBe(false); expect(await snapshot()).toEqual(before);
  });
  it.each(["cancel", "reschedule"] as const)("allows authenticated employee %s with an actual current permission", async action => {
    authenticated(staff.id);
    const result = action === "cancel" ? await cancelBookingAction({ bookingId, reason: "requested" }) : await rescheduleBookingAction({ bookingId, newScheduledAt });
    expect(result.success).toBe(true);
    expect(await audits()).toMatchObject([{ actor_id: staff.id, business_id: business.id }]);
    expect(await events()).toHaveLength(1);
  });
  it.each(["cancel", "reschedule"] as const)("denies %s after stored employee permission or tenant membership revocation", async action => {
    authenticated(staff.id);
    await prisma.employee.update({ where: { id: employeeId }, data: { permissions: ["PAYMENT_COLLECT"] } });
    const before = await snapshot();
    const perform = () => action === "cancel" ? cancelBookingAction({ bookingId, reason: "requested" }) : rescheduleBookingAction({ bookingId, newScheduledAt });
    expect((await perform()).success).toBe(false); expect(await snapshot()).toEqual(before);
    await prisma.employee.update({ where: { id: employeeId }, data: { permissions: ["BOOKING_CANCEL", "BOOKING_MODIFY"], business_id: foreign.id } });
    expect((await perform()).success).toBe(false); expect(await snapshot()).toEqual(before);
  });
  it.each(["cancel", "reschedule"] as const)("denies %s targeting a booking outside the authenticated tenant", async action => {
    await prisma.booking.update({ where: { id: bookingId }, data: { business_id: foreign.id } });
    const before = await snapshot();
    const result = action === "cancel" ? await cancelBookingAction({ bookingId, reason: "requested" }) : await rescheduleBookingAction({ bookingId, newScheduledAt });
    expect(result.success).toBe(false); expect(await snapshot()).toEqual(before);
  });

  it("customer cancellation cascades unfinished lines, restores voucher and preserves completed work", async () => {
    const completed = await prisma.availedService.create({ data: { booking_id: bookingId, service_id: serviceId, status: "COMPLETED", completed_at: now, price: 500, final_price: 500, commission_base: 500 } });
    expect(await cancelBookingByCustomerAction({ ...manageInput(), reason: "Changed plans" })).toEqual({ success: true });
    expect(await target()).toMatchObject({ status: "CANCELLED", cancelled_by_customer: true, cancelled_at: now, cancellation_reason: "Changed plans" });
    expect(await prisma.availedService.findUniqueOrThrow({ where: { id: lineId } })).toMatchObject({ status: "CANCELLED", cancelled_at: now });
    expect(await prisma.availedService.findUniqueOrThrow({ where: { id: completed.id } })).toEqual(completed);
    expect(await voucher()).toMatchObject({ is_active: true, used_by_id: null });
    expect(await events()).toMatchObject([{ event_type: "BOOKING_CANCELLED_BY_CUSTOMER", business_id: business.id }]);
    expect((await cancelBookingByCustomerAction(manageInput())).success).toBe(false); expect(await events()).toHaveLength(1);
  });
  it("customer reschedule validates real capacity and atomically clears assignments, increments count and emits event", async () => {
    expect(await rescheduleBookingByCustomerAction({ ...manageInput(), newScheduledAt })).toEqual({ success: true });
    expect(await target()).toMatchObject({ scheduled_at: newScheduledAt, estimated_end: new Date(newScheduledAt.getTime() + 30 * 60_000), reschedule_count: 1, rescheduled_at: now, grand_total: 500 });
    expect(await lines()).toMatchObject([{ scheduled_at: newScheduledAt, estimated_end: new Date(newScheduledAt.getTime() + 30 * 60_000), served_by_id: null, claimed_at: null, status: "PENDING" }]);
    expect(await events()).toMatchObject([{ event_type: "BOOKING_RESCHEDULED_BY_CUSTOMER", business_id: business.id }]);
    expect(await audits()).toEqual([]);
  });
  it.each(["cancel", "reschedule"] as const)("denies customer %s inside the six-hour window", async action => {
    await prisma.booking.update({ where: { id: bookingId }, data: { scheduled_at: new Date(now.getTime() + 6 * 60 * 60_000) } });
    const before = await snapshot();
    const result = action === "cancel" ? await cancelBookingByCustomerAction(manageInput()) : await rescheduleBookingByCustomerAction({ ...manageInput(), newScheduledAt });
    expect(result.success).toBe(false); expect(await snapshot()).toEqual(before);
  });
  it.each(["cancel", "reschedule"] as const)("rejects expired, wrong-purpose, wrong-booking and wrong-tenant manage tokens before %s mutation", async action => {
    const before = await snapshot();
    for (const input of [manageInput("manage", 0), manageInput("details"), { ...manageInput(), bookingId: bookingId + 1 }, { ...manageInput(), businessSlug: foreign.slug }]) {
      const result = action === "cancel" ? await cancelBookingByCustomerAction(input) : await rescheduleBookingByCustomerAction({ ...input, newScheduledAt });
      expect(result).toMatchObject({ success: false, error: "Invalid or expired link." });
      expect(await snapshot()).toEqual(before);
    }
  });
  it.each(["cancel", "reschedule"] as const)("denies customer %s for an authentic manage token bound to another tenant", async action => {
    const before = await snapshot();
    const input = { bookingId, businessSlug: foreign.slug, token: createBookingSuccessToken({ bookingId, businessSlug: foreign.slug, purpose: "manage" }) };
    const result = action === "cancel" ? await cancelBookingByCustomerAction(input) : await rescheduleBookingByCustomerAction({ ...input, newScheduledAt });
    expect(result).toMatchObject({ success: false, error: "Booking not found." });
    expect(await snapshot()).toEqual(before);
  });
  it("rejects customer reschedule into a genuinely closed day without changing any rows", async () => {
    await prisma.businessHours.updateMany({ where: { business_id: business.id }, data: { is_closed: true } });
    const before = await snapshot();
    expect((await rescheduleBookingByCustomerAction({ ...manageInput(), newScheduledAt })).success).toBe(false);
    expect(await snapshot()).toEqual(before);
  });
  it.each(["staff-cancel", "staff-reschedule", "customer-cancel", "customer-reschedule"] as const)("rolls back every real write on post-outbox %s failure", async action => {
    const before = await snapshot();
    failure.event = {
      "staff-cancel": "BOOKING_CANCELLED", "staff-reschedule": "BOOKING_RESCHEDULED",
      "customer-cancel": "BOOKING_CANCELLED_BY_CUSTOMER", "customer-reschedule": "BOOKING_RESCHEDULED_BY_CUSTOMER",
    }[action];
    const result = action === "staff-cancel" ? await cancelBookingAction({ bookingId, reason: "requested" })
      : action === "staff-reschedule" ? await rescheduleBookingAction({ bookingId, newScheduledAt })
        : action === "customer-cancel" ? await cancelBookingByCustomerAction(manageInput())
          : await rescheduleBookingByCustomerAction({ ...manageInput(), newScheduledAt });
    expect(failure.reached).toBe(true); expect(result.success).toBe(false);
    expect(await snapshot()).toEqual(before);
  });
});
