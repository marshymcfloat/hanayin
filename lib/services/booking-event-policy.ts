export type BookingLifecycleTrigger =
  | "BOOKING_CREATED"
  | "PUBLIC_PAYMENT_OWNER_APPROVED";

export function getBookingLifecycleEventType(
  trigger: BookingLifecycleTrigger,
): "BOOKING_CREATED" | "BOOKING_CONFIRMED" {
  return trigger === "PUBLIC_PAYMENT_OWNER_APPROVED"
    ? "BOOKING_CONFIRMED"
    : "BOOKING_CREATED";
}
