import type { Prisma, PrismaClient } from "@/prisma/generated/prisma/client";
import {
  BookingPolicy,
  normalizeBookingPolicy,
  normalizeBookingPublicPaymentType,
} from "@/lib/types/booking-policy";

type PolicyDbClient = PrismaClient | Prisma.TransactionClient;

const BOOKING_POLICY_SELECT = {
  booking_horizon_days: true,
  booking_min_lead_minutes: true,
  booking_slot_interval_minutes: true,
  same_day_attendance_strict_minutes: true,
  public_allow_full_payment: true,
  public_allow_downpayment: true,
  public_default_payment_type: true,
  downpayment_percentage: true,
  booking_v2_enabled: true,
  timezone: true,
} as const;

function mapPolicyRecord(record: {
  booking_horizon_days: number;
  booking_min_lead_minutes: number;
  booking_slot_interval_minutes: number;
  same_day_attendance_strict_minutes: number;
  public_allow_full_payment: boolean;
  public_allow_downpayment: boolean;
  public_default_payment_type: string;
  downpayment_percentage: number;
  booking_v2_enabled: boolean;
  timezone: string;
}): BookingPolicy {
  return normalizeBookingPolicy({
    bookingHorizonDays: record.booking_horizon_days,
    minLeadMinutes: record.booking_min_lead_minutes,
    slotIntervalMinutes: record.booking_slot_interval_minutes,
    // Deprecated compatibility field retained for existing settings records.
    sameDayAttendanceStrictMinutes:
      record.same_day_attendance_strict_minutes,
    allowPublicFullPayment: record.public_allow_full_payment,
    allowPublicDownpayment: record.public_allow_downpayment,
    defaultPublicPaymentType: normalizeBookingPublicPaymentType(
      record.public_default_payment_type,
    ),
    downpaymentPercentage: record.downpayment_percentage,
    bookingV2Enabled: record.booking_v2_enabled,
    timezone: record.timezone,
  });
}

export async function getBookingPolicyByBusinessSlug(
  db: PolicyDbClient,
  businessSlug: string,
): Promise<BookingPolicy> {
  const business = await db.business.findUnique({
    where: { slug: businessSlug },
    select: BOOKING_POLICY_SELECT,
  });
  if (!business) {
    throw new Error("Business not found");
  }
  return mapPolicyRecord(business);
}

export async function getBookingPolicyByBusinessId(
  db: PolicyDbClient,
  businessId: string,
): Promise<BookingPolicy> {
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: BOOKING_POLICY_SELECT,
  });
  if (!business) {
    throw new Error("Business not found");
  }
  return mapPolicyRecord(business);
}
