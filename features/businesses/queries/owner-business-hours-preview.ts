import "server-only";

import { prisma } from "@/prisma/prisma";
import { Role } from "@/prisma/generated/prisma/enums";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { OwnerBusinessHoursPreviewData } from "@/features/businesses/types/owner-business-hours-preview";

export async function getOwnerBusinessHoursPreviewData(
  actor: OwnerActorContext,
  db: Pick<Prisma.TransactionClient, "business"> = prisma,
): Promise<OwnerBusinessHoursPreviewData | null> {
  const business = await db.business.findFirst({
    where: {
      id: actor.businessId,
      slug: actor.businessSlug,
      owners: {
        some: {
          id: actor.ownerId,
          user_id: actor.userId,
          business_id: actor.businessId,
          user: { role: Role.OWNER },
        },
      },
    },
    select: {
      name: true,
      business_hours: {
        orderBy: [{ category: "asc" }, { day_of_week: "asc" }],
        select: { day_of_week: true, open_time: true, close_time: true, is_closed: true, category: true },
      },
      services: { distinct: ["category"], select: { category: true } },
    },
  });
  if (!business) return null;

  const serviceCategories = Array.from(new Set([
    ...business.services.map((service) => service.category),
    ...business.business_hours.map((hour) => hour.category),
  ])).sort();

  return {
    businessName: business.name,
    hours: business.business_hours.map((hour) => ({
      day_of_week: hour.day_of_week,
      open_time: hour.open_time,
      close_time: hour.close_time,
      is_closed: hour.is_closed,
      category: hour.category,
    })),
    serviceCategories,
  };
}
