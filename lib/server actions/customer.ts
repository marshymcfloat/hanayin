"use server";

import { prisma } from "@/prisma/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { normalizePhilippinePhone } from "@/lib/services/sms-otp";

export type CustomerSearchHit = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  trust_tier: string;
  no_show_count: number;
  /**
   * The most recent booking date, if any. Lets the picker show
   * "Last visit: Apr 12" so staff can disambiguate similarly-named records.
   */
  lastBookingAt: Date | null;
};

/**
 * Multi-field customer search used by the staff CustomerPicker.
 *
 * Matches a single query string against name (prefix), email (contains), and
 * phone (suffix on canonicalized PH digits). When the query parses as a phone
 * number we also match the canonical 639XXXXXXXXXX form so "0917..." finds a
 * record stored as "+639...". Returns up to 8 results with last-visit dates.
 *
 * Tenant scope is locked to the authenticated session — `businessSlug` from
 * the caller is ignored.
 */
export async function searchCustomer(query: string, businessSlug: string) {
  const auth = await requireAuth();
  if (!auth.success) return { success: false, error: "Unauthorized" };

  const tenantSlug = auth.businessSlug;
  void businessSlug;

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

    const business = await prisma.business.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });
    if (!business) {
      return { success: false, error: "Business not found" };
    }

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
        business_id: business.id,
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
  } catch (error) {
    console.error("Search customer error:", error);
    return { success: false, error: "Failed to search customers" };
  }
}

/**
 * Pre-submission duplicate check for the staff booking form.
 *
 * When staff is about to create a booking for a NEW customer (no customerId),
 * call this with the typed name + phone + email. If a Customer with the same
 * normalized contact already exists in this business, return the candidate so
 * the form can surface a confirmation dialog ("Use Maria Santos / Create new").
 *
 * Returns null when there's no duplicate to confirm — caller can submit
 * directly. Tenant scope is locked to the authenticated session.
 */
export async function findDuplicateCustomerForBooking(input: {
  name: string;
  email?: string;
  phone?: string;
}) {
  const auth = await requireAuth();
  if (!auth.success) return { success: false, error: "Unauthorized" } as const;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: auth.businessSlug },
      select: { id: true },
    });
    if (!business) {
      return { success: false, error: "Business not found" } as const;
    }

    const { normalizeCustomerEmail, normalizeCustomerPhone, findDuplicateCustomerCandidate } =
      await import("@/lib/services/customer-matching");

    const normalizedEmail = normalizeCustomerEmail(input.email);
    const normalizedPhone = normalizeCustomerPhone(input.phone);

    if (!normalizedEmail && !normalizedPhone) {
      return { success: true, data: null } as const;
    }

    const candidate = await findDuplicateCustomerCandidate({
      customerDelegate: prisma.customer,
      businessId: business.id,
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
  } catch (error) {
    console.error("Duplicate customer lookup error:", error);
    return { success: false, error: "Failed to check for duplicates" } as const;
  }
}

export async function createCustomer(data: {
  businessSlug: string;
  name: string;
  email?: string;
  phone?: string;
}) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    void data.businessSlug;

    const business = await prisma.business.findUnique({
      where: { slug: businessSlug }, // ensuring we use the session slug
    });

    if (!business) {
      return { success: false, error: "Business not found" };
    }

    const customer = await prisma.customer.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        business_id: business.id,
      },
    });

    revalidatePath(`/app/${businessSlug}/customers`);
    return { success: true, data: customer };
  } catch (error) {
    console.error("Create customer error:", error);
    return { success: false, error: "Failed to create customer" };
  }
}

export async function updateCustomer(
  id: string,
  data: {
    name: string;
    email?: string;
    phone?: string;
    businessSlug: string;
  },
) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    void data.businessSlug;

    const updated = await prisma.customer.updateMany({
      where: {
        id,
        business: {
          slug: businessSlug,
        },
      },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
      },
    });

    if (updated.count === 0) {
      return { success: false, error: "Customer not found or unauthorized" };
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    revalidatePath(`/app/${businessSlug}/customers`);
    return customer
      ? { success: true, data: customer }
      : { success: false, error: "Failed to load updated customer" };
  } catch (error) {
    console.error("Update customer error:", error);
    return { success: false, error: "Failed to update customer" };
  }
}

export async function deleteCustomer(id: string) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const deleted = await prisma.customer.deleteMany({
      where: {
        id,
        business: {
          slug: businessSlug,
        },
      },
    });

    if (deleted.count === 0) {
      return { success: false, error: "Customer not found or unauthorized" };
    }

    revalidatePath(`/app/${businessSlug}/customers`);
    return { success: true };
  } catch (error) {
    console.error("Delete customer error:", error);
    return { success: false, error: "Failed to delete customer" };
  }
}

type FlowDelayUnit = "DAYS" | "WEEKS" | "MONTHS";
type FlowType = "REQUIRED" | "SUGGESTED";

export type CustomerFlowStatus = {
  triggerServiceId: number;
  triggerServiceName: string;
  suggestedServiceId: number;
  suggestedServiceName: string;
  flowType: FlowType;
  status: "PENDING" | "COMPLETED";
  dueDate: Date;
  completedAt?: Date | null;
  lastServiceDate: Date;
  delayDuration: number;
  delayUnit: FlowDelayUnit;
};

export type CustomerBookingHistoryItem = {
  id: number;
  status: string;
  payment_method: string;
  scheduled_at: Date | null;
  estimated_end: Date | null;
  created_at: Date;
  grand_total: number;
  total_discount: number;
  downpayment: number | null;
  availed_services: {
    id: number;
    status: string;
    scheduled_at: Date | null;
    estimated_end: Date | null;
    final_price: number;
    service: { name: string } | null;
  }[];
};

export type CustomerHistoryData = {
  bookings: CustomerBookingHistoryItem[];
  nextAppointment: {
    bookingId: number;
    scheduledAt: Date;
    estimatedEnd: Date | null;
    services: string[];
  } | null;
  flowStatus: CustomerFlowStatus[];
};

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

export async function getCustomerHistory(
  customerId: string,
): Promise<
  | { success: true; data: CustomerHistoryData }
  | { success: false; error: string }
> {
  const auth = await requireAuth();
  if (!auth.success) return auth;

  const { businessSlug } = auth;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
      select: { id: true },
    });

    if (!business) {
      return { success: false, error: "Business not found" };
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, business_id: business.id },
      select: { id: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    const bookings = await prisma.booking.findMany({
      where: {
        customer_id: customerId,
        business_id: business.id,
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
        business_id: business.id,
        status: { not: "CANCELLED" },
        scheduled_at: { gt: new Date() },
      },
      orderBy: { scheduled_at: "asc" },
      select: {
        id: true,
        scheduled_at: true,
        estimated_end: true,
        availed_services: {
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
              .filter(Boolean) || [],
        }
      : null;

    const availedServices = await prisma.availedService.findMany({
      where: {
        booking: {
          customer_id: customerId,
          business_id: business.id,
          status: { not: "CANCELLED" },
        },
      },
      orderBy: { created_at: "desc" },
      include: {
        service: {
          include: {
            flow_triggers: {
              include: {
                suggested_service: true,
              },
            },
          },
        },
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
  } catch (error) {
    console.error("Get customer history error:", error);
    return { success: false, error: "Failed to fetch customer history" };
  }
}
