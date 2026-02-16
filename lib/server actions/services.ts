"use server";

import { prisma } from "@/prisma/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { revalidatePath, revalidateTag } from "next/cache";
import { tenantCacheTags } from "@/lib/data/cached";

async function resolveTenantBusinessId(businessSlug: string) {
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true },
  });
  return business?.id ?? null;
}

async function hasInvalidSuggestedServices(
  businessId: string,
  suggestedServiceIds: number[],
) {
  if (suggestedServiceIds.length === 0) return false;

  const count = await prisma.service.count({
    where: {
      business_id: businessId,
      id: { in: suggestedServiceIds },
    },
  });

  return count !== suggestedServiceIds.length;
}

// Get all services for a business
export async function getServicesAction() {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const services = await prisma.service.findMany({
      where: {
        business: {
          slug: businessSlug,
        },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: {
        flow_triggers: {
          include: {
            suggested_service: true,
          },
        },
      },
    });

    return { success: true, data: services };
  } catch (error) {
    console.error("Failed to get services:", error);
    return { success: false, error: "Failed to fetch services" };
  }
}

export async function createServiceAction(data: {
  name: string;
  description?: string;
  price: number;
  estimated_cost?: number;
  duration?: number;
  category: string;
  flows?: {
    suggested_service_id: number;
    delay_duration: number;
    delay_unit: "DAYS" | "WEEKS" | "MONTHS";
    type: "REQUIRED" | "SUGGESTED";
  }[];
}) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const businessId = await resolveTenantBusinessId(businessSlug);
    if (!businessId) {
      return { success: false, error: "Business not found" };
    }

    const suggestedIds = Array.from(
      new Set((data.flows ?? []).map((flow) => flow.suggested_service_id)),
    );
    if (await hasInvalidSuggestedServices(businessId, suggestedIds)) {
      return {
        success: false,
        error: "One or more suggested services are invalid for this business.",
      };
    }

    const service = await prisma.service.create({
      data: {
        name: data.name,
        description: data.description || null,
        price: data.price,
        estimated_cost: data.estimated_cost ?? 0,
        duration: data.duration || null,
        category: data.category,
        business_id: businessId,
        flow_triggers: {
          createMany: {
            data:
              data.flows?.map((flow) => ({
                suggested_service_id: flow.suggested_service_id,
                delay_duration: flow.delay_duration,
                delay_unit: flow.delay_unit,
                type: flow.type,
                business_id: businessId,
              })) || [],
          },
        },
      },
    });

    revalidatePath(`/app/${businessSlug}/services`);
    revalidateTag(tenantCacheTags.servicesByBusiness(businessId), "max");
    return { success: true, data: service };
  } catch (error) {
    console.error("Failed to create service:", error);
    return { success: false, error: "Failed to create service" };
  }
}

// Update a service
export async function updateServiceAction(
  serviceId: number,
  data: {
    name?: string;
    description?: string;
    price?: number;
    estimated_cost?: number;
    duration?: number;
    category?: string;
    flows?: {
      suggested_service_id: number;
      delay_duration: number;
      delay_unit: "DAYS" | "WEEKS" | "MONTHS";
      type: "REQUIRED" | "SUGGESTED";
    }[];
  },
) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const businessId = await resolveTenantBusinessId(businessSlug);
    if (!businessId) {
      return { success: false, error: "Business not found" };
    }

    const suggestedIds = Array.from(
      new Set((data.flows ?? []).map((flow) => flow.suggested_service_id)),
    );
    if (await hasInvalidSuggestedServices(businessId, suggestedIds)) {
      return {
        success: false,
        error: "One or more suggested services are invalid for this business.",
      };
    }

    const existingService = await prisma.service.findFirst({
      where: {
        id: serviceId,
        business_id: businessId,
      },
      select: { id: true },
    });

    if (!existingService) {
      return { success: false, error: "Service not found or unauthorized" };
    }

    // Transaction to handle flow updates (delete all existing for this trigger and re-create)
    // This is simplest for now.
    const service = await prisma.$transaction(async (tx) => {
      const updatedService = await tx.service.update({
        where: { id: existingService.id },
        data: {
          name: data.name,
          description: data.description,
          price: data.price,
          estimated_cost: data.estimated_cost,
          duration: data.duration,
          category: data.category,
        },
      });

      if (data.flows) {
        // Delete existing flows triggered by this service
        await tx.serviceFlow.deleteMany({
          where: {
            trigger_service_id: serviceId,
            business_id: businessId,
          },
        });

        // Create new ones
        if (data.flows.length > 0) {
          await tx.serviceFlow.createMany({
            data: data.flows.map((flow) => ({
              trigger_service_id: serviceId,
              suggested_service_id: flow.suggested_service_id,
              delay_duration: flow.delay_duration,
              delay_unit: flow.delay_unit,
              type: flow.type,
              business_id: businessId,
            })),
          });
        }
      }
      return updatedService;
    });

    revalidatePath(`/app/${businessSlug}/services`);
    revalidateTag(tenantCacheTags.servicesByBusiness(businessId), "max");
    return { success: true, data: service };
  } catch (error) {
    console.error("Failed to update service:", error);
    return { success: false, error: "Failed to update service" };
  }
}

// Delete a service
export async function deleteServiceAction(serviceId: number) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const businessId = await resolveTenantBusinessId(businessSlug);
    if (!businessId) {
      return { success: false, error: "Business not found" };
    }

    const deleted = await prisma.service.deleteMany({
      where: {
        id: serviceId,
        business_id: businessId,
      },
    });

    if (deleted.count === 0) {
      return { success: false, error: "Service not found or unauthorized" };
    }

    revalidatePath(`/app/${businessSlug}/services`);
    revalidateTag(tenantCacheTags.servicesByBusiness(businessId), "max");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete service:", error);
    return { success: false, error: "Failed to delete service" };
  }
}

// Get unique categories
export async function getServiceCategoriesAction() {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const services = await prisma.service.findMany({
      where: {
        business: {
          slug: businessSlug,
        },
      },
      select: { category: true },
      distinct: ["category"],
    });

    const categories = services.map((s: { category: string }) => s.category);
    return { success: true, data: categories };
  } catch (error) {
    console.error("Failed to get categories:", error);
    return { success: false, error: "Failed to fetch categories" };
  }
}
