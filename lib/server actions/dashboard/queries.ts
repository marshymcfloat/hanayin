"use server";

import { prisma } from "@/prisma/prisma";
import {
  AvailedServiceStatus,
} from "@/prisma/generated/prisma/client";
import { requireAuth } from "@/lib/auth/guards";
import { revalidatePath } from "next/cache";
import {
  getEmployeeSpecialtySet,
  isCategoryAllowedForEmployee,
} from "@/lib/utils/employee-specialties";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";
import { logger } from "@/lib/logger";

export async function getPendingServicesAction() {
  const auth = await requireAuth();
  if (!auth.success) return [];
  const { businessSlug, session } = auth;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
      select: { id: true },
    });

    if (!business) return [];

    const pendingServices = await prisma.availedService.findMany({
      where: {
        booking: {
          business_id: business.id,
          status: { in: ["ACCEPTED"] },
        },
        status: AvailedServiceStatus.PENDING,
      },
      select: {
        id: true,
        price: true,
        scheduled_at: true,
        package_id: true,
        package: {
          select: {
            name: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
            category: true,
          },
        },
        booking: {
          select: {
            customer: {
              select: {
                name: true,
              },
            },
            scheduled_at: true,
            created_at: true,
            downpayment: true,
            downpayment_status: true,
            grand_total: true,
            amount_paid: true,
            payment_status: true,
          },
        },
      },
      orderBy: {
        scheduled_at: "asc",
      },
    });

    if (session.user.role !== "EMPLOYEE") {
      return pendingServices;
    }

    const employee = await prisma.employee.findFirst({
      where: {
        user_id: session.user.id,
        business_id: business.id,
      },
      select: {
        specialties: true,
      },
    });

    if (!employee) {
      return [];
    }

    const employeeSpecialtySet = getEmployeeSpecialtySet(
      employee.specialties ?? [],
    );

    return pendingServices.filter((item) =>
      isCategoryAllowedForEmployee(item.service.category, employeeSpecialtySet),
    );
  } catch (error) {
    console.error("Error fetching pending services:", error);
    return [];
  }
}

export async function getOwnerClaimedServicesAction() {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const { businessSlug, session } = auth;

  if (session?.user?.role !== "OWNER") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const owner = await prisma.owner.findFirst({
      where: {
        user_id: session.user.id,
        business: { slug: businessSlug },
      },
      select: { id: true },
    });

    if (!owner) {
      return { success: false, error: "Owner not found" };
    }

    const claimedServices = await prisma.availedService.findMany({
      where: {
        served_by_owner_id: owner.id,
        status: {
          in: [AvailedServiceStatus.CLAIMED, AvailedServiceStatus.SERVING],
        },
        booking: {
          business: { slug: businessSlug },
          status: { in: ["ACCEPTED"] },
        },
      },
      select: {
        id: true,
        price: true,
        final_price: true,
        discount: true,
        discount_reason: true,
        scheduled_at: true,
        claimed_at: true,
        status: true,
        package_id: true,
        package: {
          select: {
            name: true,
          },
        },
        service: {
          select: {
            name: true,
            duration: true,
          },
        },
        booking: {
          select: {
            customer: {
              select: {
                name: true,
              },
            },
            scheduled_at: true,
            created_at: true,
          },
        },
      },
      orderBy: {
        scheduled_at: "asc",
      },
    });

    return { success: true, data: claimedServices };
  } catch (error) {
    console.error("Error fetching owner claimed services:", error);
    return { success: false, error: "Unable to fetch claimed services." };
  }
}

async function getBusinessBySlug(slug: string) {
  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  return business;
}

export async function getOwners(businessSlug: string) {
  const business = await getBusinessBySlug(businessSlug);

  return await prisma.owner.findMany({
    where: { business_id: business.id },
    select: {
      id: true,
      specialties: true,
      user: {
        select: {
          name: true,
          contact_number: true,
        },
      },
    },
  });
}

export async function updateOwnerSpecialties(
  ownerId: number,
  specialties: string[],
) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return { success: false, error: "Unauthorized" };

  try {
    // Verify owner belongs to business
    const owner = await prisma.owner.findFirst({
      where: {
        id: ownerId,
        business: { slug: auth.businessSlug },
      },
    });

    if (!owner) {
      return { success: false, error: "Owner not found" };
    }

    // Update specialties
    await prisma.owner.update({
      where: { id: ownerId },
      data: { specialties },
    });

    try {
      await detectAndEmitFutureBookingConflicts({
        businessSlug: auth.businessSlug,
        trigger: "OWNER_SPECIALTIES_UPDATED",
      });
    } catch (error) {
      logger.warn("[BookingConflicts] Failed after owner specialty update", {
        ownerId,
        businessSlug: auth.businessSlug,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    revalidatePath(`/app/${auth.businessSlug}/owners`);
    return { success: true };
  } catch (error) {
    console.error("Error updating owner specialties:", error);
    return { success: false, error: "Failed to update owner specialties" };
  }
}
