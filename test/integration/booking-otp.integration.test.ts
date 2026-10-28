import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "../../scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "../factories/shared-workflows";
import { prisma } from "@/prisma/prisma";
import { consumeOtpVerification, verifyBookingOtp } from "@/features/bookings/services/booking-otp";

import { createOtpVerificationProof } from "@/features/bookings/services/otp-proof";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/sms-otp", async (original) => ({
  ...await original<typeof import("@/lib/services/sms-otp")>(),
  sendSemaphoreOtp: vi.fn(() => { throw new Error("Live SMS is forbidden in integration tests"); }),
}));
requireTestDatabase();
const factory = createSharedWorkflowFactory({ namespace: "integration-booking-otp" });
const business = factory.business();
const other = factory.business({ id: business.id + "-other", slug: business.slug + "-other" });
const customer = factory.customer({ phone: "09171234567" });
let verificationId = 0;
let verificationToken = "";

describe("booking OTP PostgreSQL claims", () => {
  beforeAll(async () => {
    vi.stubEnv("BOOKING_SUCCESS_TOKEN_SECRET", "otp-integration-test-secret");
    await prisma.business.deleteMany({ where: { id: { in: [business.id, other.id] } } });
    for (const record of [business, other]) {
      await prisma.business.create({ data: {
        id: record.id, slug: record.slug, name: record.name,
        initials: record.initials, description: record.description,
      } });
    }
    await prisma.customer.create({ data: {
      id: customer.id, business_id: business.id, name: customer.name,
      phone: customer.phone, email: customer.email,
    } });
  });
  beforeEach(async () => {
    await prisma.bookingOtpCode.deleteMany({ where: { business_id: business.id } });
    const record = await prisma.bookingOtpCode.create({ data: {
      phone: "639171234567", business_id: business.id, code: "123456",
      expires_at: new Date(Date.now() + 600000),
    } });
    verificationId = record.id;
    verificationToken = createOtpVerificationProof(verificationId, "09171234567", business.id);
  });
  afterAll(async () => {
    try {
      await prisma.business.deleteMany({ where: { id: { in: [business.id, other.id] } } });
    } finally { await prisma.$disconnect(); vi.unstubAllEnvs(); }
  });

  it("returns identity to exactly one concurrent verifier and rejects replay", async () => {
    const results = await Promise.all([
      verifyBookingOtp("09171234567", "123456", business.slug),
      verifyBookingOtp("09171234567", "123456", business.slug),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.find((result) => result.success)?.customerName).toBe(customer.name);
    expect(results.find((result) => !result.success)).not.toHaveProperty("customerName");
    await expect(verifyBookingOtp("09171234567", "123456", business.slug)).resolves.toMatchObject({ success: false });
  });

  it("lets exactly one concurrent transaction consume verification", async () => {
    await prisma.bookingOtpCode.update({ where: { id: verificationId }, data: { verified: true } });
    const results = await Promise.all([0, 1].map(() => prisma.$transaction(
      (tx) => consumeOtpVerification(tx, verificationId, "09171234567", business.id, verificationToken),
    )));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("rolls back consumption on transaction failure and allows retry", async () => {
    await prisma.bookingOtpCode.update({ where: { id: verificationId }, data: { verified: true } });
    await expect(prisma.$transaction(async (tx) => {
      expect(await consumeOtpVerification(tx, verificationId, "09171234567", business.id, verificationToken)).toBe(true);
      throw new Error("dependent write failed");
    })).rejects.toThrow("dependent write failed");
    expect((await prisma.bookingOtpCode.findUniqueOrThrow({ where: { id: verificationId } })).used).toBe(false);
    expect(await prisma.$transaction((tx) => consumeOtpVerification(tx, verificationId, "09171234567", business.id, verificationToken))).toBe(true);
  });

  it("rejects wrong tenant/phone/code without verification or consumption", async () => {
    await expect(verifyBookingOtp("09171234567", "123456", other.slug)).resolves.toMatchObject({ success: false });
    await expect(verifyBookingOtp("09171234568", "123456", business.slug)).resolves.toMatchObject({ success: false });
    await expect(verifyBookingOtp("09171234567", "654321", business.slug)).resolves.toMatchObject({ success: false });
    await prisma.bookingOtpCode.update({ where: { id: verificationId }, data: { verified: true } });
    expect(await prisma.$transaction((tx) => consumeOtpVerification(tx, verificationId, "09171234567", other.id, verificationToken))).toBe(false);
    expect(await prisma.$transaction((tx) => consumeOtpVerification(tx, verificationId, "09171234568", business.id, verificationToken))).toBe(false);
    expect((await prisma.bookingOtpCode.findUniqueOrThrow({ where: { id: verificationId } })).used).toBe(false);
  });

  it("rejects expired and unverified claims", async () => {
    expect(await prisma.$transaction((tx) => consumeOtpVerification(tx, verificationId, "09171234567", business.id, verificationToken))).toBe(false);
    await prisma.bookingOtpCode.update({ where: { id: verificationId }, data: { expires_at: new Date(Date.now() - 1000) } });
    await expect(verifyBookingOtp("09171234567", "123456", business.slug)).resolves.toMatchObject({ success: false });
    await prisma.bookingOtpCode.update({ where: { id: verificationId }, data: { verified: true } });
    expect(await prisma.$transaction((tx) => consumeOtpVerification(tx, verificationId, "09171234567", business.id, verificationToken))).toBe(false);
  });
});
