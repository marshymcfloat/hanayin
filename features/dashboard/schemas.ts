/** Dashboard query and filter schemas. */
import { z } from "zod";

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
