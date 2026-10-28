import { describe, expect, it } from "vitest";
import { BookingAddOnError, safeBookingAddOnError } from "./booking-addon-errors";

describe("safe add-on errors", () => {
  it("preserves explicitly owned domain errors", () => {
    const error = new BookingAddOnError("Booking not found");
    expect(safeBookingAddOnError(error)).toBe(error);
  });
  it.each(["Unauthorized", "Forbidden", "Business not found", "One or more selected services are invalid", "One or more selected packages are invalid", "Selected package is invalid", "Selected service is invalid", "Selected package service is invalid"])("retains bounded legacy domain error %s", (message) => {
    expect(safeBookingAddOnError(new Error(message)).message).toBe(message);
  });
  it("maps serialization failure to safe refresh guidance", () => {
    expect(safeBookingAddOnError({ code: "P2034", message: "raw SQL" }).message).toBe("Booking changed. Refresh and try again.");
  });
  it.each([new Error("password=secret SELECT"), { code: "P2003", message: "foreign key secret" }, "raw secret", null, undefined])("hides unknown persistence details", (error) => {
    expect(safeBookingAddOnError(error).message).toBe("Unable to add booking services. Please try again.");
  });
});
