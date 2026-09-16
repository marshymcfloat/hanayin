import { prisma } from "@/prisma/prisma";
import { requireTenantAccess } from "@/lib/auth/guards";
import { ensureBusinessSubscription, ensureDefaultPlans, ensureReferralCode, SUBSCRIPTION_PLAN_CODES } from "@/features/billing/subscription-service";

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function getManualPaymentMetadata(metadata: unknown) {
  const record = asObject(metadata);
  return {
    reference: asOptionalString(record.manual_payment_reference),
    submittedAt: asOptionalString(record.manual_payment_submitted_at),
    amountCentavos: asOptionalNumber(record.manual_payment_amount_centavos),
    note: asOptionalString(record.manual_payment_note),
    proofUrl: asOptionalString(record.manual_payment_proof_url),
  };
}

export async function getBillingWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return null;
  await ensureDefaultPlans();
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: {
      id: true,
      name: true,
    },
  });
  if (!business) return null;

  await ensureBusinessSubscription(business.id);
  await ensureReferralCode(business.id);

  const subscription = await prisma.businessSubscription.findUnique({
    where: { business_id: business.id },
    include: {
      plan: true,
      credits: {
        orderBy: { created_at: "desc" },
        take: 10,
      },
      invoices: {
        orderBy: { created_at: "desc" },
        take: 20,
      },
      business: {
        include: {
          referral_code: true,
          referral_attributions_as_referrer: {
            include: {
              referred_business: {
                select: { name: true },
              },
            },
            orderBy: { created_at: "desc" },
            take: 20,
          },
        },
      },
    },
  });
  if (!subscription) return null;

  const openInvoice = subscription.invoices.find((invoice) => invoice.status === "OPEN");
  const openInvoiceManualPayment = openInvoice
    ? getManualPaymentMetadata(openInvoice.metadata)
    : null;
  const availableUpgradePlans = await prisma.subscriptionPlan.findMany({
    where: {
      code: { in: [...SUBSCRIPTION_PLAN_CODES] },
      is_active: true,
      price_amount: { gt: subscription.plan.price_amount },
    },
    select: {
      id: true,
      code: true,
      name: true,
      price_amount: true,
    },
    orderBy: [{ price_amount: "asc" }, { code: "asc" }],
  });
  const pendingPlanUpgradeRequest = await prisma.subscriptionPlanUpgradeRequest.findFirst({
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
    orderBy: { created_at: "desc" },
  });
  const planUpgradeRequests = await prisma.subscriptionPlanUpgradeRequest.findMany({
    where: {
      business_id: business.id,
    },
    include: {
      current_plan: {
        select: {
          name: true,
          code: true,
        },
      },
      target_plan: {
        select: {
          name: true,
          code: true,
          price_amount: true,
        },
      },
      reviewed_by_user: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: 6,
  });

  return { business, subscription, openInvoice, openInvoiceManualPayment, availableUpgradePlans, pendingPlanUpgradeRequest, planUpgradeRequests };
}
