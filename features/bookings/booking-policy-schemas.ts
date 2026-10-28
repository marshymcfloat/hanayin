import "server-only";
import { z } from "zod";

const policyNumber = z.number().min(-2147483648).max(2147483647);

export const bookingPolicyInputSchema = z.object({
  bookingHorizonDays: policyNumber.optional(),
  minLeadMinutes: policyNumber.optional(),
  slotIntervalMinutes: policyNumber.optional(),
  sameDayAttendanceStrictMinutes: policyNumber.optional(),
  allowPublicFullPayment: z.boolean().optional(),
  allowPublicDownpayment: z.boolean().optional(),
  defaultPublicPaymentType: z.enum(["FULL", "DOWNPAYMENT"]).optional(),
  downpaymentPercentage: policyNumber.optional(),
  bookingV2Enabled: z.boolean().optional(),
  timezone: z.string().min(1).max(100).optional(),
});
