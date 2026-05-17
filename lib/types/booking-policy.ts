export type BookingPublicPaymentType = "FULL" | "DOWNPAYMENT";

export type BookingPolicy = {
  bookingHorizonDays: number;
  minLeadMinutes: number;
  slotIntervalMinutes: number;
  // Deprecated: no longer used by booking availability/capacity logic.
  sameDayAttendanceStrictMinutes: number;
  allowPublicFullPayment: boolean;
  allowPublicDownpayment: boolean;
  defaultPublicPaymentType: BookingPublicPaymentType;
  downpaymentPercentage: number;
  bookingV2Enabled: boolean;
  /** IANA timezone identifier for display formatting. */
  timezone: string;
};

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  bookingHorizonDays: 14,
  minLeadMinutes: 30,
  slotIntervalMinutes: 30,
  sameDayAttendanceStrictMinutes: 120,
  allowPublicFullPayment: true,
  allowPublicDownpayment: true,
  defaultPublicPaymentType: "FULL",
  downpaymentPercentage: 50,
  bookingV2Enabled: true,
  timezone: "Asia/Manila",
};

export function normalizeBookingPublicPaymentType(
  value: unknown,
): BookingPublicPaymentType {
  return value === "DOWNPAYMENT" ? "DOWNPAYMENT" : "FULL";
}

export function normalizeBookingPolicy(
  policy: Partial<BookingPolicy> | null | undefined,
): BookingPolicy {
  if (!policy) return { ...DEFAULT_BOOKING_POLICY };
  return {
    bookingHorizonDays:
      typeof policy.bookingHorizonDays === "number" &&
      Number.isFinite(policy.bookingHorizonDays)
        ? Math.max(1, Math.floor(policy.bookingHorizonDays))
        : DEFAULT_BOOKING_POLICY.bookingHorizonDays,
    minLeadMinutes:
      typeof policy.minLeadMinutes === "number" &&
      Number.isFinite(policy.minLeadMinutes)
        ? Math.max(0, Math.floor(policy.minLeadMinutes))
        : DEFAULT_BOOKING_POLICY.minLeadMinutes,
    slotIntervalMinutes:
      typeof policy.slotIntervalMinutes === "number" &&
      Number.isFinite(policy.slotIntervalMinutes)
        ? Math.max(5, Math.floor(policy.slotIntervalMinutes))
        : DEFAULT_BOOKING_POLICY.slotIntervalMinutes,
    sameDayAttendanceStrictMinutes:
      typeof policy.sameDayAttendanceStrictMinutes === "number" &&
      Number.isFinite(policy.sameDayAttendanceStrictMinutes)
        ? Math.max(0, Math.floor(policy.sameDayAttendanceStrictMinutes))
        : DEFAULT_BOOKING_POLICY.sameDayAttendanceStrictMinutes,
    allowPublicFullPayment:
      typeof policy.allowPublicFullPayment === "boolean"
        ? policy.allowPublicFullPayment
        : DEFAULT_BOOKING_POLICY.allowPublicFullPayment,
    allowPublicDownpayment:
      typeof policy.allowPublicDownpayment === "boolean"
        ? policy.allowPublicDownpayment
        : DEFAULT_BOOKING_POLICY.allowPublicDownpayment,
    defaultPublicPaymentType: normalizeBookingPublicPaymentType(
      policy.defaultPublicPaymentType,
    ),
    downpaymentPercentage:
      typeof policy.downpaymentPercentage === "number" &&
      Number.isFinite(policy.downpaymentPercentage)
        ? Math.max(1, Math.min(100, Math.floor(policy.downpaymentPercentage)))
        : DEFAULT_BOOKING_POLICY.downpaymentPercentage,
    bookingV2Enabled:
      typeof policy.bookingV2Enabled === "boolean"
        ? policy.bookingV2Enabled
        : DEFAULT_BOOKING_POLICY.bookingV2Enabled,
    timezone:
      typeof policy.timezone === "string" && policy.timezone.length > 0
        ? policy.timezone
        : DEFAULT_BOOKING_POLICY.timezone,
  };
}
