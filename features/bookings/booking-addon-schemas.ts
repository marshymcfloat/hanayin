import { z } from "zod";

const id = z.coerce.number().int().positive().max(2_147_483_647);
export const bookingAddOnServiceSchema = z.object({
  id,
  quantity: z.coerce.number().int().min(1).max(10),
  packageId: id.optional(),
  claimedByCurrentEmployee: z.boolean().optional(),
});
export const bookingAddOnSchema = z.object({
  bookingId: id,
  services: z.array(bookingAddOnServiceSchema).min(1).max(100),
  initiatorEmployeeId: id.optional(),
  staffSelectionMode: z.enum(["ANY_AVAILABLE", "PREFER_SELECTED", "REQUIRE_SELECTED"]).optional(),
});
export type BookingAddOnInput = z.input<typeof bookingAddOnSchema>;
export type ValidatedBookingAddOnInput = z.output<typeof bookingAddOnSchema>;
export type AddBookingServiceOrCreateFollowUpResult =
  | { mode: "APPENDED"; bookingId: number }
  | { mode: "FOLLOW_UP_CREATED"; bookingId: number; parentBookingId: number };
