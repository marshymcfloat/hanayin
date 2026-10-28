import { getCachedPackages, getCachedServices } from "@/lib/data/cached";

export async function readOwnerBookingCatalog(businessId: string) {
  const [services, packages] = await Promise.all([
    getCachedServices(businessId),
    getCachedPackages(businessId),
  ]);

  return {
    services,
    packages,
    categories: Array.from(new Set(services.map((service) => service.category))),
  };
}
