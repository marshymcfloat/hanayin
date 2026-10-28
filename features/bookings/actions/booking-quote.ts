"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { bookingCreationServiceSchema, paymentMethodEnum, paymentTypeEnum } from "@/features/bookings/schemas";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { resolveTenantActorContext, hasStaffPermission } from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { readBookingQuote } from "@/features/bookings/queries/booking-quote";
import { toBookingQuote } from "@/features/bookings/booking-quote";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFromForwardedFor } from "@/lib/client-ip";

const schema = z.object({ businessSlug: businessSlugSchema, scheduledAt: z.coerce.date(), services: z.array(bookingCreationServiceSchema).min(1).max(100), paymentMethod: paymentMethodEnum, paymentType: paymentTypeEnum, voucherCode: z.string().trim().max(100).optional() });
export async function quoteBookingAction(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Check the selected services and booking date." };
  try {
    const session = await getServerSession(authOptions);
    if (session) {
      const actor = await resolveTenantActorContext(parsed.data.businessSlug, session.user.id);
      if (!actor.success || actor.actorType !== "OWNER" && !hasStaffPermission(actor, StaffPermission.BOOKING_CREATE)) return { success: false as const, error: "Forbidden" };
    } else {
      const requestHeaders = await headers();
      const limited = await rateLimit(`booking-quote:${parsed.data.businessSlug}:${clientIpFromForwardedFor(requestHeaders.get("x-forwarded-for"))}`, { windowMs: 60_000, maxRequests: 90 });
      if (!limited.success) return { success: false as const, error: "Too many price checks. Please try again shortly." };
    }
    const pricing = await readBookingQuote(parsed.data);
    return { success: true as const, quote: toBookingQuote(pricing) };
  } catch {
    return { success: false as const, error: "Prices could not be confirmed. Check your choices and voucher, then try again." };
  }
}
