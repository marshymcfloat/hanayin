import { z } from "zod";

const serviceSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable().optional(),
    price: z.number(),
    duration: z.number().nullable().optional(),
    business_id: z.string().optional(),
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
    quantity: z.number().min(1).default(1),
    // Allow extra fields like packageId, originalPrice
  })
  .passthrough();

export const paymentMethodEnum = z.enum(["CASH", "QRPH"]);
export const paymentTypeEnum = z.enum(["FULL", "DOWNPAYMENT"]);

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
    paymentMethod: paymentMethodEnum.default("QRPH"),
    paymentType: paymentTypeEnum.default("FULL"),
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
