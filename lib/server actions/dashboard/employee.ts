"use server";

import { prisma } from "@/prisma/prisma";
import {
  AvailedServiceStatus,
  BookingStatus,
  PaymentStatus,
  Prisma,
  ServiceProviderType,
} from "@/prisma/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { getActiveSaleEvents } from "@/lib/server actions/sale-event";
import {
  createPayMongoQrPaymentIntent,
  getPayMongoPaymentIntentById,
} from "@/lib/server actions/paymongo";
import { getApplicableDiscount } from "@/lib/utils/pricing";
import { calculateBookingTotal } from "@/lib/utils/pricing";
import { getQrExpirySeconds } from "@/lib/payments/config";
import {
  getCurrentDateTimePH,
  getEndOfDayPH,
  getStartOfDayPH,
} from "@/lib/date-utils";
import { promoteBookingToCompletedIfEligible } from "@/lib/services/booking-status";
import { publishEvent } from "@/lib/services/outbox";
import {
  getEmployeeSpecialtySet,
  hasAnyAllowedCategoryForEmployee,
} from "@/lib/utils/employee-specialties";
import {
  bookingIdSchema,
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

type StaffContext = Extract<TenantActorContext, { success: true }>;

type StaffContextResult =
  | {
      success: true;
      businessSlug: string;
      context: StaffContext;
    }
  | { success: false; error: string };

async function requireStaffContext(
  options?: { write?: boolean },
): Promise<StaffContextResult> {
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
        },
      }),
    ]);

    if (!targetEmployee) {
      return { success: false, error: "Employee not found." };
    }

    if (!serviceToClaim) {
      return { success: false, error: "Service not found." };
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

    const saleEventsResult = await getActiveSaleEvents(businessSlug);
    const saleEvents = (saleEventsResult.success && saleEventsResult.data) || [];

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
        booking: { business: { slug: businessSlug } },
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
    console.error("Error claiming service:", error);
    return { success: false, error: "Service already claimed or not found." };
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
        },
      });

      if (!service) throw new Error("Service not found");
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
          booking: { business: { slug: businessSlug } },
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

type QrReviewStatus = "pending" | "paid" | "failed" | "expired";

type EmployeeAuthResult =
  | {
      success: true;
      businessSlug: string;
      employeeId: number;
      specialties: string[];
      context: StaffContext;
    }
  | { success: false; error: string };

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mapPayMongoStatusToQrReviewStatus(
  status: string | undefined,
  expiresAt?: string,
): QrReviewStatus {
  const normalizedStatus = status?.toLowerCase();

  if (normalizedStatus === "succeeded") return "paid";
  if (normalizedStatus === "failed" || normalizedStatus === "canceled") {
    return "failed";
  }
  if (normalizedStatus === "expired") return "expired";

  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return "expired";
  }

  return "pending";
}

async function resolveQrReviewPayload(
  paymentIntentId: string,
  fallbackAmount: number,
) {
  const paymentIntent = await getPayMongoPaymentIntentById(paymentIntentId);
  const attributes = paymentIntent?.attributes;

  if (!isRecord(attributes)) {
    return null;
  }

  const nextAction = attributes.next_action;
  const nextActionRecord = isRecord(nextAction) ? nextAction : null;
  const code = nextActionRecord && isRecord(nextActionRecord.code)
    ? nextActionRecord.code
    : null;
  const redirect = nextActionRecord && isRecord(nextActionRecord.redirect)
    ? nextActionRecord.redirect
    : null;

  const qrImageCandidate =
    (code?.image_url as string | undefined) ||
    (redirect?.url as string | undefined) ||
    (redirect?.checkout_url as string | undefined);

  if (!qrImageCandidate) {
    return null;
  }

  const expiresAt = (code?.expires_at as string | undefined) || undefined;
  const amountFromIntent =
    typeof attributes.amount === "number" ? attributes.amount / 100 : null;
  const status =
    typeof attributes.status === "string" ? attributes.status : undefined;

  return {
    qrImage: qrImageCandidate,
    expiresAt,
    amount: amountFromIntent ?? fallbackAmount,
    status: mapPayMongoStatusToQrReviewStatus(status, expiresAt),
  };
}

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

async function requireEmployeeAuth(
  options?: { write?: boolean; permission?: StaffPermission },
): Promise<EmployeeAuthResult> {
  const auth = await requireStaffContext({ write: options?.write });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { businessSlug, context } = auth;
  if (context.actorType !== "EMPLOYEE") {
    return { success: false, error: "Unauthorized" };
  }

  if (
    options?.permission &&
    !hasStaffPermission(context, options.permission)
  ) {
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
        status: {
          not: BookingStatus.CANCELLED,
        },
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
        paymongo_payment_intent_id: true,
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

export async function createEmployeeBookingBalanceQrAction(bookingId: number) {
  const validation = bookingIdSchema.safeParse({ bookingId });
  if (!validation.success) {
    return { success: false, error: "Invalid booking ID." };
  }

  const auth = await requireEmployeeAuth({
    write: true,
    permission: StaffPermission.PAYMENT_COLLECT,
  });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        business: { slug: businessSlug },
        status: { not: BookingStatus.CANCELLED },
        ...getTodayBookingFilter(),
      },
      select: {
        id: true,
        status: true,
        payment_method: true,
        payment_status: true,
        grand_total: true,
        amount_paid: true,
        customer: {
          select: {
            name: true,
            email: true,
          },
        },
        payments: {
          where: { status: "PENDING" },
          orderBy: { created_at: "desc" },
          take: 1,
          select: {
            id: true,
            amount_principal: true,
            amount_charged: true,
            paymongo_payment_intent_id: true,
          },
        },
      },
    });

    if (!booking) {
      return { success: false, error: "Booking not found for today." };
    }

    if (booking.payment_method !== "QRPH") {
      return { success: false, error: "This booking is not set to QR payment." };
    }

    const remainingBalance = roundMoney(
      Math.max(0, booking.grand_total - booking.amount_paid),
    );

    if (booking.payment_status === PaymentStatus.PAID || remainingBalance <= 0) {
      return { success: false, error: "This booking is already fully paid." };
    }

    const pendingPayment = booking.payments[0];
    const pendingPrincipalAmount = pendingPayment
      ? roundMoney(Math.max(0, pendingPayment.amount_principal))
      : null;
    const hasMatchingPendingPrincipal =
      pendingPrincipalAmount !== null &&
      Math.abs(pendingPrincipalAmount - remainingBalance) < 0.01;

    if (pendingPayment?.paymongo_payment_intent_id) {
      if (hasMatchingPendingPrincipal) {
        const existingQr = await resolveQrReviewPayload(
          pendingPayment.paymongo_payment_intent_id,
          pendingPayment.amount_charged,
        );

        if (existingQr && existingQr.status === "pending") {
          return { success: true, data: existingQr };
        }
      }

      await prisma.bookingPayment.updateMany({
        where: {
          booking_id: booking.id,
          status: "PENDING",
        },
        data: {
          status: "EXPIRED",
        },
      });
    }

    if (!booking.customer.email) {
      return {
        success: false,
        error: "Customer email is required to generate a QR payment.",
      };
    }

    const amountToCharge = calculateBookingTotal({
      subtotal: remainingBalance,
      voucherDiscount: 0,
      paymentMethod: "QRPH",
      paymentType: "FULL",
    });
    const configuredAppUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";
    const returnUrl = `${configuredAppUrl.replace(/\/$/, "")}/${businessSlug}/booking/success`;

    const qrPayment = await createPayMongoQrPaymentIntent({
      amount: Math.round(amountToCharge * 100),
      description: `Employee initiated payment for booking #${booking.id}`,
      metadata: {
        bookingId: String(booking.id),
        businessSlug,
        stage: "BALANCE",
        principalAmount: remainingBalance.toFixed(2),
        initiatedBy: "EMPLOYEE",
      },
      billing: {
        name: booking.customer.name,
        email: booking.customer.email,
      },
      returnUrl,
      expirySeconds: getQrExpirySeconds(),
    });

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          paymongo_payment_intent_id: qrPayment.paymentIntentId,
          paymongo_payment_method_id: qrPayment.paymentMethodId,
        },
      });

      await tx.bookingPayment.create({
        data: {
          booking_id: booking.id,
          type: booking.amount_paid > 0 ? "BALANCE" : "FULL",
          status: "PENDING",
          payment_method: "QRPH",
          amount_principal: remainingBalance,
          amount_charged: amountToCharge,
          paymongo_payment_intent_id: qrPayment.paymentIntentId,
          paymongo_payment_method_id: qrPayment.paymentMethodId,
          expires_at: qrPayment.expiresAt ? new Date(qrPayment.expiresAt) : null,
        },
      });
    });

    revalidatePath(`/app/${businessSlug}`);
    return {
      success: true,
      data: {
        qrImage: qrPayment.qrImage,
        expiresAt: qrPayment.expiresAt,
        amount: amountToCharge,
        status: "pending" as QrReviewStatus,
      },
    };
  } catch (error) {
    console.error("Error creating employee booking QR payment:", error);
    return { success: false, error: "Failed to generate QR payment." };
  }
}

export async function getEmployeeBookingQrPaymentReviewAction(bookingId: number) {
  const validation = bookingIdSchema.safeParse({ bookingId });
  if (!validation.success) {
    return { success: false, error: "Invalid booking ID." };
  }

  const auth = await requireEmployeeAuth({
    permission: StaffPermission.PAYMENT_COLLECT,
  });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        business: { slug: businessSlug },
        status: { not: BookingStatus.CANCELLED },
        ...getTodayBookingFilter(),
      },
      select: {
        id: true,
        payment_method: true,
        payment_status: true,
        grand_total: true,
        amount_paid: true,
        paymongo_payment_intent_id: true,
        payments: {
          where: { status: "PENDING" },
          orderBy: { created_at: "desc" },
          take: 1,
          select: {
            id: true,
            amount_charged: true,
            paymongo_payment_intent_id: true,
          },
        },
      },
    });

    if (!booking) {
      return { success: false, error: "Booking not found for today." };
    }

    if (booking.payment_method !== "QRPH") {
      return {
        success: false,
        error: "This booking does not use QR payment.",
      };
    }

    const remainingBalance = roundMoney(
      Math.max(0, booking.grand_total - booking.amount_paid),
    );

    if (booking.payment_status === PaymentStatus.PAID || remainingBalance <= 0) {
      return { success: false, error: "Booking is already fully paid." };
    }

    const pendingPayment = booking.payments[0];
    const paymentIntentId =
      pendingPayment?.paymongo_payment_intent_id ||
      booking.paymongo_payment_intent_id;

    if (!paymentIntentId) {
      return {
        success: false,
        error: "No active QR payment found. Generate a new QR payment.",
      };
    }

    const fallbackAmount =
      pendingPayment?.amount_charged ||
      calculateBookingTotal({
        subtotal: remainingBalance,
        voucherDiscount: 0,
        paymentMethod: "QRPH",
        paymentType: "FULL",
      });
    const qrPayload = await resolveQrReviewPayload(
      paymentIntentId,
      fallbackAmount,
    );

    if (!qrPayload) {
      if (pendingPayment?.id) {
        await prisma.bookingPayment.update({
          where: { id: pendingPayment.id },
          data: { status: "EXPIRED" },
        });
      }

      return {
        success: false,
        error: "QR code is no longer available. Generate a new QR payment.",
      };
    }

    return {
      success: true,
      data: qrPayload,
    };
  } catch (error) {
    console.error("Error getting employee booking QR review:", error);
    return { success: false, error: "Failed to fetch QR payment details." };
  }
}

export async function markEmployeeBookingPaidAction(bookingId: number) {
  const validation = bookingIdSchema.safeParse({ bookingId });
  if (!validation.success) {
    return { success: false, error: "Invalid booking ID." };
  }

  const auth = await requireEmployeeAuth({
    write: true,
    permission: StaffPermission.PAYMENT_COLLECT,
  });
  if (!auth.success) return auth;
  const { businessSlug, employeeId } = auth;

  try {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        business: { slug: businessSlug },
        status: { not: BookingStatus.CANCELLED },
        ...getTodayBookingFilter(),
      },
      select: {
        id: true,
        business_id: true,
        status: true,
        payment_status: true,
        payment_method: true,
        grand_total: true,
        amount_paid: true,
        hold_expires_at: true,
      },
    });

    if (!booking) {
      return { success: false, error: "Booking not found for today." };
    }

    if (booking.payment_status === PaymentStatus.PAID) {
      return { success: true };
    }

    const remainingBalance = roundMoney(
      Math.max(0, booking.grand_total - booking.amount_paid),
    );

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          amount_paid: booking.grand_total,
          payment_status: PaymentStatus.PAID,
          status: booking.status === "HOLD" ? "ACCEPTED" : booking.status,
          hold_expires_at: booking.status === "HOLD" ? null : booking.hold_expires_at,
        },
      });

      if (remainingBalance > 0) {
        await tx.bookingPayment.create({
          data: {
            booking_id: booking.id,
            type: "MANUAL",
            status: "SUCCEEDED",
            payment_method: booking.payment_method === "QRPH" ? "QRPH" : "CASH",
            amount_principal: remainingBalance,
            amount_charged: remainingBalance,
            paid_at: getCurrentDateTimePH(),
            metadata: {
              source: "EMPLOYEE_MARK_PAID",
              employeeId,
            },
          },
        });
      }

      if (booking.status === "HOLD") {
        await publishEvent(tx as Prisma.TransactionClient, {
          type: "BOOKING_CONFIRMED",
          aggregateType: "Booking",
          aggregateId: String(booking.id),
          businessId: booking.business_id,
          payload: {
            bookingId: booking.id,
            status: "ACCEPTED",
          },
        });
      }

      await promoteBookingToCompletedIfEligible(tx, booking.id);
    });

    revalidatePath(`/app/${businessSlug}`);
    return { success: true };
  } catch (error) {
    console.error("Error marking employee booking as paid:", error);
    return { success: false, error: "Failed to mark booking as paid." };
  }
}
