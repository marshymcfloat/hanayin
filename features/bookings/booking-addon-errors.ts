import "server-only";

export class BookingAddOnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingAddOnError";
  }
}
const safeMessages = new Set([
  "Unauthorized", "Forbidden", "Business not found",
  "One or more selected services are invalid",
  "One or more selected packages are invalid", "Selected package is invalid",
  "Selected service is invalid", "Selected package service is invalid",
]);
export function safeBookingAddOnError(error: unknown): Error {
  if (error instanceof BookingAddOnError) return error;
  if (error instanceof Error && safeMessages.has(error.message)) return new BookingAddOnError(error.message);
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
    return new BookingAddOnError("Booking changed. Refresh and try again.");
  }
  return new BookingAddOnError("Unable to add booking services. Please try again.");
}
