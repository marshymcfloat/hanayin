"use server";

import { prisma } from "@/prisma/prisma";
import {
  AvailedServiceStatus,
  BookingStatus,
  ServiceProviderType,
} from "@/prisma/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { getActiveSaleEvents } from "@/lib/server actions/sale-event";
import { getApplicableDiscount } from "@/lib/utils/pricing";
import {
  getCurrentDateTimePH,
  getEndOfDayPH,
  getStartOfDayPH,
} from "@/lib/date-utils";
import { promoteBookingToCompletedIfEligible } from "@/lib/services/booking-status";
import {
  getEmployeeSpecialtySet,
  hasAnyAllowedCategoryForEmployee,
} from "@/lib/utils/employee-specialties";
import {
  claimServiceSchema,
  serviceIdSchema,
  markServedSchema,
} from "@/lib/zod-schemas/dashboard";
import {
  hasStaffPermission,
  resolveTenantActorContext,
  type TenantActorContext,
} from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import {
  findAvailedServiceScheduleConflict,
  isAvailedServiceOverlapViolation,
  scheduleConflictResult,
} from "@/lib/services/availed-service-overlap";

type StaffContext = Extract<TenantActorContext, { success: true }>;

type StaffContextResult =
  | {
      success: true;
      businessSlug: string;
      context: StaffContext;
    }
  | { success: false; error: string };

async function requireStaffContext(options?: {
  write?: boolean;
}): Promise<StaffContextResult> {
  const auth = await requireAuth(options);
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const context = await resolveTenantActorContext(
    auth.businessSlug,
    auth.session.user.id,
  );
  if (!context.success) {
    return { success: false, error: context.error };
  }

  return { success: true, businessSlug: auth.businessSlug, context };
}

export async function claimServiceAction(
  serviceId: number,
  employeeId: number,
) {
  const validation = claimServiceSchema.safeParse({ serviceId, employeeId });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireStaffContext({ write: true });
  if (!auth.success) return auth;
  const { businessSlug, context } = auth;

  const canClaimSelf = hasStaffPermission(
    context,
    StaffPermission.QUEUE_CLAIM_SELF,
  );
  const canOverride = hasStaffPermission(
    context,
    StaffPermission.QUEUE_OVERRIDE_ALL,
  );
  const isSelfTarget =
    context.actorType === "EMPLOYEE" && context.employeeId === employeeId;

  if (!canOverride && !canClaimSelf) {
    return { success: false, error: "Forbidden" };
  }

  if (isSelfTarget && !canClaimSelf) {
    return { success: false, error: "Forbidden" };
  }

  if (!isSelfTarget && !canOverride) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const [targetEmployee, serviceToClaim] = await Promise.all([
      prisma.employee.findFirst({
        where: {
          id: employeeId,
          business: {
            slug: businessSlug,
          },
        },
        select: { id: true },
      }),
      prisma.availedService.findFirst({
        where: {
          id: serviceId,
          booking: {
            business: {
              slug: businessSlug,
            },
          },
        },
        select: {
          status: true,
          price: true,
          service_id: true,
          package_id: true,
          served_by_id: true,
          served_by_owner_id: true,
          booking: { select: { status: true } },
        },
      }),
    ]);

    if (!targetEmployee) {
      return { success: false, error: "Employee not found." };
    }

    if (!serviceToClaim) {
      return { success: false, error: "Service not found." };
    }

    if (serviceToClaim.booking.status !== BookingStatus.ACCEPTED) {
      return {
        success: false,
        error: "Booking must be confirmed before services can be claimed.",
      };
    }

    if (serviceToClaim.served_by_owner_id) {
      return {
        success: false,
        error: "Owner-claimed services cannot be reassigned here.",
      };
    }

    if (
      serviceToClaim.status !== AvailedServiceStatus.PENDING &&
      serviceToClaim.status !== AvailedServiceStatus.CLAIMED &&
      serviceToClaim.status !== AvailedServiceStatus.SERVING
    ) {
      return { success: false, error: "Service cannot be reassigned." };
    }

    if (
      serviceToClaim.status !== AvailedServiceStatus.PENDING &&
      !canOverride
    ) {
      return { success: false, error: "Forbidden" };
    }

    const scheduleConflict = await findAvailedServiceScheduleConflict({
      businessSlug,
      serviceId,
      providerType: "EMPLOYEE",
      providerId: employeeId,
    });
    if (scheduleConflict) {
      return scheduleConflictResult(scheduleConflict);
    }

    const saleEventsResult = await getActiveSaleEvents(businessSlug);
    const saleEvents =
      (saleEventsResult.success && saleEventsResult.data) || [];

    const discountInfo = getApplicableDiscount(
      serviceToClaim.service_id,
      serviceToClaim.package_id ?? undefined,
      serviceToClaim.price,
      saleEvents,
    );

    const now = getCurrentDateTimePH();
    const result = await prisma.availedService.updateMany({
      where: {
        id: serviceId,
        status: {
          in: [
            AvailedServiceStatus.PENDING,
            AvailedServiceStatus.CLAIMED,
            AvailedServiceStatus.SERVING,
          ],
        },
        booking: {
          business: { slug: businessSlug },
          status: BookingStatus.ACCEPTED,
        },
      },
      data: {
        status: AvailedServiceStatus.CLAIMED,
        served_by_id: employeeId,
        served_by_owner_id: null,
        served_by_type: ServiceProviderType.EMPLOYEE,
        claimed_at: now,
        served_at: null,
        completed_at: null,
        ...(discountInfo
          ? {
              final_price: discountInfo.finalPrice,
              discount: discountInfo.discount,
              discount_reason: discountInfo.reason,
              commission_base: discountInfo.finalPrice,
            }
          : {
              final_price: serviceToClaim.price,
              discount: 0,
              discount_reason: null,
              commission_base: serviceToClaim.price,
            }),
      },
    });

    if (result.count === 0) {
      return { success: false, error: "Service already claimed or not found." };
    }

    const updated = await prisma.availedService.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        status: true,
        served_by_id: true,
        price: true,
      },
    });

    revalidatePath(`/app/${businessSlug}`);
    return { success: true, data: updated };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return { success: false, error: "Service already claimed or not found." };
    }
    if (isAvailedServiceOverlapViolation(error)) {
      const conflict = await findAvailedServiceScheduleConflict({
        businessSlug,
        serviceId,
        providerType: "EMPLOYEE",
        providerId: employeeId,
      }).catch(() => null);
      return scheduleConflictResult(conflict);
    }
    console.error("Error claiming service:", error);
    return { success: false, error: "Unable to claim service." };
  }
}

export async function unclaimServiceAction(serviceId: number) {
  const validation = serviceIdSchema.safeParse({ serviceId });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireStaffContext({ write: true });
  if (!auth.success) return auth;
  const { businessSlug, context } = auth;

  const canClaimSelf = hasStaffPermission(
    context,
    StaffPermission.QUEUE_CLAIM_SELF,
  );
  const canOverride = hasStaffPermission(
    context,
    StaffPermission.QUEUE_OVERRIDE_ALL,
  );

  if (!canOverride && !canClaimSelf) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const service = await prisma.availedService.findFirst({
      where: {
        id: serviceId,
        booking: { business: { slug: businessSlug } },
      },
      select: {
        price: true,
        served_by_id: true,
        served_by_owner_id: true,
      },
    });

    if (!service) return { success: false, error: "Service not found" };

    if (service.served_by_owner_id) {
      return {
        success: false,
        error: "Owner-claimed services cannot be unclaimed here.",
      };
    }

    const isSelfService =
      context.actorType === "EMPLOYEE" &&
      service.served_by_id === context.employeeId;
    if (!canOverride && (!isSelfService || !canClaimSelf)) {
      return { success: false, error: "Forbidden" };
    }

    const result = await prisma.availedService.updateMany({
      where: {
        id: serviceId,
        status: {
          in: [AvailedServiceStatus.CLAIMED, AvailedServiceStatus.SERVING],
        },
        booking: { business: { slug: businessSlug } },
      },
      data: {
        status: AvailedServiceStatus.PENDING,
        served_by_id: null,
        served_by_type: null,
        claimed_at: null,
        final_price: service.price,
        discount: 0,
        discount_reason: null,
        commission_base: service.price,
      },
    });

    if (result.count === 0) {
      return { success: false, error: "Unable to unclaim service." };
    }

    revalidatePath(`/app/${businessSlug}`);
    return { success: true };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return { success: false, error: "Unable to unclaim service." };
    }
    console.error("Error unclaiming service:", error);
    return { success: false, error: "Unable to unclaim service." };
  }
}

export async function markServiceServedAction(
  serviceId: number,
  employeeId: number,
) {
  const validation = markServedSchema.safeParse({ serviceId, employeeId });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireStaffContext({ write: true });
  if (!auth.success) return auth;
  const { businessSlug, context } = auth;

  const canServeSelf = hasStaffPermission(
    context,
    StaffPermission.QUEUE_SERVE_SELF,
  );
  const canOverride = hasStaffPermission(
    context,
    StaffPermission.QUEUE_OVERRIDE_ALL,
  );
  const isSelfTarget =
    context.actorType === "EMPLOYEE" && context.employeeId === employeeId;

  if (isSelfTarget && !canServeSelf) {
    return { success: false, error: "Forbidden" };
  }

  if (!isSelfTarget && !canOverride) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const service = await tx.availedService.findFirst({
        where: {
          id: serviceId,
          booking: { business: { slug: businessSlug } },
        },
        select: {
          commission_base: true,
          price: true,
          booking_id: true,
          status: true,
          served_by_id: true,
          served_by_owner_id: true,
          booking: { select: { status: true } },
        },
      });

      if (!service) throw new Error("Service not found");
      if (service.booking.status !== BookingStatus.ACCEPTED) {
        throw new Error(
          "Booking must be confirmed before services can be served",
        );
      }
      if (service.served_by_owner_id) {
        throw new Error("Owner-claimed services cannot be served here");
      }
      if (
        service.status !== AvailedServiceStatus.CLAIMED &&
        service.status !== AvailedServiceStatus.SERVING
      ) {
        throw new Error("Service is not claimable for serving");
      }

      const isSelfService =
        context.actorType === "EMPLOYEE" &&
        service.served_by_id === context.employeeId;
      if (!canOverride && (!isSelfService || !canServeSelf)) {
        throw new Error("Forbidden");
      }

      const employee = await tx.employee.findFirst({
        where: {
          id: employeeId,
          business: {
            slug: businessSlug,
          },
        },
        select: { commission_percentage: true },
      });

      if (!employee) throw new Error("Employee not found");

      const baseAmount = service.commission_base ?? service.price;
      const commissionAmount =
        (baseAmount * employee.commission_percentage) / 100;

      await tx.employee.update({
        where: { id: employeeId },
        data: {
          salary: { increment: commissionAmount },
        },
      });

      const nowPH = getCurrentDateTimePH();
      const updateResult = await tx.availedService.updateMany({
        where: {
          id: serviceId,
          status: {
            in: [AvailedServiceStatus.CLAIMED, AvailedServiceStatus.SERVING],
          },
          booking: {
            business: { slug: businessSlug },
            status: BookingStatus.ACCEPTED,
          },
        },
        data: {
          served_by_id: employeeId,
          served_by_owner_id: null,
          served_by_type: ServiceProviderType.EMPLOYEE,
          status: AvailedServiceStatus.COMPLETED,
          served_at: nowPH,
          completed_at: nowPH,
        },
      });
      if (updateResult.count === 0) {
        throw new Error("Unable to mark service as served");
      }

      const updatedService = await tx.availedService.findUnique({
        where: { id: serviceId },
      });
      if (!updatedService) {
        throw new Error("Service not found");
      }

      await promoteBookingToCompletedIfEligible(tx, service.booking_id);

      return updatedService;
    });

    revalidatePath(`/app/${businessSlug}`);
    return { success: true, data: result };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return { success: false, error: "Unable to mark as served." };
    }
    console.error("Error marking service as served:", error);
    return { success: false, error: "Unable to mark as served." };
  }
}

export async function unserveServiceAction(serviceId: number) {
  const validation = serviceIdSchema.safeParse({ serviceId });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireStaffContext({ write: true });
  if (!auth.success) return auth;
  const { businessSlug, context } = auth;

  const canServeSelf = hasStaffPermission(
    context,
    StaffPermission.QUEUE_SERVE_SELF,
  );
  const canOverride = hasStaffPermission(
    context,
    StaffPermission.QUEUE_OVERRIDE_ALL,
  );

  if (!canServeSelf && !canOverride) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const service = await tx.availedService.findFirst({
        where: {
          id: serviceId,
          booking: { business: { slug: businessSlug } },
        },
        select: {
          commission_base: true,
          price: true,
          served_by_id: true,
          served_by_owner_id: true,
          booking_id: true,
          booking: { select: { status: true } },
        },
      });

      if (!service || !service.served_by_id)
        throw new Error("Service not found or not served");
      if (service.served_by_owner_id) {
        throw new Error("Owner-served services cannot be updated here");
      }

      const isSelfService =
        context.actorType === "EMPLOYEE" &&
        service.served_by_id === context.employeeId;
      if (!canOverride && (!isSelfService || !canServeSelf)) {
        throw new Error("Forbidden");
      }

      const employee = await tx.employee.findUnique({
        where: { id: service.served_by_id },
        select: { commission_percentage: true },
      });

      if (!employee) throw new Error("Employee not found");

      const baseAmount = service.commission_base ?? service.price;
      const commissionAmount =
        (baseAmount * employee.commission_percentage) / 100;

      await tx.employee.update({
        where: { id: service.served_by_id },
        data: {
          salary: { decrement: commissionAmount },
        },
      });

      const updatedService = await tx.availedService.updateMany({
        where: {
          id: serviceId,
          status: AvailedServiceStatus.COMPLETED,
          booking: { business: { slug: businessSlug } },
        },
        data: {
          status: AvailedServiceStatus.CLAIMED,
          served_at: null,
          completed_at: null,
        },
      });

      if (updatedService.count === 0) {
        throw new Error("Unable to update service");
      }

      if (service.booking.status === BookingStatus.COMPLETED) {
        await tx.booking.update({
          where: { id: service.booking_id },
          data: { status: BookingStatus.ACCEPTED },
        });
      }

      return { id: serviceId };
    });

    revalidatePath(`/app/${businessSlug}`);
    return { success: true, data: result };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return { success: false, error: "Unable to unserve." };
    }
    console.error("Error unserving service:", error);
    return { success: false, error: "Unable to unserve." };
  }
}

export async function getManagerQueueBoardAction() {
  const auth = await requireStaffContext();
  if (!auth.success) return auth;
  const { businessSlug, context } = auth;

  if (!hasStaffPermission(context, StaffPermission.QUEUE_OVERRIDE_ALL)) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const [services, employees] = await Promise.all([
      prisma.availedService.findMany({
        where: {
          booking: {
            business: {
              slug: businessSlug,
            },
            status: BookingStatus.ACCEPTED,
          },
          status: {
            in: [
              AvailedServiceStatus.PENDING,
              AvailedServiceStatus.CLAIMED,
              AvailedServiceStatus.SERVING,
            ],
          },
        },
        select: {
          id: true,
          status: true,
          price: true,
          scheduled_at: true,
          package: {
            select: {
              name: true,
            },
          },
          service: {
            select: {
              name: true,
              category: true,
              duration: true,
            },
          },
          served_by_id: true,
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
          served_by: {
            select: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ scheduled_at: "asc" }, { created_at: "asc" }],
        take: 100,
      }),
      prisma.employee.findMany({
        where: {
          business: {
            slug: businessSlug,
          },
        },
        select: {
          id: true,
          specialties: true,
          user: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          user: {
            name: "asc",
          },
        },
      }),
    ]);

    return { success: true, data: { services, employees } };
  } catch (error) {
    console.error("Error fetching manager queue board:", error);
    return { success: false, error: "Failed to fetch manager queue board." };
  }
}

type EmployeeAuthResult =
  | {
      success: true;
      businessSlug: string;
      employeeId: number;
      specialties: string[];
      context: StaffContext;
    }
  | { success: false; error: string };

function getTodayBookingFilter() {
  const startOfToday = getStartOfDayPH();
  const endOfToday = getEndOfDayPH();

  return {
    OR: [
      {
        scheduled_at: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
      {
        scheduled_at: null,
        created_at: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
    ],
  };
}

async function requireEmployeeAuth(options?: {
  write?: boolean;
  permission?: StaffPermission;
}): Promise<EmployeeAuthResult> {
  const auth = await requireStaffContext({ write: options?.write });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { businessSlug, context } = auth;
  if (context.actorType !== "EMPLOYEE") {
    return { success: false, error: "Unauthorized" };
  }

  if (options?.permission && !hasStaffPermission(context, options.permission)) {
    return { success: false, error: "Forbidden" };
  }

  const employee = await prisma.employee.findUnique({
    where: {
      id: context.employeeId,
    },
    select: {
      id: true,
      specialties: true,
    },
  });

  if (!employee) {
    return { success: false, error: "Unauthorized" };
  }

  return {
    success: true,
    businessSlug,
    employeeId: employee.id,
    specialties: employee.specialties ?? [],
    context,
  };
}

export async function getEmployeeTodayBookingsAction() {
  const auth = await requireEmployeeAuth({
    permission: StaffPermission.PAYMENT_COLLECT,
  });
  if (!auth.success) return [];

  const { businessSlug, specialties } = auth;

  try {
    const bookings = await prisma.booking.findMany({
      where: {
        business: { slug: businessSlug },
        status: { in: [BookingStatus.ACCEPTED, BookingStatus.COMPLETED] },
        ...getTodayBookingFilter(),
      },
      select: {
        id: true,
        status: true,
        payment_status: true,
        payment_method: true,
        grand_total: true,
        amount_paid: true,
        created_at: true,
        scheduled_at: true,
        customer: {
          select: {
            name: true,
            email: true,
          },
        },
        availed_services: {
          select: {
            id: true,
            service: {
              select: {
                name: true,
                category: true,
              },
            },
          },
        },
        payments: {
          where: { status: { in: ["SUCCEEDED", "CANCELED"] } },
          select: {
            id: true,
            status: true,
            payment_method: true,
            amount_principal: true,
            provider_reference: true,
            paid_at: true,
          },
          orderBy: { created_at: "desc" },
        },
      },
      orderBy: [
        {
          scheduled_at: "asc",
        },
        {
          created_at: "desc",
        },
      ],
      take: 50,
    });

    const employeeSpecialtySet = getEmployeeSpecialtySet(specialties);

    return bookings.filter((booking) =>
      hasAnyAllowedCategoryForEmployee(
        booking.availed_services.map((item) => item.service.category),
        employeeSpecialtySet,
      ),
    );
  } catch (error) {
    console.error("Error fetching employee today bookings:", error);
    return [];
  }
}

export async function getEmployeeServiceWorkAction() {
  const auth = await requireEmployeeAuth();
  if (!auth.success) return auth;
  const { businessSlug, employeeId } = auth;

  const include = {
    service: true,
    package: true,
    booking: {
      select: {
        customer: true,
        is_anonymous_walk_in: true,
        customer_label: true,
        scheduled_at: true,
        created_at: true,
        downpayment: true,
        downpayment_status: true,
        grand_total: true,
        amount_paid: true,
        payment_status: true,
      },
    },
  } as const;

  try {
    const [pending, active, completed] = await Promise.all([
      prisma.availedService.findMany({
        where: {
          status: AvailedServiceStatus.PENDING,
          booking: { business: { slug: businessSlug }, status: BookingStatus.ACCEPTED },
        },
        include,
        orderBy: { scheduled_at: "asc" },
      }),
      prisma.availedService.findMany({
        where: {
          served_by_id: employeeId,
          status: { in: [AvailedServiceStatus.CLAIMED, AvailedServiceStatus.SERVING] },
          booking: { business: { slug: businessSlug }, status: BookingStatus.ACCEPTED },
        },
        include,
        orderBy: { updated_at: "desc" },
        take: 50,
      }),
      prisma.availedService.findMany({
        where: {
          served_by_id: employeeId,
          status: AvailedServiceStatus.COMPLETED,
          booking: { business: { slug: businessSlug } },
        },
        include,
        orderBy: { updated_at: "desc" },
        take: 10,
      }),
    ]);

    return { success: true as const, data: { pending, active, completed } };
  } catch (error) {
    console.error("Error fetching employee service work:", error);
    return { success: false as const, error: "Unable to refresh service work." };
  }
}
