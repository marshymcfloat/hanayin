/** Dashboard query and filter schemas. */
import { z } from "zod";
import { BookingStatus } from "@/prisma/generated/prisma/client";

export const serviceIdSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
});

export const bookingIdSchema = z.object({
  bookingId: z.coerce.number().int().positive(),
});

export const claimServiceSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
});

export const markServedSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
});

export const updateBookingStatusSchema = z.object({
  bookingId: z.coerce.number().int().positive(),
  status: z.nativeEnum(BookingStatus),
});
