import { z } from "zod";
import { normalizePhilippinePhone } from "@/lib/services/sms-otp";

export const bookingOtpInputSchema = z.object({
  phone: z.string().trim().max(32).transform(normalizePhilippinePhone).pipe(z.string().regex(/^639\d{9}$/)),
  businessSlug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
export const bookingOtpVerifySchema = bookingOtpInputSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/),
});
