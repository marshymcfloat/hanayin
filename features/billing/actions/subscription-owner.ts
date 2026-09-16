"use server";

// Feature-owned Server Action boundary.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createInvoiceForSubscription,
  ensureDefaultPlans,
  SUBSCRIPTION_PLAN_CODES,
} from "@/features/billing/subscription-service";
import { requireAuth } from "@/lib/auth/guards";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { publishEvent } from "@/lib/services/outbox";
import { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const submitManualPaymentReferenceSchema = z.object({
  invoiceId: z.string().min(1),
  paymentReference: z.string().trim().min(2).max(120),
  amountCentavos: z.number().int().positive().max(1_000_000_000).optional(),
  note: z.string().trim().max(1000).optional(),
  proofUrl: z.string().trim().url().max(2000).optional(),
});

const requestOwnerPlanUpgradeSchema = z.object({
  targetPlanCode: z.enum(SUBSCRIPTION_PLAN_CODES),
  note: z.string().trim().max(1000).optional(),
});

export async function createOwnerSubscriptionInvoiceAction(reason = "OWNER_MANUAL_RENEWAL") {
  const auth = await requireAuth();
  if (!auth.success) return auth;

  const business = await prisma.business.findUnique({
    where: { slug: auth.businessSlug },
    select: {
      id: true,
      subscriptions: {
        select: { id: true },
      },
    },
  });
  const subscriptionId = business?.subscriptions[0]?.id;
  if (!subscriptionId) return { success: false as const, error: "Subscription not found" };

  const invoice = await createInvoiceForSubscription(subscriptionId, reason);
  revalidatePath(`/app/${auth.businessSlug}/billing`);
  return { success: true as const, data: invoice };
}

export async function requestOwnerPlanUpgradeAction(
  rawInput: unknown,
) {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  if (auth.session.user.role !== "OWNER") {
    return {
      success: false as const,
      error: "Only owners can request plan upgrades.",
    };
  }
  if (!auth.session.user.id) {
    return { success: false as const, error: "Unauthorized" };
  }

  const parsedInput = requestOwnerPlanUpgradeSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return {
      success: false as const,
      error: parsedInput.error.issues[0]?.message || "Invalid plan upgrade request.",
    };
  }

  const input = parsedInput.data;
  await ensureDefaultPlans();

  const business = await prisma.business.findUnique({
    where: { slug: auth.businessSlug },
    select: {
      id: true,
      subscriptions: {
        take: 1,
        select: {
          id: true,
          plan_id: true,
          plan: {
            select: {
              id: true,
              code: true,
              price_amount: true,
            },
          },
        },
      },
    },
  });
  if (!business) {
    return { success: false as const, error: "Business not found" };
  }

  const subscription = business.subscriptions[0];
  if (!subscription) {
    return { success: false as const, error: "Subscription not found" };
  }
  if (subscription.plan.code === input.targetPlanCode) {
    return { success: false as const, error: "You are already on this plan." };
  }

  const targetPlan = await prisma.subscriptionPlan.findUnique({
    where: { code: input.targetPlanCode },
    select: {
      id: true,
      code: true,
      name: true,
      price_amount: true,
      is_active: true,
    },
  });
  if (!targetPlan || !targetPlan.is_active) {
    return { success: false as const, error: "Selected plan is not active." };
  }
  if (targetPlan.price_amount <= subscription.plan.price_amount) {
    return {
      success: false as const,
      error: "Only upgrades to a higher-tier plan can be requested.",
    };
  }

  const existingPendingRequest = await prisma.subscriptionPlanUpgradeRequest.findFirst({
    where: {
      business_id: business.id,
      status: "PENDING",
    },
    include: {
      target_plan: {
        select: {
          name: true,
          code: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });
  if (existingPendingRequest) {
    return {
      success: false as const,
      error: `A pending upgrade request already exists for ${existingPendingRequest.target_plan.name} (${existingPendingRequest.target_plan.code}).`,
    };
  }

  const request = await prisma.subscriptionPlanUpgradeRequest.create({
    data: {
      business_id: business.id,
      business_subscription_id: subscription.id,
      requested_by_user_id: auth.session.user.id,
      current_plan_id: subscription.plan_id,
      target_plan_id: targetPlan.id,
      request_note: input.note || null,
    },
  });

  revalidatePath(`/app/${auth.businessSlug}/billing`);
  revalidatePath("/platform");
  revalidatePath("/platform/businesses");

  return { success: true as const, data: request };
}

export async function submitManualPaymentReferenceAction(
  rawInput: z.infer<typeof submitManualPaymentReferenceSchema>,
) {
  const auth = await requireAuth();
  if (!auth.success) return auth;

  const parsedInput = submitManualPaymentReferenceSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return {
      success: false as const,
      error:
        parsedInput.error.issues[0]?.message ||
        "Invalid manual payment submission.",
    };
  }

  const input = parsedInput.data;
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: input.invoiceId },
    select: {
      id: true,
      status: true,
      business_id: true,
      business: {
        select: { slug: true },
      },
      metadata: true,
    },
  });

  if (!invoice) {
    return { success: false as const, error: "Invoice not found" };
  }
  if (invoice.business.slug !== auth.businessSlug) {
    return { success: false as const, error: "Forbidden" };
  }
  if (!["OPEN", "DRAFT"].includes(invoice.status)) {
    return {
      success: false as const,
      error: "Manual payment can only be submitted for open invoices.",
    };
  }

  const submittedAt = getCurrentDateTimePH();
  const existingMetadata =
    invoice.metadata &&
    typeof invoice.metadata === "object" &&
    !Array.isArray(invoice.metadata)
      ? (invoice.metadata as Record<string, unknown>)
      : {};

  const hasExistingManualSubmission =
    typeof existingMetadata.manual_payment_submitted_at === "string" &&
    existingMetadata.manual_payment_submitted_at.trim().length > 0;

  if (hasExistingManualSubmission) {
    return {
      success: false as const,
      error:
        "Manual payment already submitted for this invoice. Wait for verification before sending another reference.",
    };
  }

  const nextMetadata: Record<string, unknown> = {
    ...existingMetadata,
    manual_payment_reference: input.paymentReference,
    manual_payment_submitted_at: submittedAt.toISOString(),
  };

  if (typeof input.amountCentavos === "number") {
    nextMetadata.manual_payment_amount_centavos = input.amountCentavos;
  } else {
    delete nextMetadata.manual_payment_amount_centavos;
  }

  if (input.note) {
    nextMetadata.manual_payment_note = input.note;
  } else {
    delete nextMetadata.manual_payment_note;
  }

  if (input.proofUrl) {
    nextMetadata.manual_payment_proof_url = input.proofUrl;
  } else {
    delete nextMetadata.manual_payment_proof_url;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedInvoice = await tx.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        metadata: nextMetadata as Prisma.InputJsonValue,
      },
    });

    await publishEvent(tx, {
      type: "MANUAL_PAYMENT_SUBMITTED",
      aggregateType: "SubscriptionInvoice",
      aggregateId: invoice.id,
      businessId: invoice.business_id,
      payload: {
        invoiceId: invoice.id,
        businessId: invoice.business_id,
        businessSlug: auth.businessSlug,
        submittedByUserId: auth.session.user.id,
        paymentReference: input.paymentReference,
        amountCentavos: input.amountCentavos,
        note: input.note,
        proofUrl: input.proofUrl,
        submittedAt: submittedAt.toISOString(),
      },
    });

    return updatedInvoice;
  });

  revalidatePath(`/app/${auth.businessSlug}/billing`);
  revalidatePath("/platform/invoices");

  return { success: true as const, data: updated };
}
