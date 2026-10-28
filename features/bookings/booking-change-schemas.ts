import { z } from "zod";
import { bookingCreationServiceSchema } from "@/features/bookings/schemas";
export const bookingChangeEditorSchema = z.object({ bookingId: z.number().int().positive() });
export const bookingChangeSchema = bookingChangeEditorSchema.extend({ services: z.array(bookingCreationServiceSchema).min(1).max(100), voucherCode: z.string().trim().max(100).optional(), expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(), requestKey: z.string().uuid().optional() });
export type BookingChangeInput = z.infer<typeof bookingChangeSchema>;
