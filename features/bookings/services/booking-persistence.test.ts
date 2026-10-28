import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingPricingSnapshot, CanonicalBookingService } from "@/features/bookings/services/booking-pricing";
import type { Prisma as PrismaTypes } from "@/prisma/generated/prisma/client";

const mocks = vi.hoisted(() => ({ pricing: vi.fn(), validate: vi.fn(), staff: vi.fn(), slot: vi.fn(), otp: vi.fn(), publish: vi.fn(), contact: vi.fn(), verified: vi.fn() }));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  customer: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  booking: { create: vi.fn<(args: PrismaTypes.BookingCreateArgs) => Promise<{ id: number; hold_expires_at: Date | null }>>() },
  bookingPayment: { create: vi.fn() }, voucher: { updateMany: vi.fn() },
}));
vi.mock("@/prisma/prisma", () => ({ prisma: db }));
vi.mock("@/features/bookings/services/booking-pricing", () => ({ buildBookingPricingSnapshot: mocks.pricing }));
vi.mock("@/features/bookings/services/booking-otp", () => ({ consumeOtpVerification: mocks.otp }));
vi.mock("@/lib/services/outbox", () => ({ publishEvent: mocks.publish }));
vi.mock("@/features/bookings/services/booking-availability", () => ({
  validateBookingOrThrow: mocks.validate, resolveStaffSelectionOrThrow: mocks.staff, checkSaleEventSlotLimit: mocks.slot,
  BookingAvailabilityError: class extends Error { constructor(public code: string, message: string) { super(message); } },
}));
vi.mock("@/features/bookings/services/customer-matching", async original => ({
  ...await original<typeof import("@/features/bookings/services/customer-matching")>(),
  findExistingCustomerByContact: mocks.contact, findExistingCustomerByVerifiedPhone: mocks.verified,
}));
import { createBookingInDb, isAvailedServiceOverlapViolation, type BookingServiceParams } from "./booking-persistence";
import { Prisma } from "@/prisma/generated/prisma/client";

const date = new Date("2030-01-15T09:00:00Z");
const service = (overrides: Partial<CanonicalBookingService> = {}): CanonicalBookingService => ({
  id: 1, name: "Service", quantity: 1, duration: 30, price: 100, originalPrice: 100, estimatedCost: 20, discount: 0, discountReason: null, saleEventId: null, commissionBase: 100, ...overrides,
});
const snapshot = (overrides: Partial<BookingPricingSnapshot> = {}): BookingPricingSnapshot => ({
  appliedOffers: [], packageSnapshots: [], quoteFingerprint: "a".repeat(64), voucherOutcome: "NONE",
  business: { id: "biz", slug: "demo", name: "Business", commission_calculation_basis: "ORIGINAL_PRICE", gcash_account_name: "Test", gcash_mobile_number: "09171234567" },
  services: [service()], subtotal: 100, voucherDiscount: 0, grandTotal: 100, appliedSaleEventId: null, downpaymentAmount: 20, amountToPay: 100, totalDuration: 30,
  estimatedEnd: new Date(date.getTime() + 30 * 60_000), voucher: null, ...overrides,
});
const input = (overrides: Partial<BookingServiceParams> = {}): BookingServiceParams => ({
  businessSlug: "demo", customerName: "Customer", services: [{ id: 1, quantity: 1 }], scheduledAt: date, estimatedEnd: date, paymentMethod: "CASH", paymentType: "FULL", ...overrides,
});
const publicInput = (overrides: Partial<BookingServiceParams> = {}) => input({ isPublicBooking: true, phone: "09171234567", otpVerificationId: 7, otpVerificationToken: "fixture-proof", paymentMethod: "ONLINE", paymentType: "DOWNPAYMENT", ...overrides });
const bookingData = () => db.booking.create.mock.calls[0][0].data;
const createdLines = () => {
  const rows = bookingData().availed_services?.create;
  if (!Array.isArray(rows)) throw new Error("Expected nested line array");
  return rows;
};

describe("booking persistence decisions with isolated transaction delegates", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(date);
    db.$transaction.mockImplementation(async (work: (tx: typeof db) => unknown) => work(db));
    mocks.pricing.mockResolvedValue(snapshot()); mocks.validate.mockResolvedValue(undefined); mocks.staff.mockResolvedValue({ assignedEmployeeId: null }); mocks.slot.mockResolvedValue(undefined); mocks.otp.mockResolvedValue(true);
    mocks.contact.mockResolvedValue(null); mocks.verified.mockResolvedValue(null); mocks.publish.mockResolvedValue(undefined);
    db.customer.create.mockResolvedValue({ id: "new-customer" }); db.customer.findUnique.mockResolvedValue(null); db.customer.update.mockResolvedValue({ id: "existing" });
    db.booking.create.mockResolvedValue({ id: 9, hold_expires_at: new Date(date.getTime() + 30 * 60_000) }); db.bookingPayment.create.mockResolvedValue({ id: 1 }); db.voucher.updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => vi.useRealTimers());
  it("uses canonical pricing, creates normalized tenant customer, unpaid booking and outbox", async () => {
    await createBookingInDb(input({ email: " CONTACT@EXAMPLE.TEST ", phone: "0917 123 4567", voucherCode: "VO-A" }));
    expect(mocks.pricing).toHaveBeenCalledWith(expect.objectContaining({ db, businessSlug: "demo", voucherCode: "VO-A" }));
    expect(db.customer.create).toHaveBeenCalledWith({ data: { name: "Customer", email: "contact@example.test", phone: "639171234567", business_id: "biz" } });
    expect(bookingData()).toMatchObject({ business_id: "biz", customer_id: "new-customer", status: "ACCEPTED", payment_status: "UNPAID", amount_paid: 0, downpayment: null, hold_expires_at: null });
    expect(mocks.publish).toHaveBeenCalledWith(db, expect.objectContaining({ type: "BOOKING_CREATED", aggregateId: "9", businessId: "biz", payload: expect.objectContaining({ email: "contact@example.test", grandTotal: 100, status: "ACCEPTED", isWalkIn: false }) }));
  });
  it("accepts already validated snapshot without recomputing pricing", async () => { await createBookingInDb(input({ pricingSnapshot: snapshot({ grandTotal: 70, voucherDiscount: 30 }) })); expect(mocks.pricing).not.toHaveBeenCalled(); expect(bookingData()).toMatchObject({ grand_total: 70, total_discount: 30 }); });
  it("capacity override skips capacity validation but still resolves staff", async () => { await createBookingInDb(input({ allowWalkInCapacityBypass: true, employeeId: 3, staffSelectionMode: "REQUIRE_SELECTED" })); expect(mocks.validate).not.toHaveBeenCalled(); expect(mocks.staff).toHaveBeenCalledWith(expect.objectContaining({ selectedEmployeeId: 3, staffSelectionMode: "REQUIRE_SELECTED", db })); expect(bookingData().capacity_override_applied).toBe(true); });
  it("normal capacity validation receives selected staff and canonical selections", async () => { await createBookingInDb(input({ employeeId: 3 })); expect(mocks.validate).toHaveBeenCalledWith(expect.objectContaining({ selectedEmployeeId: 3, services: [{ id: 1, quantity: 1 }], db })); });
  it("anonymous staff walk-ins do not look up/create or normalize a customer profile", async () => { await createBookingInDb(input({ isAnonymousWalkIn: true, isWalkIn: true, customerId: "ignored", email: "EMAIL", phone: "PHONE" })); expect(bookingData()).toMatchObject({ customer_id: null, is_anonymous_walk_in: true, customer_label: "Customer", amount_paid: 100, payment_status: "PAID" }); expect(db.customer.create).not.toHaveBeenCalled(); expect(db.customer.findUnique).not.toHaveBeenCalled(); expect(mocks.contact).not.toHaveBeenCalled(); expect(mocks.publish).toHaveBeenCalledWith(db, expect.objectContaining({ payload: expect.objectContaining({ email: undefined }) })); });
  it("public callers cannot request anonymous mode or trust supplied customer id", async () => { await createBookingInDb(publicInput({ isAnonymousWalkIn: true, customerId: "untrusted" })); expect(bookingData()).toMatchObject({ customer_id: "new-customer", is_anonymous_walk_in: false, customer_label: null, status: "HOLD" }); expect(mocks.verified).toHaveBeenCalled(); expect(db.customer.findUnique).not.toHaveBeenCalled(); });
  for (const [name, existing, contacts, expected] of [
    ["both missing", { email: null, phone: null }, { email: " Contact@Example.Test ", phone: "09171234567" }, { email: "contact@example.test", phone: "639171234567" }],
    ["email missing", { email: null, phone: "existing-phone" }, { email: "Contact@Example.Test", phone: "09171234567" }, { email: "contact@example.test" }],
    ["phone missing", { email: "existing@example.test", phone: null }, { email: "Contact@Example.Test", phone: "09171234567" }, { phone: "639171234567" }],
  ] as const) it(`explicit existing id only fills ${name}`, async () => {
    db.customer.findUnique.mockResolvedValue({ id: "existing", ...existing }); await createBookingInDb(input({ customerId: "existing", ...contacts })); expect(db.customer.findUnique).toHaveBeenCalledWith({ where: { id: "existing", business_id: "biz" } }); expect(db.customer.update).toHaveBeenCalledWith({ where: { id: "existing", business_id: "biz" }, data: expected }); expect(bookingData().customer_id).toBe("existing"); expect(db.customer.create).not.toHaveBeenCalled();
  });
  it("explicit existing contacts are not overwritten", async () => { db.customer.findUnique.mockResolvedValue({ id: "existing", email: "old@example.test", phone: "old-phone" }); await createBookingInDb(input({ customerId: "existing", email: "new@example.test", phone: "09171234567" })); expect(db.customer.update).not.toHaveBeenCalled(); });
  it("explicit id with omitted contacts does not patch the profile", async () => { db.customer.findUnique.mockResolvedValue({ id: "existing", email: null, phone: null }); await createBookingInDb(input({ customerId: "existing" })); expect(db.customer.update).not.toHaveBeenCalled(); });
  it.each(["missing", "foreign"])("rejects %s explicit customer IDs using a tenant-scoped lookup before any writes", async customerId => {
    await expect(createBookingInDb(input({ customerId }))).rejects.toThrow("CUSTOMER_NOT_FOUND");
    expect(db.customer.findUnique).toHaveBeenCalledWith({ where: { id: customerId, business_id: "biz" } });
    expect(db.customer.create).not.toHaveBeenCalled();
    expect(db.customer.update).not.toHaveBeenCalled();
    expect(db.booking.create).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
  it("staff contact match links existing profile and fills missing contacts", async () => { mocks.contact.mockResolvedValue({ id: "matched", email: null, phone: null }); await createBookingInDb(input({ email: "NEW@EXAMPLE.TEST", phone: "09171234567" })); expect(db.customer.update).toHaveBeenCalledWith({ where: { id: "matched" }, data: { email: "new@example.test", phone: "639171234567" } }); expect(bookingData().customer_id).toBe("matched"); expect(db.customer.create).not.toHaveBeenCalled(); });
  it("staff contact match with established contacts is linked without mutation", async () => { mocks.contact.mockResolvedValue({ id: "matched", email: "old@example.test", phone: "old" }); await createBookingInDb(input({ email: "new@example.test", phone: "09171234567" })); expect(db.customer.update).not.toHaveBeenCalled(); expect(bookingData().customer_id).toBe("matched"); });
  it("staff contact match with no submitted contacts has no patch", async () => { mocks.contact.mockResolvedValue({ id: "matched", email: null, phone: null }); await createBookingInDb(input()); expect(db.customer.update).not.toHaveBeenCalled(); });
  it("force-create bypasses staff matching but not public verified matching", async () => { await createBookingInDb(input({ forceCreateCustomer: true })); expect(mocks.contact).not.toHaveBeenCalled(); expect(db.customer.create).toHaveBeenCalledTimes(1); await createBookingInDb(publicInput({ forceCreateCustomer: true })); expect(mocks.verified).toHaveBeenCalledTimes(1); });
  it("public verified match refreshes name/contact without email identity lookup", async () => { mocks.verified.mockResolvedValue({ id: "verified-customer", email: "old@example.test", phone: "639171234567" }); await createBookingInDb(publicInput({ email: "NEW@EXAMPLE.TEST" })); expect(db.customer.update).toHaveBeenCalledWith({ where: { id: "verified-customer" }, data: { name: "Customer", email: "new@example.test", phone: "639171234567" } }); expect(mocks.contact).not.toHaveBeenCalled(); expect(bookingData().customer_id).toBe("verified-customer"); });
  for (const [name, patch] of [ ["missing name", { gcash_account_name: undefined }], ["blank name", { gcash_account_name: " " }], ["missing number", { gcash_mobile_number: undefined }], ["blank number", { gcash_mobile_number: " " }] ] as const) it(`public GCash ${name} stops persistence`, async () => { mocks.pricing.mockResolvedValue(snapshot({ business: { ...snapshot().business, ...patch } })); await expect(createBookingInDb(publicInput())).rejects.toThrow("GCASH_NOT_CONFIGURED"); expect(db.customer.create).not.toHaveBeenCalled(); expect(db.booking.create).not.toHaveBeenCalled(); });
  it("rejects invalid consumed OTP before profile/persistence", async () => { mocks.otp.mockResolvedValue(false); await expect(createBookingInDb(publicInput())).rejects.toThrow("OTP_INVALID_OR_EXPIRED"); expect(db.booking.create).not.toHaveBeenCalled(); });
  for (const [name, params, pricing, expected] of [
    ["full cash walk-in", { isWalkIn: true }, {}, { amount_paid: 100, payment_status: "PAID", downpayment: null }],
    ["downpayment walk-in", { isWalkIn: true, paymentType: "DOWNPAYMENT" }, { downpaymentAmount: 20 }, { amount_paid: 20, payment_status: "PARTIALLY_PAID", downpayment: 20 }],
    ["zero downpayment walk-in", { isWalkIn: true, paymentType: "DOWNPAYMENT" }, { downpaymentAmount: null }, { amount_paid: 0, payment_status: "UNPAID", downpayment: null }],
    ["scheduled downpayment", { paymentType: "DOWNPAYMENT" }, { downpaymentAmount: 20 }, { amount_paid: 0, payment_status: "UNPAID", downpayment: 20 }],
    ["zero price scheduled", {}, { grandTotal: 0 }, { amount_paid: 0, payment_status: "PAID", downpayment: null }],
  ] as const) it(`preserves ${name} payment state`, async () => { mocks.pricing.mockResolvedValue(snapshot(pricing)); await createBookingInDb(input(params)); expect(bookingData()).toMatchObject(expected); });
  it("public downpayment uses legacy twenty percent rounded principal and pending payment", async () => { mocks.pricing.mockResolvedValue(snapshot({ grandTotal: 123.47, downpaymentAmount: 99 })); await createBookingInDb(publicInput()); expect(bookingData()).toMatchObject({ downpayment: 24.69, amount_paid: 0, payment_status: "UNPAID", hold_expires_at: new Date(date.getTime() + 30 * 60_000) }); expect(db.bookingPayment.create).toHaveBeenCalledWith({ data: { booking_id: 9, type: "DOWNPAYMENT", status: "PENDING", payment_method: "ONLINE", amount_principal: 24.69, amount_charged: 24.69, expires_at: new Date(date.getTime() + 30 * 60_000) } }); });
  it("legacy public FULL payment creates zero-principal pending payment", async () => { await createBookingInDb(publicInput({ paymentType: "FULL" })); expect(db.bookingPayment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount_principal: 0, amount_charged: 0 }) })); });
  it("checks selected sale capacity inside the booking transaction", async () => { mocks.pricing.mockResolvedValue(snapshot({ appliedSaleEventId: 4 })); await createBookingInDb(input()); expect(mocks.slot).toHaveBeenCalledWith({ saleEventId: 4, db }); expect(bookingData().sale_event_id).toBe(4); });
  it("writes sequential line windows using quantities and fallback durations", async () => { mocks.pricing.mockResolvedValue(snapshot({ services: [service({ quantity: 2, duration: 0 }), service({ id: 2, duration: 45, quantity: 2 })] })); await createBookingInDb(input()); expect(createdLines()).toEqual([expect.objectContaining({ scheduled_at: date, estimated_end: new Date(date.getTime() + 60 * 60_000) }), expect.objectContaining({ scheduled_at: new Date(date.getTime() + 60 * 60_000), estimated_end: new Date(date.getTime() + 150 * 60_000) })]); });
  it("claimed line uses current employee over selected provider and stamps time", async () => { mocks.pricing.mockResolvedValue(snapshot({ services: [service({ claimedByCurrentEmployee: true, packageId: 2 })] })); mocks.staff.mockResolvedValue({ assignedEmployeeId: 3 }); await createBookingInDb(input({ currentEmployeeId: 7 })); expect(createdLines()[0]).toMatchObject({ served_by_id: 7, served_by_type: "EMPLOYEE", status: "CLAIMED", claimed_at: date, package_id: 2 }); });
  it("claim without current employee remains pending and uses resolved staff", async () => { mocks.pricing.mockResolvedValue(snapshot({ services: [service({ claimedByCurrentEmployee: true })] })); mocks.staff.mockResolvedValue({ assignedEmployeeId: 3 }); await createBookingInDb(input()); expect(createdLines()[0]).toMatchObject({ served_by_id: 3, served_by_type: "EMPLOYEE", status: "PENDING", claimed_at: null }); });
  for (const [name, canonical, expected] of [ ["explicit", { discount: 20, discountReason: "PROMO", commissionBase: 80 }, { discount_reason: "PROMO", commission_base: 80 }], ["manual fallback", { discount: 20, discountReason: null, commissionBase: 0 }, { discount_reason: "PACKAGE_OR_MANUAL", commission_base: 100 }], ["none", { discount: 0, discountReason: null }, { discount_reason: null, commission_base: 100 }] ] as const) it(`snapshots ${name} discount/commission values`, async () => { mocks.pricing.mockResolvedValue(snapshot({ services: [service(canonical)] })); await createBookingInDb(input()); expect(createdLines()[0]).toMatchObject(expected); });
  it("reserves valid voucher conditionally after booking creation", async () => { mocks.pricing.mockResolvedValue(snapshot({ voucher: { id: 5, code: "VO-A" } })); await createBookingInDb(input()); expect(db.voucher.updateMany).toHaveBeenCalledWith({ where: { id: 5, is_active: true, used_by_id: null }, data: { used_by_id: 9, is_active: false } }); expect(db.booking.create.mock.invocationCallOrder[0]).toBeLessThan(db.voucher.updateMany.mock.invocationCallOrder[0]); });
  it("lost voucher reservation prevents outbox and surfaces original availability failure", async () => { mocks.pricing.mockResolvedValue(snapshot({ voucher: { id: 5, code: "VO-A" } })); db.voucher.updateMany.mockResolvedValue({ count: 0 }); await expect(createBookingInDb(input())).rejects.toThrow("Voucher is no longer available"); expect(mocks.publish).not.toHaveBeenCalled(); expect(db.$transaction).toHaveBeenCalledTimes(1); });
  for (const [name, mock] of [ ["pricing", mocks.pricing], ["availability", mocks.validate], ["staff selection", mocks.staff], ["customer creation", db.customer.create], ["booking creation", db.booking.create], ["outbox", mocks.publish] ] as const) it(`does not retry nonserialization ${name} failure`, async () => { const error = new Error(`${name} failed`); mock.mockRejectedValue(error); await expect(createBookingInDb(input())).rejects.toBe(error); expect(db.$transaction).toHaveBeenCalledTimes(1); });
  it("bounded serialization retry succeeds on the third whole transaction", async () => { const error = new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "7.4.0" }); db.$transaction.mockRejectedValueOnce(error).mockRejectedValueOnce(error).mockImplementation(async (work: (tx: typeof db) => unknown) => work(db)); await expect(createBookingInDb(input())).resolves.toMatchObject({ id: 9 }); expect(db.$transaction).toHaveBeenCalledTimes(3); });
  it("third serialization failure surfaces original error and never starts a fourth transaction", async () => { const error = new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "7.4.0" }); db.$transaction.mockRejectedValue(error); await expect(createBookingInDb(input())).rejects.toBe(error); expect(db.$transaction).toHaveBeenCalledTimes(3); });
  it("different known Prisma failure is not retried", async () => { const error = new Prisma.PrismaClientKnownRequestError("constraint", { code: "P2002", clientVersion: "7.4.0" }); db.$transaction.mockRejectedValue(error); await expect(createBookingInDb(input())).rejects.toBe(error); expect(db.$transaction).toHaveBeenCalledTimes(1); });
  for (const constraint of ["AvailedService_employee_no_overlap_excl", "AvailedService_owner_no_overlap_excl"]) it(`maps actual ${constraint} identifier to safe slot error`, async () => { const error = new Error(`violates exclusion ${constraint}`); db.$transaction.mockRejectedValue(error); expect(isAvailedServiceOverlapViolation(error)).toBe(true); await expect(createBookingInDb(input())).rejects.toMatchObject({ code: "SLOT_JUST_TAKEN", message: "That slot was just taken. Please pick another slot." }); expect(db.$transaction).toHaveBeenCalledTimes(1); });
});
