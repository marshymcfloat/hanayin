import {
  findAvailedServiceScheduleConflict,
  isAvailedServiceOverlapViolation,
  scheduleConflictResult,
} from "@/features/bookings/services/availed-service-overlap";
import { promoteBookingToCompletedIfEligible } from "@/lib/services/booking-status";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { hasStaffPermission, type TenantActorContext } from "@/lib/auth/staff-access";
import {
  AvailedServiceStatus,
  BookingStatus,
  ServiceProviderType,
} from "@/prisma/generated/prisma/client";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

type StaffContext = Extract<TenantActorContext, { success: true }>;

export async function claimEmployeeService(input: {
  businessSlug: string;
  context: StaffContext;
  serviceId: number;
  employeeId: number;
}) {
  const { businessSlug, context, serviceId, employeeId } = input;
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
    return { success: false as const, error: "Forbidden" };
  }
  if (isSelfTarget && !canClaimSelf) {
    return { success: false as const, error: "Forbidden" };
  }
  if (!isSelfTarget && !canOverride) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const [targetEmployee, serviceToClaim] = await Promise.all([
      prisma.employee.findFirst({
        where: { id: employeeId, business: { slug: businessSlug } },
        select: { id: true },
      }),
      prisma.availedService.findFirst({
        where: { id: serviceId, booking: { business: { slug: businessSlug } } },
        select: {
          status: true,
          price: true,
          service_id: true,
          package_id: true,
          served_by_id: true,
          served_by_owner_id: true,
          served_by_type: true,
          booking: { select: { status: true } },
        },
      }),
    ]);

    if (!targetEmployee) {
      return { success: false as const, error: "Employee not found." };
    }
    if (!serviceToClaim) {
      return { success: false as const, error: "Service not found." };
    }
    if (serviceToClaim.booking.status !== BookingStatus.ACCEPTED) {
      return {
        success: false as const,
        error: "Booking must be confirmed before services can be claimed.",
      };
    }
    if (serviceToClaim.served_by_owner_id) {
      return {
        success: false as const,
        error: "Owner-claimed services cannot be reassigned here.",
      };
    }
    if (
      serviceToClaim.status !== AvailedServiceStatus.PENDING &&
      serviceToClaim.status !== AvailedServiceStatus.CLAIMED &&
      serviceToClaim.status !== AvailedServiceStatus.SERVING
    ) {
      return { success: false as const, error: "Service cannot be reassigned." };
    }
    if (serviceToClaim.status !== AvailedServiceStatus.PENDING && !canOverride) {
      return { success: false as const, error: "Forbidden" };
    }

    const scheduleConflict = await findAvailedServiceScheduleConflict({
      businessSlug,
      serviceId,
      providerType: "EMPLOYEE",
      providerId: employeeId,
    });
    if (scheduleConflict) return scheduleConflictResult(scheduleConflict);

    const result = await prisma.availedService.updateMany({
      where: {
        id: serviceId,
        status: serviceToClaim.status,
        served_by_id: serviceToClaim.served_by_id,
        served_by_owner_id: serviceToClaim.served_by_owner_id,
        served_by_type: serviceToClaim.served_by_type,
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
        claimed_at: getCurrentDateTimePH(),
        served_at: null,
        completed_at: null,
      },
    });

    if (result.count === 0) {
      return {
        success: false as const,
        error: "Service already claimed or not found.",
      };
    }

    const updated = await prisma.availedService.findUnique({
      where: { id: serviceId },
      select: { id: true, status: true, served_by_id: true, price: true },
    });
    return { success: true as const, data: updated };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return {
        success: false as const,
        error: "Service already claimed or not found.",
      };
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
    return { success: false as const, error: "Unable to claim service." };
  }
}

export async function unclaimEmployeeService(input: {
  businessSlug: string;
  context: StaffContext;
  serviceId: number;
}) {
  const { businessSlug, context, serviceId } = input;
  const canClaimSelf = hasStaffPermission(
    context,
    StaffPermission.QUEUE_CLAIM_SELF,
  );
  const canOverride = hasStaffPermission(
    context,
    StaffPermission.QUEUE_OVERRIDE_ALL,
  );

  if (!canOverride && !canClaimSelf) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const service = await prisma.availedService.findFirst({
      where: { id: serviceId, booking: { business: { slug: businessSlug } } },
      select: { price: true, status: true, served_by_id: true, served_by_owner_id: true, served_by_type: true },
    });
    if (!service) {
      return { success: false as const, error: "Service not found" };
    }
    if (service.served_by_owner_id) {
      return {
        success: false as const,
        error: "Owner-claimed services cannot be unclaimed here.",
      };
    }
    if (service.status !== AvailedServiceStatus.CLAIMED && service.status !== AvailedServiceStatus.SERVING) {
      return { success: false as const, error: "Unable to unclaim service." };
    }

    const isSelfService =
      context.actorType === "EMPLOYEE" &&
      service.served_by_id === context.employeeId;
    if (!canOverride && (!isSelfService || !canClaimSelf)) {
      return { success: false as const, error: "Forbidden" };
    }

    const result = await prisma.availedService.updateMany({
      where: {
        id: serviceId,
        status: service.status,
        served_by_id: service.served_by_id,
        served_by_owner_id: service.served_by_owner_id,
        served_by_type: service.served_by_type,
        booking: { business: { slug: businessSlug } },
      },
      data: {
        status: AvailedServiceStatus.PENDING,
        served_by_id: null,
        served_by_type: null,
        claimed_at: null,
      },
    });
    if (result.count === 0) {
      return { success: false as const, error: "Unable to unclaim service." };
    }
    return { success: true as const };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return { success: false as const, error: "Unable to unclaim service." };
    }
    console.error("Error unclaiming service:", error);
    return { success: false as const, error: "Unable to unclaim service." };
  }
}

export async function markEmployeeServiceServed(input: {
  businessSlug: string;
  context: StaffContext;
  serviceId: number;
  employeeId: number;
}) {
  const { businessSlug, context, serviceId, employeeId } = input;
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
    return { success: false as const, error: "Forbidden" };
  }
  if (!isSelfTarget && !canOverride) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const data = await prisma.$transaction(async (tx) => {
      const service = await tx.availedService.findFirst({
        where: { id: serviceId, booking: { business: { slug: businessSlug } } },
        select: {
          commission_base: true,
          price: true,
          booking_id: true,
          status: true,
          served_by_id: true,
          served_by_owner_id: true,
          served_by_type: true,
          booking: { select: { status: true } },
        },
      });
      if (!service) throw new Error("Service not found");
      if (service.booking.status !== BookingStatus.ACCEPTED) {
        throw new Error("Booking must be confirmed before services can be served");
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
        where: { id: employeeId, business: { slug: businessSlug } },
        select: { commission_percentage: true },
      });
      if (!employee) throw new Error("Employee not found");

      const nowPH = getCurrentDateTimePH();
      const updateResult = await tx.availedService.updateMany({
        where: {
          id: serviceId,
          status: service.status,
          served_by_id: service.served_by_id,
          served_by_owner_id: service.served_by_owner_id,
          served_by_type: service.served_by_type,
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
      if (!updatedService) throw new Error("Service not found");
      await promoteBookingToCompletedIfEligible(tx, service.booking_id);
      return updatedService;
    });
    return { success: true as const, data };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return { success: false as const, error: "Unable to mark as served." };
    }
    console.error("Error marking service as served:", error);
    return { success: false as const, error: "Unable to mark as served." };
  }
}

export async function unserveEmployeeService(input: {
  businessSlug: string;
  context: StaffContext;
  serviceId: number;
}) {
  const { businessSlug, context, serviceId } = input;
  const canServeSelf = hasStaffPermission(
    context,
    StaffPermission.QUEUE_SERVE_SELF,
  );
  const canOverride = hasStaffPermission(
    context,
    StaffPermission.QUEUE_OVERRIDE_ALL,
  );
  if (!canServeSelf && !canOverride) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const data = await prisma.$transaction(async (tx) => {
      const service = await tx.availedService.findFirst({
        where: { id: serviceId, booking: { business: { slug: businessSlug } } },
        select: {
          commission_base: true,
          price: true,
          served_by_id: true,
          served_by_owner_id: true,
          served_by_type: true,
          status: true,
          booking_id: true,
          booking: { select: { status: true } },
        },
      });
      if (!service || !service.served_by_id) {
        throw new Error("Service not found or not served");
      }
      if (service.served_by_owner_id) {
        throw new Error("Owner-served services cannot be updated here");
      }
      if (service.status !== AvailedServiceStatus.COMPLETED) {
        throw new Error("Service is not completed");
      }

      const isSelfService =
        context.actorType === "EMPLOYEE" &&
        service.served_by_id === context.employeeId;
      if (!canOverride && (!isSelfService || !canServeSelf)) {
        throw new Error("Forbidden");
      }

      const employee = await tx.employee.findFirst({
        where: { id: service.served_by_id, business: { slug: businessSlug } },
        select: { commission_percentage: true },
      });
      if (!employee) throw new Error("Employee not found");

      const updatedService = await tx.availedService.updateMany({
        where: {
          id: serviceId,
          status: service.status,
          served_by_id: service.served_by_id,
          served_by_owner_id: service.served_by_owner_id,
          served_by_type: service.served_by_type,
          booking: { business: { slug: businessSlug } },
        },
        data: {
          status: AvailedServiceStatus.CLAIMED,
          served_at: null,
          completed_at: null,
        },
      });
      if (updatedService.count === 0) throw new Error("Unable to update service");

      if (service.booking.status === BookingStatus.COMPLETED) {
        const reopened = await tx.booking.updateMany({
          where: { id: service.booking_id, status: BookingStatus.COMPLETED, business: { slug: businessSlug } },
          data: { status: BookingStatus.ACCEPTED },
        });
        if (reopened.count !== 1) throw new Error("Unable to reopen booking");
      }
      return { id: serviceId };
    });
    return { success: true as const, data };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return { success: false as const, error: "Unable to unserve." };
    }
    console.error("Error unserving service:", error);
    return { success: false as const, error: "Unable to unserve." };
  }
}
