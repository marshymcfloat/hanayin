import { z } from "zod";

export const bookingManageSchema = z.object({
  token: z.string().min(1),
  bookingId: z.number().int().positive(),
  businessSlug: z.string().min(1),
});

export const bookingCustomerCancelSchema = bookingManageSchema.extend({
  reason: z.string().optional(),
});

export const bookingCustomerRescheduleSchema = bookingManageSchema.extend({
  newScheduledAt: z.date(),
});

export type BookingManageInput = z.infer<typeof bookingManageSchema>;
export type BookingCustomerCancelInput = z.infer<typeof bookingCustomerCancelSchema>;
export type BookingCustomerRescheduleInput = z.infer<typeof bookingCustomerRescheduleSchema>;
