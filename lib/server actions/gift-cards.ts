"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@/prisma/generated/prisma/client";

import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";
import { sendGiftCardEmail, sendGiftCardSms } from "@/lib/services/gift-cards";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFromForwardedFor } from "@/lib/client-ip";
import { getAvailableSlots } from "@/lib/server actions/availability";
import { createBookingSuccessToken } from "@/lib/security/booking-success-token";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { publishEvent } from "@/lib/services/outbox";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next auth/options";
import { getTenantAccessState, SUBSCRIPTION_READ_ONLY_ERROR } from "@/features/billing/subscription-service";

type GiftCardWriteInput = {
  code: string;
  customer_name: string;
  // Wave N4: at least one of {email, phone} is required at the application
  // layer so the code can actually reach the customer. Both are optional in
  // the DB to keep migration cheap.
  customer_email?: string | null;
  customer_phone?: string | null;
  expires_at: Date | string;
  service_ids: number[];
  package_ids: number[];
};

const CODE_LENGTH = 5;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GIFT_CARD_CLAIM_RATE_LIMIT = {
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
} as const;

function normalizeDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeOptionalEmail(value: string | null | undefined) {
  const trimmed = (value ?? "").trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function normalizeOptionalPhone(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function generateSuffix(length: number) {
  // crypto.randomInt is unbiased and cryptographically secure.
  // Math.random would let attackers predict subsequent codes after
  // observing one, and is biased toward lower indices in alphabets
  // whose length doesn't divide 2^32 evenly.
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return output;
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values));
}

type GiftCardClaimLineItem = {
  serviceId: number;
  serviceName: string;
  category: string;
  duration: number;
  originalPrice: number;
  estimatedCost: number;
  packageId: number | null;
  packageName: string | null;
};

type GiftCardClaimCardDetails = {
  id: number;
  code: string;
  customer_name: string;
  customer_email: string | null;
  expires_at: Date;
  is_claimed: boolean;
  business: {
    id: string;
    slug: string;
    name: string;
  };
  included_services: {
    service: {
      id: number;
      name: string;
      category: string;
      duration: number | null;
      price: number;
      estimated_cost: number;
    };
  }[];
  included_packages: {
    package: {
      id: number;
      name: string;
      items: {
        custom_price: number;
        service: {
          id: number;
          name: string;
          category: string;
          duration: number | null;
          estimated_cost: number;
        };
      }[];
    };
  }[];
};

export type GiftCardClaimPreviewData = {
  code: string;
  customerName: string;
  customerEmail: string | null;
  expiresAt: string;
  lineItems: {
    serviceId: number;
    serviceName: string;
    category: string;
    duration: number;
    packageId: number | null;
    packageName: string | null;
  }[];
  slotServices: {
    id: number;
    quantity: number;
  }[];
  totalDuration: number;
};

function getGiftCardClaimErrorMessage(
  giftCard: Pick<
    GiftCardClaimCardDetails,
    "is_claimed" | "expires_at" | "customer_email"
  >,
  customerEmail: string,
) {
  if (giftCard.is_claimed) {
    return "This gift card has already been claimed.";
  }

  if (giftCard.expires_at.getTime() < Date.now()) {
    return "This gift card has already expired.";
  }

  // Wave N4: customer_email is now optional. If the card was created with
  // phone-only delivery, we can't match by email — surface a clear error so
  // the customer is told to use the matching channel. The claim flow itself
  // is email-based today; phone-only claim is a future-wave feature.
  if (!giftCard.customer_email) {
    return "This gift card is not associated with an email address.";
  }
  if (normalizeEmail(giftCard.customer_email) !== customerEmail) {
    return "Gift card code and email do not match.";
  }

  return null;
}

function buildGiftCardClaimItems(giftCard: GiftCardClaimCardDetails) {
  const directServices: GiftCardClaimLineItem[] = giftCard.included_services.map(
    ({ service }) => ({
      serviceId: service.id,
      serviceName: service.name,
      category: service.category,
      duration: service.duration || 30,
      originalPrice: service.price,
      estimatedCost: service.estimated_cost,
      packageId: null,
      packageName: null,
    }),
  );

  const packagedServices: GiftCardClaimLineItem[] = giftCard.included_packages.flatMap(
    ({ package: pkg }) =>
      pkg.items.map((item) => ({
        serviceId: item.service.id,
        serviceName: item.service.name,
        category: item.service.category,
        duration: item.service.duration || 30,
        originalPrice: item.custom_price,
        estimatedCost: item.service.estimated_cost,
        packageId: pkg.id,
        packageName: pkg.name,
      })),
  );

  return [...directServices, ...packagedServices];
}

function buildSlotServiceInputs(items: GiftCardClaimLineItem[]) {
  const serviceMap = new Map<number, number>();

  items.forEach((item) => {
    serviceMap.set(item.serviceId, (serviceMap.get(item.serviceId) || 0) + 1);
  });

  return Array.from(serviceMap.entries()).map(([id, quantity]) => ({
    id,
    quantity,
  }));
}

async function getGiftCardForClaim(
  dbClient: typeof prisma | Prisma.TransactionClient,
  businessSlug: string,
  code: string,
) {
  return dbClient.giftCard.findFirst({
    where: {
      code,
      business: {
        slug: businessSlug,
      },
    },
    include: {
      business: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
      included_services: {
        include: {
          service: {
            select: {
              id: true,
              name: true,
              category: true,
              duration: true,
              price: true,
              estimated_cost: true,
            },
          },
        },
      },
      included_packages: {
        include: {
          package: {
            select: {
              id: true,
              name: true,
              items: {
                select: {
                  custom_price: true,
                  service: {
                    select: {
                      id: true,
                      name: true,
                      category: true,
                      duration: true,
                      estimated_cost: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }) as Promise<GiftCardClaimCardDetails | null>;
}

async function enforceGiftCardClaimRateLimit(scope: "preview" | "claim") {
  const headersList = await headers();
  const clientIp = clientIpFromForwardedFor(headersList.get("x-forwarded-for"));

  const limiter = await rateLimit(`gift-card-${scope}:${clientIp}`, {
    windowMs: GIFT_CARD_CLAIM_RATE_LIMIT.windowMs,
    maxRequests: GIFT_CARD_CLAIM_RATE_LIMIT.maxRequests,
  });

  if (!limiter.success) {
    throw new Error(
      "Too many attempts. Please wait a few minutes before trying again.",
    );
  }
}

export async function previewGiftCardClaimAction(input: {
  businessSlug: string;
  code: string;
  email: string;
}): Promise<{ success: true; data: GiftCardClaimPreviewData } | { success: false; error: string }> {
  const businessSlug = input.businessSlug?.trim();
  const code = normalizeCode(input.code || "");
  const email = normalizeEmail(input.email || "");

  if (!businessSlug || !code || !email) {
    return { success: false, error: "Gift card code and email are required." };
  }

  try {
    await enforceGiftCardClaimRateLimit("preview");

    const giftCard = await getGiftCardForClaim(prisma, businessSlug, code);
    if (!giftCard) {
      return { success: false, error: "Gift card was not found." };
    }

    const claimError = getGiftCardClaimErrorMessage(giftCard, email);
    if (claimError) {
      return { success: false, error: claimError };
    }

    const lineItems = buildGiftCardClaimItems(giftCard);
    if (lineItems.length === 0) {
      return {
        success: false,
        error: "This gift card has no items configured. Please contact the business.",
      };
    }

    const slotServices = buildSlotServiceInputs(lineItems);
    const totalDuration = lineItems.reduce(
      (sum, item) => sum + item.duration,
      0,
    );

    return {
      success: true,
      data: {
        code: giftCard.code,
        customerName: giftCard.customer_name,
        customerEmail: giftCard.customer_email,
        expiresAt: giftCard.expires_at.toISOString(),
        lineItems: lineItems.map((item) => ({
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          category: item.category,
          duration: item.duration,
          packageId: item.packageId,
          packageName: item.packageName,
        })),
        slotServices,
        totalDuration,
      },
    };
  } catch (error) {
    console.error("Failed to preview gift card claim:", error);
    return { success: false, error: "Failed to verify gift card." };
  }
}

export async function claimGiftCardBookingAction(input: {
  businessSlug: string;
  code: string;
  email: string;
  scheduledAt: Date | string;
  isWalkIn?: boolean;
}): Promise<
  | { success: true; data: { bookingId: number; successToken: string } }
  | { success: false; error: string }
> {
  const businessSlug = input.businessSlug?.trim();
  const code = normalizeCode(input.code || "");
  const email = normalizeEmail(input.email || "");
  const scheduledAt =
    input.scheduledAt instanceof Date
      ? input.scheduledAt
      : new Date(input.scheduledAt);
  const isWalkIn = Boolean(input.isWalkIn);

  if (!businessSlug || !code || !email || Number.isNaN(scheduledAt.getTime())) {
    return { success: false, error: "Invalid claim request." };
  }

  try {
    await enforceGiftCardClaimRateLimit("claim");
    const accessState = await getTenantAccessState(businessSlug);
    if (!accessState.exists) {
      return { success: false, error: "Business was not found." };
    }
    if (accessState.readOnly) {
      return { success: false, error: SUBSCRIPTION_READ_ONLY_ERROR };
    }

    const session = await getServerSession(authOptions);

    const booking = await prisma.$transaction(async (tx) => {
      const giftCard = await getGiftCardForClaim(tx, businessSlug, code);
      if (!giftCard) {
        throw new Error("Gift card was not found.");
      }

      const claimError = getGiftCardClaimErrorMessage(giftCard, email);
      if (claimError) {
        throw new Error(claimError);
      }

      const lineItems = buildGiftCardClaimItems(giftCard);
      if (lineItems.length === 0) {
        throw new Error("This gift card has no services configured.");
      }

      const slotServices = buildSlotServiceInputs(lineItems);
      let slotStart = new Date(scheduledAt);
      let slotEnd: Date | null = null;
      let claimedByEmployeeId: number | null = null;
      let claimedByOwnerId: number | null = null;

      if (isWalkIn) {
        if (!session?.user?.id) {
          throw new Error("Only staff can create walk-in gift card claims.");
        }

        const [employee, owner] = await Promise.all([
          tx.employee.findFirst({
            where: {
              user_id: session.user.id,
              business_id: giftCard.business.id,
            },
            select: { id: true },
          }),
          tx.owner.findFirst({
            where: {
              user_id: session.user.id,
              business_id: giftCard.business.id,
            },
            select: { id: true },
          }),
        ]);

        if (!employee && !owner) {
          throw new Error("Unauthorized walk-in claim for this business.");
        }

        claimedByEmployeeId = employee?.id || null;
        claimedByOwnerId = owner?.id || null;

        const totalDuration = lineItems.reduce(
          (sum, item) => sum + item.duration,
          0,
        );
        slotStart = getCurrentDateTimePH();
        slotEnd = new Date(slotStart.getTime() + totalDuration * 60 * 1000);
      } else {
        const availableSlots = await getAvailableSlots({
          businessSlug,
          date: scheduledAt,
          services: slotServices,
        });

        const selectedSlot = availableSlots.find(
          (slot) => slot.startTime.getTime() === scheduledAt.getTime(),
        );

        if (!selectedSlot) {
          throw new Error(
            "The selected date/time is no longer available. Please pick another slot.",
          );
        }
        slotStart = selectedSlot.startTime;
        slotEnd = selectedSlot.endTime;
      }

      const customer =
        (await tx.customer.findFirst({
          where: {
            business_id: giftCard.business.id,
            email: {
              equals: email,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
          },
        })) ||
        (await tx.customer.create({
          data: {
            name: giftCard.customer_name,
            email: email,
            business_id: giftCard.business.id,
          },
          select: {
            id: true,
          },
        }));

      const claimedAt = getCurrentDateTimePH();
      const claimUpdate = await tx.giftCard.updateMany({
        where: {
          id: giftCard.id,
          is_claimed: false,
          expires_at: {
            gte: claimedAt,
          },
        },
        data: {
          is_claimed: true,
          claimed_at: claimedAt,
          claimed_by_customer_id: customer.id,
        },
      });

      if (claimUpdate.count === 0) {
        throw new Error(
          "This gift card was already claimed. Please refresh and try again.",
        );
      }

      let cursor = new Date(slotStart);
      const totalOriginalPrice = lineItems.reduce(
        (sum, item) => sum + item.originalPrice,
        0,
      );
      const claimTimestamp = isWalkIn ? claimedAt : null;
      const initialServiceStatus = isWalkIn ? "CLAIMED" : "PENDING";

      const booking = await tx.booking.create({
        data: {
          business_id: giftCard.business.id,
          customer_id: customer.id,
          status: "ACCEPTED",
          payment_method: "CASH",
          payment_status: "PAID",
          amount_paid: 0,
          grand_total: 0,
          total_discount: totalOriginalPrice,
          scheduled_at: slotStart,
          estimated_end: slotEnd || slotStart,
          availed_services: {
            create: lineItems.map((item) => {
              const serviceStart = new Date(cursor);
              const serviceEnd = new Date(
                serviceStart.getTime() + item.duration * 60 * 1000,
              );
              cursor = serviceEnd;

              return {
                service_id: item.serviceId,
                package_id: item.packageId,
                price: item.originalPrice,
                estimated_cost: item.estimatedCost,
                discount: item.originalPrice,
                discount_reason: `GIFT_CARD:${giftCard.code}`,
                final_price: 0,
                commission_base: 0,
                status: initialServiceStatus,
                claimed_at: claimTimestamp,
                served_by_id: claimedByEmployeeId,
                served_by_owner_id: claimedByOwnerId,
                served_by_type: claimedByOwnerId
                  ? "OWNER"
                  : claimedByEmployeeId
                    ? "EMPLOYEE"
                    : null,
                scheduled_at: serviceStart,
                estimated_end: serviceEnd,
              };
            }),
          },
        },
      });

      await publishEvent(tx as Prisma.TransactionClient, {
        type: "BOOKING_CONFIRMED",
        aggregateType: "Booking",
        aggregateId: String(booking.id),
        businessId: giftCard.business.id,
        payload: {
          bookingId: booking.id,
          customerName: giftCard.customer_name,
          email: email,
          scheduledAt: slotStart.toISOString(),
          estimatedEnd: (slotEnd || slotStart).toISOString(),
          grandTotal: 0,
          status: "ACCEPTED",
        },
      });

      return booking;
    });

    revalidatePath(`/app/${businessSlug}/gift-cards`);
    revalidatePath(`/app/${businessSlug}`);

    return {
      success: true,
      data: {
        bookingId: booking.id,
        successToken: createBookingSuccessToken({
          bookingId: booking.id,
          businessSlug,
        }),
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to claim gift card.";
    return { success: false, error: message };
  }
}

export async function getGiftCardsAction(businessSlug: string) {
  const auth = await requireAuth();
  if (!auth.success) return auth;

  if (auth.businessSlug !== businessSlug) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const cards = await prisma.giftCard.findMany({
      where: {
        business: {
          slug: businessSlug,
        },
      },
      include: {
        included_services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        included_packages: {
          include: {
            package: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return { success: true, data: cards };
  } catch (error) {
    console.error("Failed to get gift cards:", error);
    return { success: false, error: "Failed to fetch gift cards" };
  }
}

export async function generateGiftCardCodeAction() {
  const auth = await requireAuth();
  if (!auth.success) return auth;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: auth.businessSlug },
      select: { initials: true },
    });

    if (!business) {
      return { success: false, error: "Business not found" };
    }

    const prefix = (business.initials || "GC").toUpperCase();

    for (let i = 0; i < 10; i += 1) {
      const suffix = generateSuffix(CODE_LENGTH);
      const code = `${prefix}-${suffix}`;

      const existing = await prisma.giftCard.findUnique({
        where: { code },
        select: { id: true },
      });

      if (!existing) {
        return { success: true, code };
      }
    }

    return {
      success: false,
      error: "Failed to generate unique code. Please try again.",
    };
  } catch (error) {
    console.error("Failed to generate gift card code:", error);
    return { success: false, error: "Failed to generate code" };
  }
}

export async function createGiftCardAction(input: GiftCardWriteInput) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;

  const code = normalizeCode(input.code);
  const customerName = input.customer_name.trim();
  const customerEmail = normalizeOptionalEmail(input.customer_email);
  const customerPhone = normalizeOptionalPhone(input.customer_phone);
  const expiresAt = normalizeDate(input.expires_at);
  const serviceIds = uniqueNumbers(input.service_ids || []);
  const packageIds = uniqueNumbers(input.package_ids || []);

  if (!code || !customerName || !expiresAt) {
    return { success: false, error: "Missing required fields" };
  }

  if (!customerEmail && !customerPhone) {
    return {
      success: false,
      error: "Provide at least an email or phone so the code can be delivered",
    };
  }

  if (serviceIds.length === 0 && packageIds.length === 0) {
    return { success: false, error: "Select at least one service or package" };
  }

  try {
    const business = await prisma.business.findUnique({
      where: { slug: auth.businessSlug },
      select: { id: true, name: true, slug: true },
    });

    if (!business) {
      return { success: false, error: "Business not found" };
    }

    const existingCode = await prisma.giftCard.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existingCode) {
      return { success: false, error: "Gift card code already exists" };
    }

    const [services, packages] = await Promise.all([
      serviceIds.length
        ? prisma.service.findMany({
            where: {
              id: { in: serviceIds },
              business_id: business.id,
            },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      packageIds.length
        ? prisma.servicePackage.findMany({
            where: {
              id: { in: packageIds },
              business_id: business.id,
            },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    if (services.length !== serviceIds.length || packages.length !== packageIds.length) {
      return {
        success: false,
        error: "Some selected services or packages are invalid for this business",
      };
    }

    const card = await prisma.giftCard.create({
      data: {
        code,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        expires_at: expiresAt,
        // Prisma 7 checked-create rejects the `business_id` scalar when the
        // statement also drives nested relation writes (included_services /
        // included_packages). Use the relation form for both consistency
        // and forward compatibility.
        business: { connect: { id: business.id } },
        included_services: {
          createMany: {
            data: services.map((service) => ({
              service_id: service.id,
            })),
          },
        },
        included_packages: {
          createMany: {
            data: packages.map((pkg) => ({
              package_id: pkg.id,
            })),
          },
        },
      },
      include: {
        included_services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        included_packages: {
          include: {
            package: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Wave N4: dispatch to whichever channels are present. SMS goes first
    // because gift codes are time-sensitive and the SMS body is the minimum
    // viable delivery (code + expiry). Email still goes when present —
    // carries the full styled card with services list.
    const includedServiceNames = services.map((service) => service.name);
    const includedPackageNames = packages.map((pkg) => pkg.name);
    const [smsResult, emailResult] = await Promise.all([
      card.customer_phone
        ? sendGiftCardSms({
            businessName: business.name,
            customerName: card.customer_name,
            customerPhone: card.customer_phone,
            giftCardCode: card.code,
            expiresAt: card.expires_at,
          })
        : Promise.resolve(null),
      card.customer_email
        ? sendGiftCardEmail({
            businessName: business.name,
            customerName: card.customer_name,
            customerEmail: card.customer_email,
            giftCardCode: card.code,
            expiresAt: card.expires_at,
            includedServices: includedServiceNames,
            includedPackages: includedPackageNames,
          })
        : Promise.resolve(null),
    ]);

    revalidatePath(`/app/${business.slug}/gift-cards`);

    const smsAttempted = smsResult !== null;
    const emailAttempted = emailResult !== null;
    const smsSucceeded = smsAttempted && smsResult!.success;
    const emailSucceeded = emailAttempted && emailResult!.success;
    const smsFailed = smsAttempted && !smsSucceeded;
    const emailFailed = emailAttempted && !emailSucceeded;

    console.log("[GiftCard] Dispatch outcome", {
      code: card.code,
      smsAttempted,
      smsSucceeded,
      emailAttempted,
      emailSucceeded,
    });

    if (smsFailed || emailFailed) {
      const failed: string[] = [];
      if (smsFailed) failed.push("SMS");
      if (emailFailed) failed.push("email");
      return {
        success: true,
        data: card,
        warning: `Gift card created but ${failed.join(" and ")} could not be sent. You can resend manually later.`,
        channelOutcome: { smsAttempted, smsSucceeded, emailAttempted, emailSucceeded },
      };
    }

    return {
      success: true,
      data: card,
      channelOutcome: { smsAttempted, smsSucceeded, emailAttempted, emailSucceeded },
    };
  } catch (error) {
    console.error("Failed to create gift card:", error);
    return { success: false, error: "Failed to create gift card" };
  }
}

export async function updateGiftCardAction(
  giftCardId: number,
  input: GiftCardWriteInput,
) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;

  const code = normalizeCode(input.code);
  const customerName = input.customer_name.trim();
  const customerEmail = normalizeOptionalEmail(input.customer_email);
  const customerPhone = normalizeOptionalPhone(input.customer_phone);
  const expiresAt = normalizeDate(input.expires_at);
  const serviceIds = uniqueNumbers(input.service_ids || []);
  const packageIds = uniqueNumbers(input.package_ids || []);

  if (!code || !customerName || !expiresAt) {
    return { success: false, error: "Missing required fields" };
  }

  if (!customerEmail && !customerPhone) {
    return {
      success: false,
      error: "Provide at least an email or phone so the code can be delivered",
    };
  }

  if (serviceIds.length === 0 && packageIds.length === 0) {
    return { success: false, error: "Select at least one service or package" };
  }

  try {
    const existing = await prisma.giftCard.findUnique({
      where: { id: giftCardId },
      include: {
        business: {
          select: { id: true, slug: true },
        },
      },
    });

    if (!existing || existing.business.slug !== auth.businessSlug) {
      return { success: false, error: "Gift card not found or unauthorized" };
    }

    const duplicate = await prisma.giftCard.findFirst({
      where: {
        code,
        NOT: {
          id: giftCardId,
        },
      },
      select: { id: true },
    });

    if (duplicate) {
      return { success: false, error: "Gift card code already exists" };
    }

    const [services, packages] = await Promise.all([
      serviceIds.length
        ? prisma.service.findMany({
            where: {
              id: { in: serviceIds },
              business_id: existing.business.id,
            },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      packageIds.length
        ? prisma.servicePackage.findMany({
            where: {
              id: { in: packageIds },
              business_id: existing.business.id,
            },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    if (services.length !== serviceIds.length || packages.length !== packageIds.length) {
      return {
        success: false,
        error: "Some selected services or packages are invalid for this business",
      };
    }

    const card = await prisma.$transaction(async (tx) => {
      const updated = await tx.giftCard.update({
        where: { id: giftCardId },
        data: {
          code,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          expires_at: expiresAt,
        },
      });

      await tx.giftCardService.deleteMany({
        where: { gift_card_id: giftCardId },
      });

      await tx.giftCardPackage.deleteMany({
        where: { gift_card_id: giftCardId },
      });

      if (services.length > 0) {
        await tx.giftCardService.createMany({
          data: services.map((service) => ({
            gift_card_id: giftCardId,
            service_id: service.id,
          })),
        });
      }

      if (packages.length > 0) {
        await tx.giftCardPackage.createMany({
          data: packages.map((pkg) => ({
            gift_card_id: giftCardId,
            package_id: pkg.id,
          })),
        });
      }

      return updated;
    });

    revalidatePath(`/app/${existing.business.slug}/gift-cards`);
    return { success: true, data: card };
  } catch (error) {
    console.error("Failed to update gift card:", error);
    return { success: false, error: "Failed to update gift card" };
  }
}

export async function deleteGiftCardAction(giftCardId: number) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;

  try {
    const existing = await prisma.giftCard.findUnique({
      where: { id: giftCardId },
      include: {
        business: {
          select: { slug: true },
        },
      },
    });

    if (!existing || existing.business.slug !== auth.businessSlug) {
      return { success: false, error: "Gift card not found or unauthorized" };
    }

    await prisma.giftCard.delete({
      where: { id: giftCardId },
    });

    revalidatePath(`/app/${existing.business.slug}/gift-cards`);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete gift card:", error);
    return { success: false, error: "Failed to delete gift card" };
  }
}
