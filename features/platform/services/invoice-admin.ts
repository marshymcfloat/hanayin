import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createInvoiceForSubscription,
  markInvoicePaid,
  qualifyAndRewardReferralForBusiness,
} from "@/features/billing/subscription-service";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { publishEvent } from "@/lib/services/outbox";
import { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { logPlatformAction } from "./platform-action-log";

const markInvoicePaidManuallySchema = z.object({
  invoiceId: z.string().min(1),
  paymentReference: z.string().min(2).max(100),
  paidAt: z.string().datetime().optional(),
});

export async function createSubscriptionInvoice(
  subscriptionId: string,
  reason = "MANUAL_ADMIN_INVOICE",
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  const invoice = await createInvoiceForSubscription(subscriptionId, reason);
  await logPlatformAction({
    action: "SUBSCRIPTION_INVOICE_CREATED",
    targetType: "SubscriptionInvoice",
    targetId: invoice.id,
    businessId: invoice.business_id,
    metadata: { reason },
  });
  revalidatePath("/platform/invoices");
  return { success: true as const, data: invoice };
}

export async function markInvoicePaidManually(
  rawInput: z.infer<typeof markInvoicePaidManuallySchema>,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  const input = markInvoicePaidManuallySchema.parse(rawInput);
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: input.invoiceId },
    select: {
      id: true,
      status: true,
      amount_due: true,
      amount_paid: true,
      business_id: true,
      metadata: true,
    },
  });
  if (!invoice) return { success: false as const, error: "Invoice not found" };
  const settledAmount =
    invoice.amount_due > 0
      ? invoice.amount_due
      : Math.max(1, invoice.amount_paid);
  await markInvoicePaid({
    invoiceId: invoice.id,
    paidAmountCentavos: settledAmount,
  });
  const parsedPaidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(parsedPaidAt.getTime())) {
    return { success: false as const, error: "Invalid paid date" };
  }
  const existingMetadata =
    invoice.metadata &&
    typeof invoice.metadata === "object" &&
    !Array.isArray(invoice.metadata)
      ? (invoice.metadata as Record<string, unknown>)
      : {};
  const updated = await prisma.subscriptionInvoice.update({
    where: { id: invoice.id },
    data: {
      paid_at: parsedPaidAt,
      metadata: {
        ...existingMetadata,
        collection_mode: "MANUAL",
        payment_reference: input.paymentReference,
        marked_by_admin: auth.session.user.id,
        marked_at: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
  await qualifyAndRewardReferralForBusiness(invoice.business_id);
  try {
    const subscription = await prisma.businessSubscription.findFirst({
      where: { business_id: invoice.business_id },
      select: {
        current_period_end: true,
        plan: { select: { code: true } },
        business: { select: { slug: true } },
      },
    });
    if (subscription) {
      await prisma.$transaction(async (tx) => {
        await publishEvent(tx, {
          type: "SUBSCRIPTION_PAYMENT_CONFIRMED",
          aggregateType: "SubscriptionInvoice",
          aggregateId: invoice.id,
          businessId: invoice.business_id,
          payload: {
            invoiceId: invoice.id,
            businessId: invoice.business_id,
            businessSlug: subscription.business.slug,
            planCode: subscription.plan.code,
            amountPaidCentavos: settledAmount,
            periodEndsAt: subscription.current_period_end.toISOString(),
            confirmedAt: parsedPaidAt.toISOString(),
          },
        });
      });
    }
  } catch (publishError) {
    console.error(
      "[markInvoicePaidManuallyAction] Failed to publish SUBSCRIPTION_PAYMENT_CONFIRMED",
      { invoiceId: invoice.id, publishError },
    );
  }
  await logPlatformAction({
    action: "SUBSCRIPTION_INVOICE_MARKED_PAID_MANUALLY",
    targetType: "SubscriptionInvoice",
    targetId: updated.id,
    businessId: invoice.business_id,
    metadata: {
      paymentReference: input.paymentReference,
      paidAmountCentavos: settledAmount,
      paidAt: parsedPaidAt.toISOString(),
    },
  });
  revalidatePath("/platform/invoices");
  revalidatePath("/platform/referrals");
  revalidatePath("/platform");
  return { success: true as const, data: updated };
}
