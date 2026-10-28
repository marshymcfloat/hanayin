import "server-only";
import { prisma } from "@/prisma/prisma";
import { normalizePhilippinePhone } from "@/lib/services/sms-otp";
import { customerBusinessWhere, type CustomerActorContext } from "@/features/customers/customer-access";
import type { CustomerProfileInput } from "@/features/customers/customer-schemas";
import type { CustomerSearchHit, CustomerHistoryData, CustomerBookingHistoryItem, CustomerFlowStatus, FlowDelayUnit, FlowType } from "@/features/customers/customer-types";
export async function searchTenantCustomers(context: CustomerActorContext, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return { success: true, data: [] as CustomerSearchHit[] };

  try {
    // If the query looks like a phone number, prefer phone matching against
    // the canonical 639XXXXXXXXXX form. Falls back to substring match for
    // partial-digit searches like "917" or "0917".
    const looksLikePhone = /^[\d+\s\-()]+$/.test(trimmed) && /\d/.test(trimmed);
    const digitsOnly = trimmed.replace(/\D/g, "");
    const canonicalPhone = looksLikePhone
      ? normalizePhilippinePhone(trimmed)
      : null;

    const orConditions: Array<Record<string, unknown>> = [
      { name: { startsWith: trimmed, mode: "insensitive" } },
    ];

    // Email match (only when the query looks vaguely email-y to avoid noise on
    // very short queries like "a").
    if (trimmed.length >= 2 && /[a-zA-Z@.]/.test(trimmed)) {
      orConditions.push({
        email: { contains: trimmed, mode: "insensitive" },
      });
    }

    // Phone match: try both the canonical normalized form and a substring on
    // the digits-only query so partial entries like "917" still surface hits.
    if (looksLikePhone && digitsOnly.length >= 3) {
      if (canonicalPhone) {
        orConditions.push({ phone: canonicalPhone });
      }
      orConditions.push({ phone: { contains: digitsOnly } });
    }

    const customers = await prisma.customer.findMany({
      where: {
        business_id: context.businessId,
        business: customerBusinessWhere(context),
        OR: orConditions,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        trust_tier: true,
        no_show_count: true,
        bookings: {
          where: { business_id: context.businessId },
          orderBy: { scheduled_at: "desc" },
          take: 1,
          select: { scheduled_at: true, created_at: true },
        },
      },
      orderBy: { name: "asc" },
      take: 8,
    });

    const hits: CustomerSearchHit[] = customers.map((c) => {
      const last = c.bookings[0];
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        trust_tier: c.trust_tier,
        no_show_count: c.no_show_count,
        lastBookingAt: last?.scheduled_at ?? last?.created_at ?? null,
      };
    });

    return { success: true, data: hits };
  } catch {
    return { success: false, error: "Failed to search customers" };
  }
}

export async function findTenantDuplicateCustomer(context: CustomerActorContext, input: CustomerProfileInput) {
  try {
    const { normalizeCustomerEmail, normalizeCustomerPhone, findDuplicateCustomerCandidate } =
      await import("@/features/bookings/services/customer-matching");

    const normalizedEmail = normalizeCustomerEmail(input.email);
    const normalizedPhone = normalizeCustomerPhone(input.phone);

    if (!normalizedEmail && !normalizedPhone) {
      return { success: true, data: null } as const;
    }

    const candidate = await findDuplicateCustomerCandidate({
      customerDelegate: { findFirst: args => prisma.customer.findFirst({ ...args, where: { ...args.where, business: customerBusinessWhere(context) } }) },
      businessId: context.businessId,
      email: normalizedEmail,
      phone: normalizedPhone,
    });

    if (!candidate) return { success: true, data: null } as const;

    // Heuristic: warn the form when the typed name disagrees with the
    // matched record's name. Staff should pause before silently linking a
    // booking under a name that doesn't belong to that record.
    const typedName = input.name.trim().toLowerCase();
    const recordName = candidate.name.trim().toLowerCase();
    const nameMismatch =
      typedName.length > 0 &&
      recordName.length > 0 &&
      typedName !== recordName &&
      !recordName.includes(typedName) &&
      !typedName.includes(recordName);

    return {
      success: true,
      data: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        matchedOn: candidate.matchedOn,
        nameMismatch,
      },
    } as const;
  } catch {
    return { success: false, error: "Failed to check for duplicates" } as const;
  }
}

const addFlowDelay = (
  base: Date,
  duration: number,
  unit: FlowDelayUnit,
) => {
  const dueDate = new Date(base);
  if (unit === "DAYS") {
    dueDate.setDate(dueDate.getDate() + duration);
  } else if (unit === "WEEKS") {
    dueDate.setDate(dueDate.getDate() + duration * 7);
  } else if (unit === "MONTHS") {
    dueDate.setMonth(dueDate.getMonth() + duration);
  }
  return dueDate;
};

export async function getTenantCustomerHistory(
  context: CustomerActorContext,
  customerId: string,
): Promise<
  | { success: true; data: CustomerHistoryData }
  | { success: false; error: string }
> {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, business_id: context.businessId, business: customerBusinessWhere(context) },
      select: { id: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    const bookings = await prisma.booking.findMany({
      where: {
        customer_id: customerId,
        business_id: context.businessId,
        business: customerBusinessWhere(context),
      },
      orderBy: [{ scheduled_at: "desc" }, { created_at: "desc" }],
      select: {
        id: true,
        status: true,
        payment_method: true,
        scheduled_at: true,
        estimated_end: true,
        created_at: true,
        grand_total: true,
        total_discount: true,
        downpayment: true,
        availed_services: {
          where: { service: { business_id: context.businessId } },
          orderBy: { scheduled_at: "asc" },
          select: {
            id: true,
            status: true,
            scheduled_at: true,
            estimated_end: true,
            final_price: true,
            service: { select: { name: true } },
          },
        },
      },
    });

    const nextBooking = await prisma.booking.findFirst({
      where: {
        customer_id: customerId,
        business_id: context.businessId,
        business: customerBusinessWhere(context),
        status: { not: "CANCELLED" },
        scheduled_at: { gt: new Date() },
      },
      orderBy: { scheduled_at: "asc" },
      select: {
        id: true,
        scheduled_at: true,
        estimated_end: true,
        availed_services: {
          where: { service: { business_id: context.businessId } },
          select: { service: { select: { name: true } } },
        },
      },
    });

    const nextAppointment = nextBooking
      ? {
          bookingId: nextBooking.id,
          scheduledAt: nextBooking.scheduled_at!,
          estimatedEnd: nextBooking.estimated_end,
          services:
            nextBooking.availed_services
              ?.map((item) => item.service?.name)
              .filter((name): name is string => Boolean(name)) || [],
        }
      : null;

    const availedServices = await prisma.availedService.findMany({
      where: {
        service: { business_id: context.businessId },
        booking: {
          customer_id: customerId,
          business_id: context.businessId,
          business: customerBusinessWhere(context),
          status: { not: "CANCELLED" },
        },
      },
      orderBy: { created_at: "desc" },
      select: {
        service_id: true, served_at: true, created_at: true,
        service: { select: {
          name: true, business_id: true,
          flow_triggers: {
            where: { business_id: context.businessId, suggested_service: { business_id: context.businessId } },
            select: { trigger_service_id: true, suggested_service_id: true, delay_duration: true, delay_unit: true, type: true, suggested_service: { select: { name: true } } },
          },
        } },
      },
    });

    const serviceDatesMap = new Map<number, Date[]>();
    for (const availed of availedServices) {
      const date = availed.served_at || availed.created_at;
      const list = serviceDatesMap.get(availed.service_id) || [];
      list.push(date);
      serviceDatesMap.set(availed.service_id, list);
    }

    for (const list of serviceDatesMap.values()) {
      list.sort((a, b) => a.getTime() - b.getTime());
    }

    const flowStatus: CustomerFlowStatus[] = [];
    const seenFlows = new Set<string>();

    for (const availed of availedServices) {
      const triggers = availed.service.flow_triggers || [];
      if (triggers.length === 0) continue;

      for (const flow of triggers) {
        const key = `${flow.trigger_service_id}:${flow.suggested_service_id}`;
        if (seenFlows.has(key)) continue;
        seenFlows.add(key);

        const lastServiceDate = availed.served_at || availed.created_at;
        const dueDate = addFlowDelay(
          lastServiceDate,
          flow.delay_duration,
          flow.delay_unit as FlowDelayUnit,
        );

        const suggestedDates =
          serviceDatesMap.get(flow.suggested_service_id) || [];
        const completedAt =
          suggestedDates.find((d) => d >= lastServiceDate) || null;

        flowStatus.push({
          triggerServiceId: flow.trigger_service_id,
          triggerServiceName: availed.service.name,
          suggestedServiceId: flow.suggested_service_id,
          suggestedServiceName: flow.suggested_service.name,
          flowType: flow.type as FlowType,
          status: completedAt ? "COMPLETED" : "PENDING",
          dueDate,
          completedAt,
          lastServiceDate,
          delayDuration: flow.delay_duration,
          delayUnit: flow.delay_unit as FlowDelayUnit,
        });
      }
    }

    return {
      success: true,
      data: {
        bookings: bookings as CustomerBookingHistoryItem[],
        nextAppointment,
        flowStatus,
      },
    };
  } catch {
    return { success: false, error: "Failed to fetch customer history" };
  }
}
