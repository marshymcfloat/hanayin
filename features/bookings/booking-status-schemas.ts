import "server-only";
import { z } from "zod";
import { BookingStatus } from "@/prisma/generated/prisma/enums";
import { bookingDetailIdSchema } from "@/features/bookings/booking-detail-schemas";

export const updateBookingStatusSchema = z.object({
  bookingId: z.coerce.number().pipe(bookingDetailIdSchema),
  status: z.nativeEnum(BookingStatus),
});
