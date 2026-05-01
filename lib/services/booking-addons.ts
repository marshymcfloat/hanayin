import { getCurrentDateTimePH } from "@/lib/date-utils";
import { type TenantActorContext } from "@/lib/auth/staff-access";
import {
  AvailedServiceStatus,
  BookingStatus,
  PaymentStatus,
  Prisma,
  ServiceProviderType,
  type PrismaClient,
} from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { logAudit } from "@/lib/services/audit";
import { publishEvent } from "@/lib/services/outbox";
import { createBookingInDb } from "@/lib/services/booking";
import {
  type BookingServiceInput,
  buildBookingPricingSnapshot,
} from "@/lib/services/booking-pricing";
import { checkSaleEventSlotLimit } from "@/lib/services/booking-availability";

export type AddOnMutationMode = "APPEND" | "FOLLOW_UP";

export type AddOnServiceInput = {
  id: number;
  quantity: number;
  packageId?: number;
  claimedByCurrentEmployee?: boolean;
};

type BookingAddonDbClient = PrismaClient | Prisma.TransactionClient;

type ActorContext = Extract<TenantActorContext, { success: true }>;

type AddOnModeResolution = {
  mode: AddOnMutationMode;
  reason:
    | "BOOKING_NOT_FOUND"
    | "BOOKING_NOT_ACCEPTED"
    | "HAS_PAYMENT"
    | "HAS_STARTED_SERVICE"
    | "UNTOUCHED";
};

type BookingStateSnapshot = {
  id: number;
  status: BookingStatus;
  amount_paid: number;
  payment_status: PaymentStatus;
  availed_services: Array<{ status: AvailedServiceStatus }>;
};

function getActorAuditMetadata(actor: ActorContext) {
  return {
    actorId: actor.userId,
    actorType: "USER" as const,
    actorLabel: actor.actorType,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toServiceKey(id: number, packageId?: number | null) {
  return `${id}:${packageId ?? "none"}`;
}

function expandServiceSelections(
  services: AddOnServiceInput[],
): Array<AddOnServiceInput & { quantity: 1 }> {
  return services.flatMap((service) => {
    const quantity = Math.max(1, Number(service.quantity) || 1);
    return Array.from({ length: quantity }).map(() => ({
      id: Number(service.id),
      quantity: 1 as const,
      packageId:
        service.packageId !== undefined ? Number(service.packageId) : undefined,
      claimedByCurrentEmployee: Boolean(service.claimedByCurrentEmployee),
    }));
  });
}

function resolveModeFromSnapshot(
  booking: BookingStateSnapshot | null,
): AddOnModeResolution {
  if (!booking) {
    return { mode: "FOLLOW_UP", reason: "BOOKING_NOT_FOUND" };
  }

  if (booking.status !== BookingStatus.ACCEPTED) {
    return { mode: "FOLLOW_UP", reason: "BOOKING_NOT_ACCEPTED" };
  }

  const hasPayment =
    roundMoney(booking.amount_paid) > 0 ||
    booking.payment_status !== PaymentStatus.UNPAID;
  if (hasPayment) {
    return { mode: "FOLLOW_UP", reason: "HAS_PAYMENT" };
  }

  const hasStartedService = booking.availed_services.some(
    (service) => service.status !== AvailedServiceStatus.PENDING,
  );
  if (hasStartedService) {
    return { mode: "FOLLOW_UP", reason: "HAS_STARTED_SERVICE" };
  }

  return { mode: "APPEND", reason: "UNTOUCHED" };
}

export async function resolveAddOnMutationMode(
  bookingId: number,
  actorContext: ActorContext,
  db: BookingAddonDbClient = prisma,
): Promise<AddOnModeResolution> {
  const booking = await db.booking.findFirst({
    where: {
      id: bookingId,
      business: {
        slug: actorContext.businessSlug,
      },
    },
    select: {
      id: true,
      status: true,
      amount_paid: true,
      payment_status: true,
      availed_services: {
        select: {
          status: true,
        },
      },
    },
  });

  return resolveModeFromSnapshot(booking);
}

export class BookingAddOnStateRaceError extends Error {
  constructor() {
    super("BOOKING_STATE_CHANGED");
    this.name = "BookingAddOnStateRaceError";
  }
}

export async function appendServicesToUntouchedBooking(params: {
  bookingId: number;
  actorContext: ActorContext;
  services: AddOnServiceInput[];
  currentEmployeeId?: number;
}) {
  const expandedServices = expandServiceSelections(params.services);

  if (expandedServices.length === 0) {
    throw new Error("At least one service is required");
  }

  const actorMeta = getActorAuditMetadata(params.actorContext);

  return prisma.$transaction(
    async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id: params.bookingId,
          business: {
            slug: params.actorContext.businessSlug,
          },
        },
        select: {
          id: true,
          business_id: true,
          customer_id: true,
          status: true,
          amount_paid: true,
          payment_status: true,
          payment_method: true,
          grand_total: true,
          total_discount: true,
          scheduled_at: true,
          estimated_end: true,
          availed_services: {
            select: {
              id: true,
              service_id: true,
              package_id: true,
              status: true,
              scheduled_at: true,
              estimated_end: true,
              final_price: true,
            },
            orderBy: [{ scheduled_at: "asc" }, { created_at: "asc" }],
          },
        },
      });

      const modeResolution = resolveModeFromSnapshot(booking);
      if (modeResolution.mode !== "APPEND") {
        throw new BookingAddOnStateRaceError();
      }

      if (!booking) {
        throw new Error("Booking not found");
      }

      const aggregateMap = new Map<string, BookingServiceInput>();

      for (const item of booking.availed_services) {
        const key = toServiceKey(item.service_id, item.package_id);
        const existing = aggregateMap.get(key);

        if (existing) {
          existing.quantity += 1;
        } else {
          aggregateMap.set(key, {
            id: item.service_id,
            quantity: 1,
            packageId: item.package_id ?? undefined,
          });
        }
      }

      for (const item of expandedServices) {
        const key = toServiceKey(item.id, item.packageId);
        const existing = aggregateMap.get(key);

        if (existing) {
          existing.quantity += 1;
        } else {
          aggregateMap.set(key, {
            id: item.id,
            quantity: 1,
            packageId: item.packageId,
          });
        }
      }

      const bookingStart = booking.scheduled_at ?? getCurrentDateTimePH();
      const combinedPricing = await buildBookingPricingSnapshot({
        db: tx,
        businessSlug: params.actorContext.businessSlug,
        scheduledAt: bookingStart,
        services: Array.from(aggregateMap.values()),
        paymentMethod: booking.payment_method,
        paymentType: "FULL",
      });

      if (combinedPricing.appliedSaleEventId) {
        await checkSaleEventSlotLimit({
          saleEventId: combinedPricing.appliedSaleEventId,
          db: tx,
        });
      }

      const canonicalByKey = new Map(
        combinedPricing.services.map((service) => [
          toServiceKey(service.id, service.packageId),
          service,
        ]),
      );

      const now = getCurrentDateTimePH();
      const latestExistingEnd = booking.availed_services.reduce(
        (latest, service) => {
          const candidate =
            service.estimated_end || service.scheduled_at || bookingStart;
          return candidate.getTime() > latest.getTime() ? candidate : latest;
        },
        bookingStart,
      );

      let cursor = new Date(latestExistingEnd);
      const newRows = expandedServices.map((service) => {
        const canonical = canonicalByKey.get(
          toServiceKey(service.id, service.packageId),
        );

        if (!canonical) {
          throw new Error("Unable to resolve canonical pricing for selected service");
        }

        const duration = canonical.duration || 30;
        const serviceStart = new Date(cursor);
        const serviceEnd = new Date(
          serviceStart.getTime() + duration * 60 * 1000,
        );
        cursor = serviceEnd;

        const isClaimed =
          Boolean(service.claimedByCurrentEmployee) && !!params.currentEmployeeId;

        return {
          booking_id: booking.id,
          service_id: service.id,
          package_id: service.packageId ?? null,
          price: canonical.originalPrice,
          estimated_cost: canonical.estimatedCost,
          discount: canonical.discount,
          discount_reason:
            canonical.discountReason ||
            (canonical.discount > 0 ? "PACKAGE_OR_MANUAL" : null),
          final_price: canonical.price,
          commission_base: canonical.commissionBase || canonical.price,
          status: isClaimed ? AvailedServiceStatus.CLAIMED : AvailedServiceStatus.PENDING,
          claimed_at: isClaimed ? now : null,
          served_by_id: isClaimed ? params.currentEmployeeId : null,
          served_by_owner_id: null,
          served_by_type: isClaimed ? ServiceProviderType.EMPLOYEE : null,
          served_at: null,
          completed_at: null,
          scheduled_at: serviceStart,
          estimated_end: serviceEnd,
        };
      });

      await tx.availedService.createMany({
        data: newRows,
      });

      const addedTotal = roundMoney(
        newRows.reduce((sum, row) => sum + row.final_price, 0),
      );
      const nextGrandTotal = roundMoney(booking.grand_total + addedTotal);

      await tx.booking.update({
        where: {
          id: booking.id,
        },
        data: {
          grand_total: nextGrandTotal,
          estimated_end: cursor,
        },
      });

      await logAudit(tx, {
        entityType: "Booking",
        entityId: String(booking.id),
        action: "UPDATED",
        actorId: actorMeta.actorId,
        actorType: actorMeta.actorType,
        businessId: booking.business_id,
        changes: {
          before: {
            mode: "APPEND_ATTEMPT",
            grandTotal: booking.grand_total,
            serviceCount: booking.availed_services.length,
          },
          after: {
            mode: "APPEND_SUCCESS",
            grandTotal: nextGrandTotal,
            addedServices: newRows.length,
          },
        },
      });

      await publishEvent(tx, {
        type: "BOOKING_CREATED",
        aggregateType: "Booking",
        aggregateId: String(booking.id),
        businessId: booking.business_id,
        payload: {
          bookingId: booking.id,
          status: booking.status,
          grandTotal: nextGrandTotal,
          scheduledAt: bookingStart.toISOString(),
          estimatedEnd: cursor.toISOString(),
        },
      });

      return {
        bookingId: booking.id,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function createFollowUpAddOnBooking(params: {
  bookingId: number;
  actorContext: ActorContext;
  services: AddOnServiceInput[];
  currentEmployeeId?: number;
  staffSelectionMode?: "ANY_AVAILABLE" | "PREFER_SELECTED" | "REQUIRE_SELECTED";
}) {
  const expandedServices = expandServiceSelections(params.services);

  if (expandedServices.length === 0) {
    throw new Error("At least one service is required");
  }

  const parentBooking = await prisma.booking.findFirst({
    where: {
      id: params.bookingId,
      business: {
        slug: params.actorContext.businessSlug,
      },
    },
    select: {
      id: true,
      business_id: true,
      customer_id: true,
      customer: {
        select: {
          name: true,
          email: true,
          phone: true,
        },
      },
    },
  });

  if (!parentBooking) {
    throw new Error("Booking not found");
  }

  // Follow-up bookings inherit the parent's customer profile. Anonymous
  // walk-ins have no profile to inherit — the staff would have to recreate
  // the customer record manually, which defeats the "follow-up" affordance.
  if (!parentBooking.customer || !parentBooking.customer_id) {
    throw new Error(
      "Cannot create a follow-up for an anonymous walk-in booking. Create a new booking instead.",
    );
  }

  const parentCustomer = parentBooking.customer;
  const followUp = await createBookingInDb({
    businessSlug: params.actorContext.businessSlug,
    customerId: parentBooking.customer_id,
    customerName: parentCustomer.name,
    services: expandedServices,
    scheduledAt: getCurrentDateTimePH(),
    estimatedEnd: getCurrentDateTimePH(),
    employeeId: params.currentEmployeeId,
    currentEmployeeId: params.currentEmployeeId,
    paymentMethod: "CASH",
    paymentType: "FULL",
    email: parentCustomer.email || undefined,
    phone: parentCustomer.phone || undefined,
    isPublicBooking: false,
    isWalkIn: true,
    staffSelectionMode: params.staffSelectionMode || "ANY_AVAILABLE",
  });

  const actorMeta = getActorAuditMetadata(params.actorContext);

  await prisma.$transaction(async (tx) => {
    await logAudit(tx, {
      entityType: "Booking",
      entityId: String(parentBooking.id),
      action: "UPDATED",
      actorId: actorMeta.actorId,
      actorType: actorMeta.actorType,
      businessId: parentBooking.business_id,
      changes: {
        before: {
          mode: "FOLLOW_UP_PENDING",
        },
        after: {
          mode: "FOLLOW_UP_CREATED",
          followUpBookingId: followUp.id,
        },
      },
    });

    await logAudit(tx, {
      entityType: "Booking",
      entityId: String(followUp.id),
      action: "CREATED",
      actorId: actorMeta.actorId,
      actorType: actorMeta.actorType,
      businessId: parentBooking.business_id,
      changes: {
        after: {
          mode: "FOLLOW_UP_CREATED",
          parentBookingId: parentBooking.id,
        },
      },
    });
  });

  return {
    bookingId: followUp.id,
    parentBookingId: parentBooking.id,
  };
}
