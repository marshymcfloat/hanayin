import { prisma } from "@/prisma/prisma";

export async function getPublicBookingDetails(businessSlug: string, id: number) {
  return prisma.booking.findFirst({ where: { id, business: { slug: businessSlug } }, include: { business: true, availed_services: { include: { service: true } }, customer: true } });
}
