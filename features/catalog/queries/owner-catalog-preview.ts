import "server-only";
import { readPackageChoices } from "@/features/catalog/offer-definitions";
import { giftablePackageWhere } from "@/features/catalog/giftable-packages";

import { z } from "zod";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import {
  resolveTenantActorContext,
  type TenantActorContext,
} from "@/lib/auth/staff-access";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import type {
  OwnerCatalogPreviewBusiness,
  OwnerCatalogPreviewReadModel,
  OwnerCatalogPreviewSection,
  OwnerCatalogPreviewService,
  OwnerCatalogPreviewVoucherStatus,
} from "@/features/catalog/types/owner-catalog-preview";

type OwnerContext = Extract<
  TenantActorContext,
  { success: true; actorType: "OWNER" }
>;

type CatalogPreviewDatabase = Pick<
  Prisma.TransactionClient,
  "business" | "giftCard" | "service" | "servicePackage" | "voucher"
>;

const ownerCatalogPreviewRequestSchema = z.object({
  section: z.enum(["services", "packages", "vouchers", "gift-cards"]),
  businessSlug: businessSlugSchema,
  userId: z.string().min(1).max(512),
});

function ownerMembership(context: OwnerContext): Prisma.OwnerWhereInput {
  return {
    id: context.ownerId,
    business_id: context.businessId,
    user_id: context.userId,
    user: { role: "OWNER" },
  };
}

function startOfMonthPh(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return new Date(`${year}-${month}-01T00:00:00.000+08:00`);
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

async function requireCurrentOwnerBusiness(
  context: OwnerContext,
  db: CatalogPreviewDatabase,
): Promise<OwnerCatalogPreviewBusiness | null> {
  const business = await db.business.findFirst({
    where: {
      id: context.businessId,
      slug: context.businessSlug,
      owners: { some: ownerMembership(context) },
    },
    select: { slug: true, name: true, initials: true },
  });
  if (!business) return null;
  return {
    slug: business.slug,
    name: business.name,
    initials: business.initials || "SF",
  };
}

async function listServices(
  context: OwnerContext,
  db: CatalogPreviewDatabase,
  monthStart: Date,
  now: Date,
): Promise<OwnerCatalogPreviewService[]> {
  const membership = ownerMembership(context);
  const rows = await db.service.findMany({
    where: {
      business_id: context.businessId,
      business: { owners: { some: membership } },
    },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      price: true,
      estimated_cost: true,
      duration: true,
      availed_services: {
        where: {
          created_at: { gte: monthStart, lte: now },
          status: { not: "CANCELLED" },
          booking: {
            business_id: context.businessId,
            status: { in: ["ACCEPTED", "COMPLETED"] },
          },
        },
        select: { id: true },
      },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price,
    estimatedCost: row.estimated_cost,
    durationMinutes: row.duration,
    monthlyBookings: row.availed_services.length,
  }));
}

async function buildServicesReadModel(
  context: OwnerContext,
  business: OwnerCatalogPreviewBusiness,
  db: CatalogPreviewDatabase,
  now: Date,
) {
  const services = await listServices(context, db, startOfMonthPh(now), now);
  const totalMargin = services.reduce(
    (sum, service) =>
      sum +
      (service.price > 0
        ? ((service.price - service.estimatedCost) / service.price) * 100
        : 0),
    0,
  );
  const durations = services.flatMap((service) =>
    service.durationMinutes === null ? [] : [service.durationMinutes],
  );

  return {
    section: "services" as const,
    generatedAt: now.toISOString(),
    business,
    services,
    categories: uniqueSorted(services.map((service) => service.category)),
    metrics: {
      totalServices: services.length,
      monthlyBookings: services.reduce(
        (sum, service) => sum + service.monthlyBookings,
        0,
      ),
      averageMarginPercent:
        services.length > 0 ? round(totalMargin / services.length) : 0,
      averageDurationMinutes:
        durations.length > 0
          ? round(
              durations.reduce((sum, duration) => sum + duration, 0) /
                durations.length,
            )
          : 0,
    },
  };
}

async function buildPackagesReadModel(
  context: OwnerContext,
  business: OwnerCatalogPreviewBusiness,
  db: CatalogPreviewDatabase,
  now: Date,
) {
  const membership = ownerMembership(context);
  const monthStart = startOfMonthPh(now);
  const [rows, availableServices] = await Promise.all([
    db.servicePackage.findMany({
      where: {
        business_id: context.businessId,
        business: { owners: { some: membership } },
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        price: true,
        duration: true,
        choices: true, revision: true,
        items: {
          where: { service: { business_id: context.businessId } },
          select: {
            custom_price: true,
            service: {
              select: {
                id: true,
                name: true,
                category: true,
                duration: true,
                price: true,
              },
            },
          },
          orderBy: { service: { name: "asc" } },
        },
        availed_services: {
          where: {
            created_at: { gte: monthStart, lte: now },
            status: { not: "CANCELLED" },
            booking: {
              business_id: context.businessId,
              status: { in: ["ACCEPTED", "COMPLETED"] },
            },
          },
          select: { booking_id: true },
        },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    listServices(context, db, monthStart, now),
  ]);

  const packages = rows.map((row) => ({
    revision: row.revision, choices: readPackageChoices(row.choices),
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price,
    durationMinutes: row.duration,
    originalPrice: round(
      row.items.reduce((sum, item) => sum + item.service.price, 0),
    ),
    monthlySales: new Set(
      row.availed_services.map((item) => item.booking_id),
    ).size,
    services: row.items.map((item) => ({
      id: item.service.id,
      name: item.service.name,
      category: item.service.category,
      durationMinutes: item.service.duration,
      price: item.service.price,
      packageItemPrice: item.custom_price,
    })),
  }));
  const savings = packages.flatMap((item) =>
    item.originalPrice > 0
      ? [((item.originalPrice - item.price) / item.originalPrice) * 100]
      : [],
  );

  return {
    section: "packages" as const,
    generatedAt: now.toISOString(),
    business,
    packages,
    availableServices,
    categories: uniqueSorted(packages.map((item) => item.category)),
    metrics: {
      totalPackages: packages.length,
      monthlySales: packages.reduce((sum, item) => sum + item.monthlySales, 0),
      monthlyRevenue: round(
        packages.reduce(
          (sum, item) => sum + item.monthlySales * item.price,
          0,
        ),
      ),
      averageSavingsPercent:
        savings.length > 0
          ? round(savings.reduce((sum, value) => sum + value, 0) / savings.length)
          : 0,
    },
  };
}

function voucherStatus(
  voucher: {
    is_active: boolean;
    used_by_id: number | null;
    expires_at: Date;
  },
  now: Date,
): OwnerCatalogPreviewVoucherStatus {
  if (!voucher.is_active) return "archived";
  if (voucher.used_by_id !== null) return "used";
  if (voucher.expires_at.getTime() < now.getTime()) return "expired";
  return "active";
}

async function buildVouchersReadModel(
  context: OwnerContext,
  business: OwnerCatalogPreviewBusiness,
  db: CatalogPreviewDatabase,
  now: Date,
) {
  const rows = await db.voucher.findMany({
    where: {
      business_id: context.businessId,
      business: { owners: { some: ownerMembership(context) } },
    },
    select: {
      id: true,
      code: true,
      type: true,
      value: true,
      minimum_amount: true,
      expires_at: true,
      is_active: true,
      used_by_id: true,
    },
    orderBy: { created_at: "desc" },
  });
  const vouchers = rows.map((row) => ({
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.value,
    minimumAmount: row.minimum_amount,
    expiresAt: row.expires_at.toISOString(),
    status: voucherStatus(row, now),
    redemptions: row.used_by_id === null ? 0 : 1,
  }));

  return {
    section: "vouchers" as const,
    generatedAt: now.toISOString(),
    business,
    vouchers,
    metrics: {
      activeVouchers: vouchers.filter((item) => item.status === "active").length,
      redemptions: vouchers.reduce((sum, item) => sum + item.redemptions, 0),
      archivedVouchers: vouchers.filter((item) => item.status === "archived")
        .length,
    },
  };
}

async function buildGiftCardsReadModel(
  context: OwnerContext,
  business: OwnerCatalogPreviewBusiness,
  db: CatalogPreviewDatabase,
  now: Date,
) {
  const membership = ownerMembership(context);
  const [rows, availableServices, availablePackages] = await Promise.all([
    db.giftCard.findMany({
      where: {
        business_id: context.businessId,
        business: { owners: { some: membership } },
      },
      select: {
        id: true,
        code: true,
        customer_name: true,
        customer_email: true,
        customer_phone: true,
        expires_at: true,
        is_claimed: true,
        claimed_at: true,
        included_services: {
          where: { service: { business_id: context.businessId } },
          select: { service: { select: { id: true, name: true } } },
          orderBy: { service: { name: "asc" } },
        },
        included_packages: {
          where: { package: { business_id: context.businessId } },
          select: { package: { select: { id: true, name: true } } },
          orderBy: { package: { name: "asc" } },
        },
      },
      orderBy: { created_at: "desc" },
    }),
    db.service.findMany({
      where: {
        business_id: context.businessId,
        business: { owners: { some: membership } },
      },
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
    db.servicePackage.findMany({
      where: {
        ...giftablePackageWhere,
        business_id: context.businessId,
        business: { owners: { some: membership } },
      },
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const giftCards = rows.map((row) => ({
    id: row.id,
    code: row.code,
    recipientName: row.customer_name,
    recipientEmail: row.customer_email,
    recipientPhone: row.customer_phone,
    expiresAt: row.expires_at.toISOString(),
    claimedAt: row.claimed_at?.toISOString() ?? null,
    status: row.is_claimed
      ? ("claimed" as const)
      : row.expires_at.getTime() < now.getTime()
        ? ("expired" as const)
        : ("active" as const),
    includedServices: row.included_services.map((item) => item.service),
    includedPackages: row.included_packages.map((item) => item.package),
  }));

  return {
    section: "gift-cards" as const,
    generatedAt: now.toISOString(),
    business,
    giftCards,
    availableServices,
    availablePackages,
    metrics: {
      totalGiftCards: giftCards.length,
      activeGiftCards: giftCards.filter((item) => item.status === "active").length,
      claimedGiftCards: giftCards.filter((item) => item.status === "claimed")
        .length,
      expiredGiftCards: giftCards.filter((item) => item.status === "expired")
        .length,
    },
  };
}

export async function getOwnerCatalogPreviewReadModel(
  context: OwnerContext,
  section: OwnerCatalogPreviewSection,
  options: { now?: Date; db?: CatalogPreviewDatabase } = {},
): Promise<OwnerCatalogPreviewReadModel | null> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const business = await requireCurrentOwnerBusiness(context, db);
  if (!business) return null;

  if (section === "services") {
    return buildServicesReadModel(context, business, db, now);
  }
  if (section === "packages") {
    return buildPackagesReadModel(context, business, db, now);
  }
  if (section === "vouchers") {
    return buildVouchersReadModel(context, business, db, now);
  }
  return buildGiftCardsReadModel(context, business, db, now);
}

export async function resolveOwnerCatalogPreviewReadModel(
  section: OwnerCatalogPreviewSection,
  businessSlug: string,
  userId: string,
) {
  const request = ownerCatalogPreviewRequestSchema.safeParse({
    section,
    businessSlug,
    userId,
  });
  if (!request.success) return null;
  const context = await resolveTenantActorContext(
    request.data.businessSlug,
    request.data.userId,
  );
  if (!context.success || context.actorType !== "OWNER") return null;
  return getOwnerCatalogPreviewReadModel(context, request.data.section);
}
