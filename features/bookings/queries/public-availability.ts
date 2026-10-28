import "server-only";
import { prisma } from "@/prisma/prisma";
import { getBookingPolicyByBusinessSlug } from "@/lib/services/booking-policy";

export function getPublicAvailabilityPolicy(businessSlug: string) {
  return getBookingPolicyByBusinessSlug(prisma, businessSlug);
}

export function listPublicOverlappingAssignments(businessId: string, startTime: Date, endTime: Date) {
  return prisma.booking.findMany({
    where: { business_id: businessId, scheduled_at: { lte: endTime }, estimated_end: { gte: startTime }, status: { not: "CANCELLED" } },
    select: { availed_services: { select: { status: true, served_by_id: true } } },
  });
}

export async function listPublicBusinessHours(businessSlug: string) {
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { business_hours: { orderBy: { day_of_week: "asc" }, select: { id: true, day_of_week: true, open_time: true, close_time: true, is_closed: true, category: true, business_id: true } } },
  });
  if (!business) throw new Error("Business not found");
  return business.business_hours;
}
