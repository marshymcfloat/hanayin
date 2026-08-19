import { truncateSms } from "@/lib/services/sms";

type ConfirmationMessageInput = {
  firstName: string;
  businessName: string;
  scheduledDate: string;
  scheduledTime: string;
  bookingId: number;
};

type ReminderMessageInput = {
  firstName: string;
  businessName: string;
  scheduledTime: string;
  bookingId: number;
};

export function buildBookingConfirmationSms({
  firstName,
  businessName,
  scheduledDate,
  scheduledTime,
  bookingId,
}: ConfirmationMessageInput) {
  return truncateSms(
    [
      "Booking confirmed!",
      "",
      `Hi ${firstName},`,
      businessName,
      `${scheduledDate} at ${scheduledTime}`,
      `Booking #${bookingId}`,
      "",
      "Please arrive 5 minutes early. See you soon!",
    ].join("\n"),
  );
}

export function buildBookingReminderSms({
  firstName,
  businessName,
  scheduledTime,
  bookingId,
}: ReminderMessageInput) {
  return truncateSms(
    [
      "Appointment reminder",
      "",
      `Hi ${firstName},`,
      `Your appointment at ${businessName} is at ${scheduledTime} today.`,
      `Booking #${bookingId}`,
      "",
      "See you soon!",
    ].join("\n"),
  );
}
