import type { BookingStatus, BookingPaymentStatus } from "@/prisma/generated/prisma/enums";

export type BookingPaymentStage =
  | "AWAITING_PAYMENT"
  | "AWAITING_VERIFICATION"
  | "NEEDS_RESOLUTION"
  | "CONFIRMED"
  | "COMPLETED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export function deriveBookingPaymentStage(booking: {
  status: BookingStatus;
  payments?: ReadonlyArray<{
    status: BookingPaymentStatus;
    submitted_at: Date | null;
    escalated_at?: Date | null;
  }>;
}): BookingPaymentStage {
  const payment = booking.payments?.[0];
  if (booking.status === "HOLD") {
    if (payment?.escalated_at) return "NEEDS_RESOLUTION";
    if (payment?.submitted_at) return "AWAITING_VERIFICATION";
    return "AWAITING_PAYMENT";
  }
  if (booking.status === "ACCEPTED") return "CONFIRMED";
  if (booking.status === "COMPLETED") return "COMPLETED";
  if (payment?.status === "FAILED") return "REJECTED";
  if (payment?.status === "EXPIRED") return "EXPIRED";
  return "CANCELLED";
}

export const BOOKING_PAYMENT_STAGE_LABELS: Record<BookingPaymentStage, string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  AWAITING_VERIFICATION: "Awaiting verification",
  NEEDS_RESOLUTION: "Needs resolution",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};
