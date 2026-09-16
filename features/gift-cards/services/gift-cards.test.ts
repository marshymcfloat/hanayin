import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getServerSession: vi.fn(),
  rateLimit: vi.fn(),
  getTenantAccessState: vi.fn(),
  getAvailableSlots: vi.fn(),
  giftCardFindFirst: vi.fn(),
  giftCardFindUnique: vi.fn(),
  giftCardFindMany: vi.fn(),
  giftCardUpdateMany: vi.fn(),
  giftCardCreate: vi.fn(),
  giftCardDelete: vi.fn(),
  serviceFindMany: vi.fn(),
  packageFindMany: vi.fn(),
  customerFindFirst: vi.fn(),
  customerCreate: vi.fn(),
  bookingCreate: vi.fn(),
  publishEvent: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "127.0.0.1" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/features/billing/subscription-service", () => ({
  getTenantAccessState: mocks.getTenantAccessState,
  SUBSCRIPTION_READ_ONLY_ERROR: "Read only",
}));
vi.mock("@/features/bookings/actions/availability", () => ({
  getAvailableSlots: mocks.getAvailableSlots,
}));
vi.mock("@/lib/services/gift-cards", () => ({
  sendGiftCardEmail: vi.fn(),
  sendGiftCardSms: vi.fn(),
}));
vi.mock("@/lib/services/outbox", () => ({ publishEvent: mocks.publishEvent }));
vi.mock("@/lib/security/booking-success-token", () => ({
  createBookingSuccessToken: vi.fn(() => "success-token"),
}));

vi.mock("@/prisma/prisma", () => {
  const tx = {
    giftCard: {
      findFirst: mocks.giftCardFindFirst,
      updateMany: mocks.giftCardUpdateMany,
    },
    customer: {
      findFirst: mocks.customerFindFirst,
      create: mocks.customerCreate,
    },
    employee: { findFirst: vi.fn() },
    owner: { findFirst: vi.fn() },
    booking: { create: mocks.bookingCreate },
  };
  return {
    prisma: {
      giftCard: {
        findFirst: mocks.giftCardFindFirst,
        findUnique: mocks.giftCardFindUnique,
        findMany: mocks.giftCardFindMany,
        create: mocks.giftCardCreate,
        delete: mocks.giftCardDelete,
      },
      service: { findMany: mocks.serviceFindMany },
      servicePackage: { findMany: mocks.packageFindMany },
      business: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback) => callback(tx)),
    },
  };
});

import {
  claimGiftCardBooking,
  createGiftCard,
  getGiftCards,
  updateGiftCard,
} from "./gift-cards";

describe("gift-card workflow invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "owner-1" } },
    });
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.getTenantAccessState.mockResolvedValue({ exists: true, readOnly: false });
    mocks.getServerSession.mockResolvedValue(null);
    mocks.giftCardFindUnique.mockResolvedValue(null);
    mocks.packageFindMany.mockResolvedValue([]);
    mocks.serviceFindMany.mockResolvedValue([]);
  });

  it("rejects a cross-tenant gift-card list before persistence", async () => {
    const result = await getGiftCards("tenant-b");

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.giftCardFindMany).not.toHaveBeenCalled();
  });

  it("rejects updating a card owned by another tenant", async () => {
    mocks.giftCardFindUnique.mockResolvedValue({
      id: 7,
      business: { id: "biz-b", slug: "tenant-b" },
    });

    const result = await updateGiftCard(7, {
      code: "GC-ABCDE",
      customer_name: "Ana",
      customer_email: "ana@example.com",
      expires_at: new Date("2030-01-01T00:00:00.000Z"),
      service_ids: [1],
      package_ids: [],
    });

    expect(result).toEqual({
      success: false,
      error: "Gift card not found or unauthorized",
    });
    expect(mocks.serviceFindMany).not.toHaveBeenCalled();
  });

  it("rejects selected services outside the authenticated tenant", async () => {
    const businessFindUnique = (await import("@/prisma/prisma")).prisma.business
      .findUnique;
    vi.mocked(businessFindUnique).mockResolvedValue({
      id: "biz-a",
      name: "Salon A",
      slug: "tenant-a",
    } as never);

    const result = await createGiftCard({
      code: "GC-ABCDE",
      customer_name: "Ana",
      customer_email: "ana@example.com",
      expires_at: new Date("2030-01-01T00:00:00.000Z"),
      service_ids: [99],
      package_ids: [],
    });

    expect(result).toEqual({
      success: false,
      error: "Some selected services or packages are invalid for this business",
    });
    expect(mocks.serviceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [99] }, business_id: "biz-a" } }),
    );
    expect(mocks.giftCardCreate).not.toHaveBeenCalled();
  });

  it("uses compare-and-set to prevent duplicate claims", async () => {
    const scheduledAt = new Date("2030-01-01T09:00:00.000Z");
    mocks.giftCardFindFirst.mockResolvedValue({
      id: 7,
      code: "GC-ABCDE",
      customer_name: "Ana",
      customer_email: "ana@example.com",
      expires_at: new Date("2031-01-01T00:00:00.000Z"),
      is_claimed: false,
      business: { id: "biz-a", slug: "tenant-a", name: "Salon A" },
      included_services: [
        {
          service: {
            id: 3,
            name: "Massage",
            category: "Massage",
            duration: 60,
            price: 500,
            estimated_cost: 100,
          },
        },
      ],
      included_packages: [],
    });
    mocks.getAvailableSlots.mockResolvedValue([
      { startTime: scheduledAt, endTime: new Date(scheduledAt.getTime() + 3_600_000) },
    ]);
    mocks.customerFindFirst.mockResolvedValue({ id: 11 });
    mocks.giftCardUpdateMany.mockResolvedValue({ count: 0 });

    const result = await claimGiftCardBooking({
      businessSlug: "tenant-a",
      code: "gc-abcde",
      email: "ana@example.com",
      scheduledAt,
    });

    expect(result).toEqual({
      success: false,
      error: "This gift card was already claimed. Please refresh and try again.",
    });
    expect(mocks.giftCardUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 7, is_claimed: false }),
      }),
    );
    expect(mocks.bookingCreate).not.toHaveBeenCalled();
    expect(mocks.publishEvent).not.toHaveBeenCalled();
  });
});
