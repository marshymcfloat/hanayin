"use server";

import { prisma } from "@/prisma/prisma";
import {
  AvailedServiceStatus,
  BookingStatus,
  PaymentStatus,
  ServiceProviderType,
} from "@/prisma/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { getActiveSaleEvents } from "@/lib/server actions/sale-event";
import { getApplicableDiscount } from "@/lib/utils/pricing";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { promoteBookingToCompletedIfEligible } from "@/lib/services/booking-status";
import {
  serviceIdSchema,
  updateBookingStatusSchema,
  bookingIdSchema,
} from "@/lib/zod-schemas/dashboard";

export async function claimServiceAsOwnerAction(serviceId: number) {
  const validation = serviceIdSchema.safeParse({ serviceId });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireAuth({ write: true });
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

    // Fetch service details for discount calculation
    const serviceToClaim = await prisma.availedService.findUnique({
      where: { id: serviceId },
      select: {
        price: true,
        service_id: true,
        package_id: true,
      },
    });

    if (!serviceToClaim) {
      return { success: false, error: "Service not found." };
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

    const updateData = {
      status: AvailedServiceStatus.CLAIMED,
      served_by_owner_id: owner.id,
      served_by_id: null,
      served_by_type: ServiceProviderType.OWNER,
      claimed_at: getCurrentDateTimePH(),
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
    };

    const result = await prisma.availedService.updateMany({
      where: {
        id: serviceId,
        status: AvailedServiceStatus.PENDING,
        booking: { business: { slug: businessSlug } },
      },
      data: updateData,
    });

    if (result.count === 0) {
      return { success: false, error: "Service already claimed or not found." };
    }

    revalidatePath(`/app/${businessSlug}`);
    return { success: true };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return { success: false, error: "Service already claimed or not found." };
    }
    console.error("Error claiming service as owner:", error);
    return { success: false, error: "Unable to claim service." };
  }
}

export async function unclaimServiceAsOwnerAction(serviceId: number) {
  const validation = serviceIdSchema.safeParse({ serviceId });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireAuth({ write: true });
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

    // Get original price via findUnique before updateMany
    const service = await prisma.availedService.findUnique({
      where: { id: serviceId },
      select: { price: true },
    });

    if (!service) {
      return { success: false, error: "Service not found." };
    }

    const result = await prisma.availedService.updateMany({
      where: {
        id: serviceId,
        served_by_owner_id: owner.id,
        booking: { business: { slug: businessSlug } },
      },
      data: {
        status: AvailedServiceStatus.PENDING,
        served_by_owner_id: null,
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
    console.error("Error unclaiming service as owner:", error);
    return { success: false, error: "Unable to unclaim service." };
  }
}

export async function markServiceServedAsOwnerAction(serviceId: number) {
  const validation = serviceIdSchema.safeParse({ serviceId });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireAuth({ write: true });
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

    const result = await prisma.$transaction(async (tx) => {
      const service = await tx.availedService.findUnique({
        where: {
          id: serviceId,
        },
        select: {
          booking_id: true,
          served_by_owner_id: true,
        },
      });

      if (!service || service.served_by_owner_id !== owner.id) {
        throw new Error("Service not found or not claimed by owner");
      }
      const nowPH = getCurrentDateTimePH();

      const updatedService = await tx.availedService.update({
        where: {
          id: serviceId,
        },
        data: {
          status: AvailedServiceStatus.COMPLETED,
          served_at: nowPH,
          completed_at: nowPH,
        },
      });

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
    console.error("Error marking service as served (owner):", error);
    return { success: false, error: "Unable to mark as served." };
  }
}

export async function unserveServiceAsOwnerAction(serviceId: number) {
  const validation = serviceIdSchema.safeParse({ serviceId });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireAuth({ write: true });
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

    const result = await prisma.$transaction(async (tx) => {
      const service = await tx.availedService.findUnique({
        where: {
          id: serviceId,
        },
        select: {
          booking_id: true,
          served_by_owner_id: true,
          booking: { select: { status: true } },
        },
      });

      if (!service || service.served_by_owner_id !== owner.id) {
        throw new Error("Service not found or not served by owner");
      }

      const updatedService = await tx.availedService.update({
        where: { id: serviceId },
        data: {
          status: AvailedServiceStatus.CLAIMED,
          served_at: null,
          completed_at: null,
        },
      });

      if (service.booking.status === BookingStatus.COMPLETED) {
        await tx.booking.update({
          where: { id: service.booking_id },
          data: { status: BookingStatus.ACCEPTED },
        });
      }

      return updatedService;
    });

    revalidatePath(`/app/${businessSlug}`);
    return { success: true, data: result };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return { success: false, error: "Unable to unserve." };
    }
    console.error("Error unserving service (owner):", error);
    return { success: false, error: "Unable to unserve." };
  }
}

export async function updateBookingStatusAction(
  bookingId: number,
  status: BookingStatus,
) {
  const validation = updateBookingStatusSchema.safeParse({ bookingId, status });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    if (status === BookingStatus.COMPLETED) {
      const booking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          business: { slug: businessSlug },
        },
        select: {
          payment_status: true,
        },
      });

      if (!booking) {
        return { success: false, error: "Booking not found." };
      }

      if (booking.payment_status !== PaymentStatus.PAID) {
        return {
          success: false,
          error: "Booking cannot be completed until payment is fully settled.",
        };
      }
    }

    await prisma.booking.update({
      where: {
        id: bookingId,
        business: { slug: businessSlug },
      },
      data: { status },
    });
    revalidatePath(`/app/${businessSlug}`);
    return { success: true };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return { success: false, error: "Failed to update status." };
    }
    return { success: false, error: "Failed to update status" };
  }
}

export async function markBookingNoShowAction(bookingId: number) {
  const validation = bookingIdSchema.safeParse({ bookingId });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, business: { slug: businessSlug } },
      select: { id: true, status: true, customer_id: true },
    });

    if (!booking) return { success: false, error: "Booking not found." };
    if (booking.status === BookingStatus.CANCELLED) {
      return { success: false, error: "Booking is already cancelled." };
    }
    if (booking.status === BookingStatus.COMPLETED) {
      return { success: false, error: "Cannot mark a completed booking as no-show." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CANCELLED },
      });

      const customer = await tx.customer.update({
        where: { id: booking.customer_id },
        data: { no_show_count: { increment: 1 }, last_no_show_at: new Date() },
        select: { no_show_count: true },
      });

      if (customer.no_show_count >= 2) {
        await tx.customer.update({
          where: { id: booking.customer_id },
          data: { trust_tier: "RESTRICTED" },
        });
      }
    });

    revalidatePath(`/app/${businessSlug}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark as no-show." };
  }
}

export async function deleteBookingAction(bookingId: number) {
  const validation = bookingIdSchema.safeParse({ bookingId });
  if (!validation.success) {
    return { success: false, error: "Invalid input" };
  }

  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { session } = auth;

  if (session?.user?.role !== "OWNER") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await prisma.booking.delete({
      where: {
        id: bookingId,
        business: { slug: auth.businessSlug },
      },
    });
    revalidatePath(`/app/${auth.businessSlug}`);
    return { success: true };
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return { success: false, error: "Failed to delete." };
    }
    return { success: false, error: "Failed to delete" };
  }
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export async function markBookingPaidAction(bookingId: number) {
  const validation = bookingIdSchema.safeParse({ bookingId });
  if (!validation.success) {
    return { success: false, error: "Invalid booking ID." };
  }

  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { session, businessSlug } = auth;

  if (session?.user?.role !== "OWNER") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        business: { slug: businessSlug },
      },
      select: {
        id: true,
        status: true,
        payment_status: true,
        payment_method: true,
        grand_total: true,
        amount_paid: true,
      },
    });

    if (!booking) {
      return { success: false, error: "Booking not found." };
    }

    if (booking.status === BookingStatus.CANCELLED) {
      return { success: false, error: "Cancelled bookings cannot be marked paid." };
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
          status: booking.status,
        },
      });

      if (remainingBalance > 0) {
        await tx.bookingPayment.create({
          data: {
            booking_id: booking.id,
            type: "MANUAL",
            status: "SUCCEEDED",
            payment_method: booking.payment_method,
            amount_principal: remainingBalance,
            amount_charged: remainingBalance,
            paid_at: getCurrentDateTimePH(),
            metadata: {
              source: "OWNER_MARK_PAID",
            },
          },
        });
      }

      await promoteBookingToCompletedIfEligible(tx, booking.id);
    });

    revalidatePath(`/app/${businessSlug}`);
    return { success: true };
  } catch (error) {
    console.error("Error marking booking as paid:", error);
    return { success: false, error: "Failed to mark booking as paid." };
  }
}
