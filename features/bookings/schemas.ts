/** Public and authenticated booking boundary schemas. */
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

export const paymentMethodEnum = z.enum(["CASH", "ONLINE"]);
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
    /**
     * Staff-only: when true, the booking is recorded with no Customer link.
     * The customerName becomes a free-text label on the booking. customerId,
     * email, and phone are ignored. Only honored when a session is present
     * (server enforces this).
     */
    isAnonymousWalkIn: z.boolean().optional(),
    /**
     * Staff-only: when staff confirms "create new anyway" in the duplicate
     * dialog, this skips the silent-link path on the server so a fresh
     * Customer record is always created even if email/phone collide.
     */
    forceCreateCustomer: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.isAnonymousWalkIn || data.customerId || data.customerName,
    {
      message:
        "Please select an existing customer, enter a new customer name, or mark as an anonymous walk-in",
      path: ["customerName"],
    },
  );

const bookingCreationServiceSchema = z.object({
  id: z.number().int().positive(),
  quantity: z.number().int().min(1),
  claimedByCurrentEmployee: z.boolean().optional(),
  packageId: z.number().int().positive().optional(),
});

export const createBookingActionSchema = z
  .object({
    customerId: z.string().trim().min(1).optional(),
    customerName: z.string().trim().max(120),
    businessSlug: z.string().trim().min(1).max(100),
    scheduledAt: z.coerce.date(),
    employeeId: z.number().int().positive().optional(),
    currentEmployeeId: z.number().int().positive().optional(),
    paymentMethod: paymentMethodEnum,
    paymentType: paymentTypeEnum,
    email: z
      .string()
      .trim()
      .email()
      .optional()
      .or(z.literal("")),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s()]{7,20}$/)
      .optional()
      .or(z.literal("")),
    services: z.array(bookingCreationServiceSchema).min(1),
    voucherCode: z.string().trim().max(100).optional(),
    isWalkIn: z.boolean().optional(),
    staffSelectionMode: staffSelectionModeEnum.optional(),
    otpVerificationId: z.number().int().positive().optional(),
    isAnonymousWalkIn: z.boolean().optional(),
    forceCreateCustomer: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.isAnonymousWalkIn || Boolean(data.customerId || data.customerName),
    { path: ["customerName"] },
  );

export type CreateBookingTypes = z.infer<typeof createBookingSchema>;
export type CreateBookingActionInput = z.infer<
  typeof createBookingActionSchema
>;
export type PaymentMethod = z.infer<typeof paymentMethodEnum>;
export type PaymentType = z.infer<typeof paymentTypeEnum>;
export type StaffSelectionMode = z.infer<typeof staffSelectionModeEnum>;
export type CapacityOverrideReason = z.infer<typeof capacityOverrideReasonEnum>;
