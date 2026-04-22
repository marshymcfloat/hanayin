import { z } from "zod";

const serviceSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.number(),
  originalPrice: z.number().optional(),
  quantity: z.number().min(1).default(1),
  duration: z.number().nullable().optional(),
  claimedByCurrentEmployee: z.boolean().optional(),
  packageId: z.number().optional(),
  discount: z.number().optional(),
  discountReason: z.string().nullable().optional(),
  slotsRemaining: z.number().nullable().optional(),
  packageName: z.string().optional(),
  category: z.string().nullable().optional(),
});

export const paymentMethodEnum = z.enum(["CASH", "QRPH"]);
export const paymentTypeEnum = z.enum(["FULL", "DOWNPAYMENT"]);
export const staffSelectionModeEnum = z.enum([
  "ANY_AVAILABLE",
  "PREFER_SELECTED",
  "REQUIRE_SELECTED",
]);
export const capacityOverrideReasonEnum = z.enum([
  "LATE_CUSTOMER",
  "VIP",
  "MANUAL_EXCEPTION",
  "SYSTEM_RECOVERY",
]);
export const capacityOverrideSchema = z.object({
  reason: capacityOverrideReasonEnum,
  note: z.string().trim().max(240).optional(),
});

export const createBookingSchema = z
  .object({
    customerId: z.string().optional(),
    customerName: z
      .string()
      .optional()
      .transform((value) => value?.trim() ?? "")
      .refine((value) => value.length === 0 || value.length >= 2, {
        message: "Customer name must be at least 2 characters",
      }),
    services: z
      .array(serviceSchema)
      .min(1, "Please select at least one service"),
    scheduledAt: z.coerce.date({ message: "Please select a date and time" }),
    selectedTime: z.date().optional(),
    employeeId: z.number().optional(),
    paymentMethod: paymentMethodEnum.default("CASH"),
    paymentType: paymentTypeEnum.default("FULL"),
    staffSelectionMode: staffSelectionModeEnum.optional(),
    capacityOverride: capacityOverrideSchema.optional(),
    email: z
      .string()
      .optional()
      .refine(
        (val) => !val || val === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
        { message: "Invalid email address" },
      ),
    phone: z
      .string()
      .optional()
      .refine(
        (val) =>
          !val || val.trim() === "" || /^[0-9+\-\s()]{7,20}$/.test(val.trim()),
        { message: "Invalid contact number" },
      ),
    voucherCode: z.string().optional(),
  })
  .refine((data) => data.customerId || data.customerName, {
    message: "Please select an existing customer or enter a new customer name",
    path: ["customerName"],
  })
  .refine((data) => data.paymentMethod !== "QRPH" || !!data.email, {
    message: "Email is required for QR payments",
    path: ["email"],
  });

export type CreateBookingTypes = z.infer<typeof createBookingSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodEnum>;
export type PaymentType = z.infer<typeof paymentTypeEnum>;
export type StaffSelectionMode = z.infer<typeof staffSelectionModeEnum>;
export type CapacityOverrideReason = z.infer<typeof capacityOverrideReasonEnum>;
