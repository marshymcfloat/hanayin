import "server-only";
import { prisma } from "@/prisma/prisma";
import { buildBookingPricingSnapshot } from "@/features/bookings/services/booking-pricing";
export async function readBookingQuote(input: Omit<Parameters<typeof buildBookingPricingSnapshot>[0], "db">) {
  return buildBookingPricingSnapshot({ db: prisma, ...input });
}
