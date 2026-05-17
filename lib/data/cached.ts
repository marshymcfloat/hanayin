import { prisma } from "@/prisma/prisma";
import { cacheTag } from "next/cache";

export const tenantCacheTags = {
  businessBySlug: (slug: string) => `business:slug:${slug}`,
  businessHoursAndEmployees: (slug: string) =>
    `business:hours-employees:${slug}`,
  servicesByBusiness: (businessId: string) => `services:business:${businessId}`,
  packagesByBusiness: (businessId: string) => `packages:business:${businessId}`,
};

export async function getCachedBusinessBySlug(slug: string) {
  "use cache";
  cacheTag(tenantCacheTags.businessBySlug(slug));
  cacheTag(tenantCacheTags.businessHoursAndEmployees(slug));
  return prisma.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      initials: true,
      imageUrl: true,
      timezone: true,
      // Hours used by the public booking greeting to render a
      // humanized "Mon–Sat · 9 AM – 6 PM" subline. Small payload
      // (≤ 7 rows × few fields × per category).
      business_hours: {
        select: {
          day_of_week: true,
          open_time: true,
          close_time: true,
          is_closed: true,
          category: true,
        },
      },
    },
  });
}

export async function getCachedServices(businessId: string) {
  "use cache";
  cacheTag(tenantCacheTags.servicesByBusiness(businessId));
  return prisma.service.findMany({
    where: { business_id: businessId },
  });
}

export async function getCachedBusinessWithHoursAndEmployees(slug: string) {
  "use cache";
  cacheTag(tenantCacheTags.businessBySlug(slug));
  cacheTag(tenantCacheTags.businessHoursAndEmployees(slug));
  return prisma.business.findUnique({
    where: { slug },
    include: {
      business_hours: true,
      employees: {
        include: {
          user: {
            select: { name: true },
          },
          // Loaded eagerly because computeSlots() filters every
          // candidate slot against schedule rows when the business has
          // formal_schedule_enabled=true. Empty array (default) means
          // no formal shift constraint for that employee.
          schedule: {
            select: {
              day_of_week: true,
              start_time: true,
              end_time: true,
            },
          },
        },
      },
      owners: {
        select: {
          id: true,
          user: {
            select: { name: true },
          },
          specialties: true,
        },
      },
    },
  });
}

export async function getCachedPackages(businessId: string) {
  "use cache";
  cacheTag(tenantCacheTags.packagesByBusiness(businessId));
  return prisma.servicePackage.findMany({
    where: { business_id: businessId },
    include: {
      items: {
        include: {
          service: true,
        },
      },
    },
  });
}
