import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  resolveTenantActorContext: vi.fn(),
  getServerSession: vi.fn(),
  rateLimit: vi.fn(),
  getTenantAccessState: vi.fn(),
  getAvailableSlots: vi.fn(),
  giftCardFindFirst: vi.fn(),
  giftCardFindUnique: vi.fn(),
  giftCardFindMany: vi.fn(),
  giftCardUpdateMany: vi.fn(),
  giftCardCreate: vi.fn(),
  giftCardUpdate: vi.fn(),
  giftCardDeleteMany: vi.fn(),
  giftCardServiceDeleteMany: vi.fn(),
  giftCardServiceCreateMany: vi.fn(),
  giftCardPackageDeleteMany: vi.fn(),
  giftCardPackageCreateMany: vi.fn(),
  businessFindFirst: vi.fn(),
  serviceFindMany: vi.fn(),
  packageFindMany: vi.fn(),
  customerFindFirst: vi.fn(),
  customerCreate: vi.fn(),
  bookingCreate: vi.fn(),
  publishEvent: vi.fn(),
  sendEmail: vi.fn(),
  sendSms: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/auth/staff-access", () => ({
  resolveTenantActorContext: mocks.resolveTenantActorContext,
}));
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
vi.mock("@/lib/services/gift-cards", () => ({ sendGiftCardEmail: mocks.sendEmail, sendGiftCardSms: mocks.sendSms }));
vi.mock("@/lib/services/outbox", () => ({ publishEvent: mocks.publishEvent }));
vi.mock("@/lib/security/booking-success-token", () => ({
  createBookingSuccessToken: vi.fn(() => "success-token"),
}));

vi.mock("@/prisma/prisma", () => {
  const tx = {
    business: { findFirst: mocks.businessFindFirst },
    giftCard: {
      findFirst: mocks.giftCardFindFirst,
      findUnique: mocks.giftCardFindUnique,
      updateMany: mocks.giftCardUpdateMany,
      create: mocks.giftCardCreate,
      update: mocks.giftCardUpdate,
      deleteMany: mocks.giftCardDeleteMany,
    },
    giftCardService: { deleteMany: mocks.giftCardServiceDeleteMany, createMany: mocks.giftCardServiceCreateMany },
    giftCardPackage: { deleteMany: mocks.giftCardPackageDeleteMany, createMany: mocks.giftCardPackageCreateMany },
    service: { findMany: mocks.serviceFindMany },
    servicePackage: { findMany: mocks.packageFindMany },
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
  deleteGiftCard,
  getGiftCards,
  updateGiftCard,
} from "./gift-cards";

const actor = { success: true, actorType: "OWNER", role: "OWNER", ownerId: 7, userId: "owner-1", businessId: "biz-a", businessSlug: "tenant-a" };
const mutationCard = {
  id: 7,
  code: "GC-ABCDE",
  customer_name: "Ana",
  customer_email: "ana@example.com",
  customer_phone: null,
  expires_at: new Date("2030-01-01T00:00:00.000Z"),
  is_claimed: false,
  claimed_at: null,
  included_services: [{ service: { id: 1, name: "Massage" } }],
  included_packages: [],
};
const mutationData = {
  id: 7,
  code: "GC-ABCDE",
  recipientName: "Ana",
  recipientEmail: "ana@example.com",
  recipientPhone: null,
  expiresAt: "2030-01-01T00:00:00.000Z",
  claimedAt: null,
  status: "active",
  includedServices: [{ id: 1, name: "Massage" }],
  includedPackages: [],
};

describe("gift-card workflow invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "owner-1" } },
    });
    mocks.resolveTenantActorContext.mockResolvedValue(actor);
    mocks.businessFindFirst.mockResolvedValue({ id: "biz-a", name: "Salon A", slug: "tenant-a" });
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.getTenantAccessState.mockResolvedValue({ exists: true, readOnly: false });
    mocks.getServerSession.mockResolvedValue(null);
    mocks.giftCardFindUnique.mockResolvedValue(null);
    mocks.giftCardCreate.mockResolvedValue(mutationCard);
    mocks.giftCardUpdate.mockResolvedValue({ id: 7 });
    mocks.giftCardDeleteMany.mockResolvedValue({ count: 1 });
    mocks.giftCardServiceDeleteMany.mockResolvedValue({ count: 1 });
    mocks.giftCardServiceCreateMany.mockResolvedValue({ count: 1 });
    mocks.giftCardPackageDeleteMany.mockResolvedValue({ count: 0 });
    mocks.giftCardPackageCreateMany.mockResolvedValue({ count: 0 });
    mocks.sendEmail.mockResolvedValue({ success: true });
    mocks.sendSms.mockResolvedValue({ success: true });
    mocks.packageFindMany.mockResolvedValue([]);
    mocks.serviceFindMany.mockResolvedValue([]);
  });

  it("rejects a cross-tenant gift-card list before persistence", async () => {
    const result = await getGiftCards("tenant-b");

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.giftCardFindMany).not.toHaveBeenCalled();
  });

  it("rejects updating a card owned by another tenant", async () => {
    mocks.giftCardFindFirst.mockResolvedValue(null);

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

  it("returns the authoritative created bundle for optimistic reconciliation", async () => {
    mocks.serviceFindMany.mockResolvedValue([{ id: 1, name: "Massage" }]);

    await expect(createGiftCard({
      code: "GC-ABCDE",
      customer_name: "Ana",
      customer_email: "ana@example.com",
      expires_at: new Date("2030-01-01T00:00:00.000Z"),
      service_ids: [1],
      package_ids: [],
    })).resolves.toEqual({
      success: true,
      data: mutationData,
      channelOutcome: { smsAttempted: false, smsSucceeded: false, emailAttempted: true, emailSucceeded: true },
    });
  });

  it("returns the authoritative updated bundle and stable deleted id", async () => {
    mocks.serviceFindMany.mockResolvedValue([{ id: 1 }]);
    mocks.giftCardFindFirst
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mutationCard);

    await expect(updateGiftCard(7, {
      code: "GC-ABCDE",
      customer_name: "Ana",
      customer_email: "ana@example.com",
      expires_at: new Date("2030-01-01T00:00:00.000Z"),
      service_ids: [1],
      package_ids: [],
    })).resolves.toEqual({ success: true, data: mutationData });

    mocks.giftCardFindFirst.mockReset();
    await expect(deleteGiftCard(7)).resolves.toEqual({ success: true, data: { id: 7 } });
  });

  it("denies a stale actor and a membership revoked before the transaction write", async () => {
    mocks.resolveTenantActorContext.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    await expect(deleteGiftCard(7)).resolves.toEqual({ success: false, error: "Forbidden" });
    expect(mocks.businessFindFirst).not.toHaveBeenCalled();

    mocks.businessFindFirst.mockResolvedValueOnce(null);
    await expect(deleteGiftCard(7)).resolves.toEqual({ success: false, error: "Gift card not found or unauthorized" });
    expect(mocks.giftCardDeleteMany).not.toHaveBeenCalled();
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
