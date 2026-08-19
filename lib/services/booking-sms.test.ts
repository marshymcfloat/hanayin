import { describe, expect, it } from "vitest";
import {
  buildBookingConfirmationSms,
  buildBookingReminderSms,
} from "./booking-sms";

describe("booking SMS templates", () => {
  it("formats confirmation details with readable spacing", () => {
    expect(
      buildBookingConfirmationSms({
        firstName: "Daniel",
        businessName: "BeautyFeel",
        scheduledDate: "August 19, 2026",
        scheduledTime: "5:30 PM",
        bookingId: 124,
      }),
    ).toBe(
      [
        "Booking confirmed!",
        "",
        "Hi Daniel,",
        "BeautyFeel",
        "August 19, 2026 at 5:30 PM",
        "Booking #124",
        "",
        "Please arrive 5 minutes early. See you soon!",
      ].join("\n"),
    );
  });

  it("formats the 30-minute reminder with readable spacing", () => {
    expect(
      buildBookingReminderSms({
        firstName: "Daniel",
        businessName: "BeautyFeel",
        scheduledTime: "5:30 PM",
        bookingId: 124,
      }),
    ).toBe(
      [
        "Appointment reminder",
        "",
        "Hi Daniel,",
        "Your appointment at BeautyFeel is at 5:30 PM today.",
        "Booking #124",
        "",
        "See you soon!",
      ].join("\n"),
    );
  });

  it("keeps generated messages within one SMS segment", () => {
    const message = buildBookingConfirmationSms({
      firstName: "Alexandria",
      businessName: "A Very Long Salon and Wellness Center Business Name",
      scheduledDate: "September 30, 2026",
      scheduledTime: "11:30 AM",
      bookingId: 123456,
    });

    expect(message.length).toBeLessThanOrEqual(160);
  });
});
