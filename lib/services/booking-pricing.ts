import { calculateBookingTotal } from "@/lib/utils/pricing";
import { Prisma, PrismaClient } from "@/prisma/generated/prisma/client";

type PricingDbClient = PrismaClient | Prisma.TransactionClient;

export type BookingServiceInput = {
  id: number;
  quantity: number;
  duration?: number;
  claimedByCurrentEmployee?: boolean;
  packageId?: number;
};

export type CanonicalBookingService = {
  id: number;
  name: string;
  quantity: number;
  duration: number;
  claimedByCurrentEmployee?: boolean;
  packageId?: number;
  price: number;
  originalPrice: number;
  estimatedCost: number;
  discount: number;
  discountReason: string | null;
  commissionBase: number;
};

export type BookingPricingSnapshot = {
  business: {
    id: string;
    slug: string;
    name: string;
    commission_calculation_basis: "ORIGINAL_PRICE" | "DISCOUNTED_PRICE";
  };
  services: CanonicalBookingService[];
  subtotal: number;
  voucherDiscount: number;
  grandTotal: number;
  downpaymentAmount: number | null;
  amountToPay: number;
  totalDuration: number;
  estimatedEnd: Date;
  voucher: { id: number; code: string } | null;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function getBestDiscountEvent<T extends { discount_type: string; discount_value: number }>(
  events: T[],
  basePrice: number,
) {
  if (!events.length) return null;

  return events
    .map((event) => {
      const discount =
        event.discount_type === "PERCENTAGE"
          ? (basePrice * event.discount_value) / 100
          : event.discount_value;
      return {
        event,
        discount: Math.min(discount, basePrice),
      };
    })
    .sort((a, b) => b.discount - a.discount)[0];
}

export async function buildBookingPricingSnapshot({
  db,
  businessSlug,
  scheduledAt,
  services,
  paymentMethod,
  paymentType,
  voucherCode,
}: {
  db: PricingDbClient;
  businessSlug: string;
  scheduledAt: Date;
  services: BookingServiceInput[];
  paymentMethod: "CASH" | "QRPH";
  paymentType: "FULL" | "DOWNPAYMENT";
  voucherCode?: string;
}): Promise<BookingPricingSnapshot> {
  const business = await db.business.findUnique({
    where: { slug: businessSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      commission_calculation_basis: true,
    },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  const normalizedServices = services.map((service) => ({
    id: Number(service.id),
    quantity: Math.max(1, Number(service.quantity) || 1),
    duration: service.duration,
    claimedByCurrentEmployee: service.claimedByCurrentEmployee,
    packageId:
      service.packageId !== undefined ? Number(service.packageId) : undefined,
  }));

  if (!normalizedServices.length) {
    throw new Error("At least one service is required");
  }

  const uniqueServiceIds = Array.from(
    new Set(normalizedServices.map((service) => service.id)),
  );
  const uniquePackageIds = Array.from(
    new Set(
      normalizedServices
        .map((service) => service.packageId)
        .filter((packageId): packageId is number => packageId !== undefined),
    ),
  );

  const [dbServices, packageItems, dbPackages, activeSaleEvents] =
    await Promise.all([
      db.service.findMany({
        where: {
          business_id: business.id,
          id: { in: uniqueServiceIds },
        },
        select: {
          id: true,
          name: true,
          price: true,
          estimated_cost: true,
          duration: true,
        },
      }),
      uniquePackageIds.length
        ? db.packageItem.findMany({
            where: {
              package_id: { in: uniquePackageIds },
              service_id: { in: uniqueServiceIds },
              package: { business_id: business.id },
            },
            select: {
              package_id: true,
              service_id: true,
              custom_price: true,
            },
          })
        : Promise.resolve([]),
      uniquePackageIds.length
        ? db.servicePackage.findMany({
            where: {
              id: { in: uniquePackageIds },
              business_id: business.id,
            },
            select: {
              id: true,
              price: true,
            },
          })
        : Promise.resolve([]),
      db.saleEvent.findMany({
        where: {
          business_id: business.id,
          start_date: { lte: new Date() },
          end_date: { gte: new Date() },
        },
        select: {
          title: true,
          discount_type: true,
          discount_value: true,
          applicable_services: { select: { id: true } },
          applicable_packages: { select: { id: true } },
        },
      }),
    ]);

  if (dbServices.length !== uniqueServiceIds.length) {
    throw new Error("One or more selected services are invalid");
  }

  if (dbPackages.length !== uniquePackageIds.length) {
    throw new Error("One or more selected packages are invalid");
  }

  const serviceById = new Map(dbServices.map((service) => [service.id, service]));
  const packageById = new Map(dbPackages.map((pkg) => [pkg.id, pkg]));
  const packageItemByKey = new Map(
    packageItems.map((item) => [
      `${item.package_id}:${item.service_id}`,
      item.custom_price,
    ]),
  );

  const packageRatioById = new Map<
    number,
    { ratio: number; reason: string | null }
  >();

  for (const packageId of uniquePackageIds) {
    const pkg = packageById.get(packageId);
    if (!pkg) {
      throw new Error("Selected package is invalid");
    }

    const packageEvents = activeSaleEvents.filter((event) =>
      event.applicable_packages.some((p) => p.id === packageId),
    );
    const bestPackageDiscount = getBestDiscountEvent(packageEvents, pkg.price);

    if (!bestPackageDiscount || pkg.price <= 0) {
      packageRatioById.set(packageId, { ratio: 1, reason: null });
      continue;
    }

    const discountedPackagePrice = Math.max(
      0,
      pkg.price - bestPackageDiscount.discount,
    );
    const ratio = discountedPackagePrice / pkg.price;

    packageRatioById.set(packageId, {
      ratio,
      reason: bestPackageDiscount.event.title,
    });
  }

  const canonicalServices: CanonicalBookingService[] = normalizedServices.map(
    (selected) => {
      const dbService = serviceById.get(selected.id);
      if (!dbService) {
        throw new Error("Selected service is invalid");
      }

      const duration = dbService.duration || selected.duration || 30;

      if (selected.packageId !== undefined) {
        const packageKey = `${selected.packageId}:${selected.id}`;
        const packageItemPrice = packageItemByKey.get(packageKey);

        if (packageItemPrice === undefined) {
          throw new Error("Selected package service is invalid");
        }

        const packagePricing = packageRatioById.get(selected.packageId) || {
          ratio: 1,
          reason: null,
        };
        const originalPrice = roundMoney(packageItemPrice);
        const price = roundMoney(originalPrice * packagePricing.ratio);
        const discount = roundMoney(originalPrice - price);
        const commissionBase =
          business.commission_calculation_basis === "ORIGINAL_PRICE"
            ? originalPrice
            : price;

        return {
          id: dbService.id,
          name: dbService.name,
          quantity: selected.quantity,
          duration,
          claimedByCurrentEmployee: selected.claimedByCurrentEmployee,
          packageId: selected.packageId,
          price,
          originalPrice,
          estimatedCost: roundMoney(dbService.estimated_cost ?? 0),
          discount,
          discountReason: discount > 0 ? packagePricing.reason : null,
          commissionBase: roundMoney(commissionBase),
        };
      }

      const originalPrice = roundMoney(dbService.price);
      const serviceEvents = activeSaleEvents.filter((event) =>
        event.applicable_services.some((service) => service.id === dbService.id),
      );
      const bestServiceDiscount = getBestDiscountEvent(serviceEvents, originalPrice);
      const discount = bestServiceDiscount
        ? roundMoney(bestServiceDiscount.discount)
        : 0;
      const price = roundMoney(Math.max(0, originalPrice - discount));
      const commissionBase =
        business.commission_calculation_basis === "ORIGINAL_PRICE"
          ? originalPrice
          : price;

      return {
        id: dbService.id,
        name: dbService.name,
        quantity: selected.quantity,
        duration,
        claimedByCurrentEmployee: selected.claimedByCurrentEmployee,
        price,
        originalPrice,
        estimatedCost: roundMoney(dbService.estimated_cost ?? 0),
        discount,
        discountReason: bestServiceDiscount ? bestServiceDiscount.event.title : null,
        commissionBase: roundMoney(commissionBase),
      };
    },
  );

  const subtotal = roundMoney(
    canonicalServices.reduce(
      (sum, service) => sum + service.price * service.quantity,
      0,
    ),
  );

  let voucherDiscount = 0;
  let voucher: { id: number; code: string } | null = null;

  if (voucherCode) {
    const normalizedVoucherCode = voucherCode.trim().toUpperCase();
    const dbVoucher = await db.voucher.findUnique({
      where: { code: normalizedVoucherCode },
      include: { business: { select: { slug: true } } },
    });

    if (!dbVoucher) {
      throw new Error("Voucher code not found");
    }

    if (dbVoucher.business.slug !== businessSlug) {
      throw new Error("Voucher is not valid for this business");
    }

    if (!dbVoucher.is_active || dbVoucher.used_by_id) {
      throw new Error("Voucher is no longer available");
    }

    if (new Date() > dbVoucher.expires_at) {
      throw new Error("Voucher has expired");
    }

    if (subtotal < dbVoucher.minimum_amount) {
      throw new Error(
        `Minimum spend of ${dbVoucher.minimum_amount} required to use this voucher`,
      );
    }

    voucherDiscount = roundMoney(
      dbVoucher.type === "PERCENTAGE"
        ? (subtotal * dbVoucher.value) / 100
        : dbVoucher.value,
    );
    voucherDiscount = Math.min(voucherDiscount, subtotal);
    voucher = { id: dbVoucher.id, code: dbVoucher.code };
  }

  const grandTotal = roundMoney(Math.max(0, subtotal - voucherDiscount));
  const downpaymentAmount =
    paymentType === "DOWNPAYMENT" ? roundMoney(grandTotal * 0.5) : null;
  const amountToPay = calculateBookingTotal({
    subtotal,
    voucherDiscount,
    paymentMethod,
    paymentType,
  });

  const totalDuration = canonicalServices.reduce(
    (sum, service) => sum + service.duration * service.quantity,
    0,
  );
  const estimatedEnd = new Date(
    scheduledAt.getTime() + totalDuration * 60 * 1000,
  );

  return {
    business: {
      id: business.id,
      slug: business.slug,
      name: business.name,
      commission_calculation_basis: business.commission_calculation_basis,
    },
    services: canonicalServices,
    subtotal,
    voucherDiscount,
    grandTotal,
    downpaymentAmount,
    amountToPay,
    totalDuration,
    estimatedEnd,
    voucher,
  };
}
