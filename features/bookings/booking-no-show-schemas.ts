import "server-only";
import { z } from "zod";
import { bookingDetailIdSchema } from "@/features/bookings/booking-detail-schemas";

export const bookingNoShowIdSchema = z.coerce.number().pipe(bookingDetailIdSchema);
