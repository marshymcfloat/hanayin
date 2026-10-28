import "server-only";
import { prisma } from "@/prisma/prisma";
import type { BusinessHourInput } from "@/features/businesses/types/business-hours";

export async function readPublicBusinessHours(businessSlug: string): Promise<BusinessHourInput[]> {
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { business_hours: {
      orderBy: { day_of_week: "asc" },
      select: { day_of_week: true, open_time: true, close_time: true, is_closed: true, category: true },
    } },
  });
  if (!business) throw new Error("Business not found");
  return business.business_hours.map(hour => ({
    day_of_week: hour.day_of_week, open_time: hour.open_time, close_time: hour.close_time,
    is_closed: hour.is_closed, category: hour.category,
  }));
}

export async function readPublicServiceCategories(businessSlug: string): Promise<string[]> {
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { services: { select: { category: true }, distinct: ["category"] } },
  });
  if (!business) throw new Error("Business not found");
  return business.services.map(service => service.category);
}
