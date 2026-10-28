import "server-only";
import { recheckBookingCommandAccess, type BookingCommandActor } from "@/features/bookings/booking-command-access";
import type { Prisma } from "@/prisma/generated/prisma/client";

export type BookingNoShowActor = BookingCommandActor;

export async function recheckBookingNoShowAccess(tx: Prisma.TransactionClient, expected: BookingNoShowActor): Promise<Prisma.BusinessWhereInput | null> {
  return recheckBookingCommandAccess(tx, expected, "BOOKING_MARK_NO_SHOW");
}
