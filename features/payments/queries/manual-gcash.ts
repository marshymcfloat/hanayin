import { prisma } from "@/prisma/prisma";
import type {
  GcashFollowUpItem,
  GcashVerificationItem,
} from "@/lib/types/manual-gcash";
import type { OwnerGcashReviewQueue } from "@/features/payments/types/owner-gcash-review";

export async function getGcashVerificationQueue(input: {
  businessId: string;
}) {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { id: true, gcash_account_name: true, gcash_mobile_number: true },
  });
  if (!business?.gcash_account_name || !business.gcash_mobile_number) {
    throw new Error("GCASH_NOT_CONFIGURED");
  }
  const destination = {
    accountName: business.gcash_account_name,
    mobileNumber: business.gcash_mobile_number,
  };

  const [payments, followUps] = await Promise.all([
    prisma.bookingPayment.findMany({
      where: {
        status: "PENDING",
        submitted_at: { not: null },
        booking: { business_id: business.id, status: "HOLD" },
      },
      select: {
        id: true,
        amount_principal: true,
        payer_name: true,
        provider_reference: true,
        submitted_at: true,
        expires_at: true,
        escalated_at: true,
        escalation_reason: true,
        booking: {
          select: {
            id: true,
            scheduled_at: true,
            customer_label: true,
            customer: { select: { name: true, phone: true } },
            availed_services: {
              select: { service: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { submitted_at: "asc" },
    }),
    prisma.bookingPayment.findMany({
      where: {
        follow_up_required_at: { not: null },
        resolution_resolved_at: null,
        booking: { business_id: business.id },
      },
      select: {
        id: true,
        amount_principal: true,
        payer_name: true,
        provider_reference: true,
        submitted_at: true,
        follow_up_required_at: true,
        escalation_reason: true,
        booking: {
          select: {
            id: true,
            scheduled_at: true,
            customer_label: true,
            customer: { select: { name: true, phone: true } },
          },
        },
      },
      orderBy: { follow_up_required_at: "asc" },
    }),
  ]);

  const verificationItems: GcashVerificationItem[] = payments.flatMap(
    (payment) => {
      if (!payment.submitted_at || !payment.expires_at) return [];
      return [
        {
          id: payment.id,
          stage: payment.escalated_at
            ? "NEEDS_RESOLUTION"
            : "AWAITING_VERIFICATION",
          amountPrincipal: payment.amount_principal,
          payerName: payment.payer_name,
          providerReference: payment.provider_reference,
          submittedAt: payment.submitted_at,
          expiresAt: payment.expires_at,
          escalatedAt: payment.escalated_at,
          escalationReason: payment.escalation_reason,
          destination,
          booking: {
            id: payment.booking.id,
            scheduledAt: payment.booking.scheduled_at,
            customerName:
              payment.booking.customer?.name ??
              payment.booking.customer_label ??
              "Customer",
            customerPhone: payment.booking.customer?.phone ?? null,
            services: payment.booking.availed_services.map(
              (item) => item.service.name,
            ),
          },
        },
      ];
    },
  );

  const followUpItems: GcashFollowUpItem[] = followUps.flatMap((payment) => {
    if (!payment.follow_up_required_at) return [];
    return [
      {
        id: payment.id,
        amountPrincipal: payment.amount_principal,
        payerName: payment.payer_name,
        providerReference: payment.provider_reference,
        submittedAt: payment.submitted_at,
        followUpRequiredAt: payment.follow_up_required_at,
        escalationReason: payment.escalation_reason,
        booking: {
          id: payment.booking.id,
          scheduledAt: payment.booking.scheduled_at,
          customerName:
            payment.booking.customer?.name ??
            payment.booking.customer_label ??
            "Customer",
          customerPhone: payment.booking.customer?.phone ?? null,
        },
      },
    ];
  });

  return { verificationItems, followUpItems };
}

export async function getOwnerGcashReviewQueue(input: {
  businessId: string;
}): Promise<OwnerGcashReviewQueue> {
  const queue = await getGcashVerificationQueue(input);
  return {
    verificationItems: queue.verificationItems.map((item) => ({
      ...item,
      submittedAt: item.submittedAt.toISOString(),
      expiresAt: item.expiresAt.toISOString(),
      escalatedAt: item.escalatedAt?.toISOString() ?? null,
      booking: {
        ...item.booking,
        scheduledAt: item.booking.scheduledAt?.toISOString() ?? null,
      },
    })),
    followUpItems: queue.followUpItems.map((item) => ({
      ...item,
      submittedAt: item.submittedAt?.toISOString() ?? null,
      followUpRequiredAt: item.followUpRequiredAt.toISOString(),
      booking: {
        ...item.booking,
        scheduledAt: item.booking.scheduledAt?.toISOString() ?? null,
      },
    })),
  };
}
