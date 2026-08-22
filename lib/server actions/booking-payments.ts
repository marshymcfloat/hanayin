"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { hasStaffPermission, resolveTenantActorContext } from "@/lib/auth/staff-access";
import { recordBookingPayment, voidBookingPayment } from "@/lib/services/booking-payments";
import { PaymentMethod, Role, StaffPermission } from "@/prisma/generated/prisma/enums";

const recordPaymentSchema = z.object({
  bookingId: z.number().int().positive(),
  amount: z.number().finite().positive().multipleOf(0.01),
  paymentMethod: z.enum([
    PaymentMethod.CASH,
    PaymentMethod.GCASH,
    PaymentMethod.CARD,
    PaymentMethod.BANK_TRANSFER,
    PaymentMethod.OTHER,
  ]),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().uuid(),
});

const voidPaymentSchema = z.object({
  paymentId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export async function recordBookingPaymentAction(rawInput: z.input<typeof recordPaymentSchema>) {
  const parsed = recordPaymentSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false as const, error: "Invalid payment details." };
  if (parsed.data.paymentMethod === PaymentMethod.GCASH && !parsed.data.reference?.trim()) {
    return { success: false as const, error: "GCash reference is required." };
  }
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const actor = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
  if (!actor.success) return actor;
  if (actor.actorType === "EMPLOYEE" && !hasStaffPermission(actor, StaffPermission.PAYMENT_COLLECT)) {
    return { success: false as const, error: "Forbidden" };
  }
  try {
    const result = await recordBookingPayment({
      input: parsed.data,
      businessSlug: auth.businessSlug,
      actorUserId: auth.session.user.id,
      employeeId: actor.actorType === "EMPLOYEE" ? actor.employeeId : undefined,
    });
    revalidatePath(`/app/${auth.businessSlug}`);
    revalidatePath(`/app/${auth.businessSlug}/bookings`);
    return { success: true as const, ...result };
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const messages: Record<string, string> = {
      NOT_COLLECTABLE: "Only confirmed or completed bookings can receive payments.",
      ALREADY_PAID: "This booking is already fully paid.",
      OVERPAYMENT: "Amount cannot exceed the remaining balance.",
      DUPLICATE: "This payment submission was already used.",
      PAYMENT_CONFLICT: "Payment changed while saving. Please review and try again.",
    };
    return { success: false as const, error: messages[code] || "Unable to record payment." };
  }
}

export async function voidBookingPaymentAction(rawInput: z.input<typeof voidPaymentSchema>) {
  const parsed = voidPaymentSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false as const, error: "A valid void reason is required." };
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) return { success: false as const, error: "Forbidden" };
  try {
    const result = await voidBookingPayment({
      ...parsed.data,
      businessSlug: auth.businessSlug,
      actorUserId: auth.session.user.id,
    });
    revalidatePath(`/app/${auth.businessSlug}`);
    revalidatePath(`/app/${auth.businessSlug}/bookings`);
    return { success: true as const, ...result };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error && error.message === "NOT_VOIDABLE"
        ? "Payment is no longer available to void."
        : "Unable to void payment.",
    };
  }
}
