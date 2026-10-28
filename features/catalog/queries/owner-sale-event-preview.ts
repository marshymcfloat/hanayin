import "server-only";
import { readConditionalSale } from "@/features/catalog/offer-definitions";

import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import { isSocialPublishingEnabledForBusiness } from "@/features/social/social-publishing";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { DiscountType, SocialPlatform, SocialPostStatus, SocialTargetStatus } from "@/prisma/generated/prisma/enums";
import {
  saleEventPreviewStatus,
  socialPostNeedsAttention,
  type OwnerSaleEventPreviewData,
  type OwnerSaleEventPreviewEvent,
  type OwnerSaleEventPreviewResult,
} from "@/features/catalog/types/owner-sale-event-preview";

type OwnerSaleEventPreviewDatabase = Pick<Prisma.TransactionClient, "business" | "saleEvent" | "service" | "servicePackage" | "socialConnection">;

export type OwnerSaleEventPreviewQueryRow = {
  revision?: number;
  conditional_rule?: unknown;
  id: number;
  title: string;
  description: string | null;
  start_date: Date;
  end_date: Date;
  discount_type: DiscountType;
  discount_value: number;
  slot_limit: number | null;
  _count: { bookings: number };
  applicable_services: Array<{ id: number; name: string; category: string }>;
  applicable_packages: Array<{ id: number; name: string; category: string }>;
  social_posts: Array<{
    id: string;
    title: string;
    status: SocialPostStatus;
    last_error: string | null;
    published_at: Date | null;
    targets: Array<{
      id: string;
      status: SocialTargetStatus;
      last_error: string | null;
      social_connection: { platform: SocialPlatform };
    }>;
  }>;
};

type OwnerSaleEventPreviewContext = {
  success: true;
  businessId: string;
  businessSlug: string;
  userId: string;
  actorType: "OWNER";
  ownerId: number;
};

function ownerMembership(context: OwnerSaleEventPreviewContext) {
  return {
    id: context.ownerId,
    user_id: context.userId,
    business_id: context.businessId,
    user: { role: "OWNER" as const },
  };
}

export function toOwnerSaleEventPreviewDto(
  row: OwnerSaleEventPreviewQueryRow,
  now: Date,
): OwnerSaleEventPreviewEvent {
  return {
    revision: row.revision ?? 0, conditionalRule: readConditionalSale(row.conditional_rule),
    id: row.id,
    title: row.title,
    description: row.description,
    startDate: row.start_date.toISOString(),
    endDate: row.end_date.toISOString(),
    status: saleEventPreviewStatus(row.start_date, row.end_date, now),
    discountType: row.discount_type,
    discountValue: row.discount_value,
    slotLimit: row.slot_limit,
    bookings: row._count.bookings,
    services: row.applicable_services.map((item) => ({ ...item })),
    packages: row.applicable_packages.map((item) => ({ ...item })),
    socialPosts: row.social_posts.map((post) => ({
      id: post.id,
      title: post.title,
      status: post.status,
      lastError: post.last_error,
      publishedAt: post.published_at?.toISOString() ?? null,
      targets: post.targets.map((target) => ({
        id: target.id,
        platform: target.social_connection.platform,
        status: target.status,
        lastError: target.last_error,
      })),
    })),
  };
}

function metrics(events: OwnerSaleEventPreviewEvent[]) {
  return {
    total: events.length,
    active: events.filter((event) => event.status === "active").length,
    upcoming: events.filter((event) => event.status === "upcoming").length,
    ended: events.filter((event) => event.status === "ended").length,
    bookings: events.reduce((total, event) => total + event.bookings, 0),
    attention: events.reduce(
      (total, event) =>
        total + event.socialPosts.filter(socialPostNeedsAttention).length,
      0,
    ),
  };
}

export async function getOwnerSaleEventPreviewReadModel(
  context: OwnerSaleEventPreviewContext,
  options: { now?: Date; db?: OwnerSaleEventPreviewDatabase } = {},
): Promise<OwnerSaleEventPreviewData | null> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const business = await db.business.findFirst({
    where: {
      id: context.businessId,
      slug: context.businessSlug,
      owners: { some: ownerMembership(context) },
    },
    select: { slug: true, name: true },
  });
  if (!business) return null;

  const tenantBusiness = {
    id: context.businessId,
    owners: { some: ownerMembership(context) },
  };
  const [rows, services, packages, connections, entitlements] = await Promise.all([
    db.saleEvent.findMany({
      where: { business_id: context.businessId, business: tenantBusiness },
      select: {
        id: true,
        title: true,
        description: true,
        start_date: true,
        end_date: true,
        discount_type: true,
        discount_value: true,
        slot_limit: true,
        revision: true, conditional_rule: true,
        _count: {
          select: {
            bookings: {
              where: { business_id: context.businessId, status: { not: "CANCELLED" } },
            },
          },
        },
        applicable_services: {
          where: { business_id: context.businessId },
          select: { id: true, name: true, category: true },
          orderBy: { name: "asc" },
        },
        applicable_packages: {
          where: { business_id: context.businessId },
          select: { id: true, name: true, category: true },
          orderBy: { name: "asc" },
        },
        social_posts: {
          select: {
            id: true,
            title: true,
            status: true,
            last_error: true,
            published_at: true,
            targets: {
              select: {
                id: true,
                status: true,
                last_error: true,
                social_connection: { select: { platform: true } },
              },
              orderBy: { created_at: "asc" },
            },
          },
          orderBy: { created_at: "desc" },
        },
      },
      orderBy: [{ start_date: "asc" }, { created_at: "desc" }],
    }),
    db.service.findMany({
      where: { business_id: context.businessId, business: tenantBusiness },
      select: { id: true, name: true, category: true, price: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    db.servicePackage.findMany({
      where: { business_id: context.businessId, business: tenantBusiness },
      select: { id: true, name: true, category: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    db.socialConnection.findMany({
      where: { business_id: context.businessId, status: "CONNECTED", business: tenantBusiness },
      select: { platform: true },
      orderBy: { platform: "asc" },
    }),
    getBusinessEntitlementsBySlug(context.businessSlug),
  ]);

  const events = (rows as unknown as OwnerSaleEventPreviewQueryRow[]).map((row) =>
    toOwnerSaleEventPreviewDto(row, now),
  );
  return {
    section: "sale-events",
    generatedAt: now.toISOString(),
    now: now.toISOString(),
    business,
    events,
    availableServices: services.map((item) => ({ ...item })),
    availablePackages: packages.map((item) => ({ ...item })),
    connectedPlatforms: Array.from(new Set(connections.map((item) => item.platform))),
    socialPublishingEnabled:
      Boolean(entitlements.social) &&
      isSocialPublishingEnabledForBusiness(context.businessSlug),
    metrics: metrics(events),
  };
}

export async function resolveOwnerSaleEventPreviewReadModel(
  businessSlug: string,
  userId: string,
): Promise<OwnerSaleEventPreviewResult> {
  const actor = await resolveTenantActorContext(businessSlug, userId);
  if (!actor.success || actor.actorType !== "OWNER") {
    return {
      success: false,
      reason: "FORBIDDEN",
      error: "You do not have access to this owner preview.",
    };
  }
  try {
    const data = await getOwnerSaleEventPreviewReadModel(actor, { now: new Date() });
    return data
      ? { success: true, data }
      : { success: false, reason: "NOT_FOUND", error: "Business not found." };
  } catch {
    return {
      success: false,
      reason: "LOAD_FAILED",
      error: "Sale events are temporarily unavailable. Refresh and try again.",
    };
  }
}
