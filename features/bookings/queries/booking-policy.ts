import "server-only";
import { getBookingPolicyByBusinessSlug } from "@/lib/services/booking-policy";
import { prisma } from "@/prisma/prisma";

export async function readPublicBookingPolicy(businessSlug: string) {
  return getBookingPolicyByBusinessSlug(prisma, businessSlug);
}
